import { Command, Subscription, UiSchema, type View } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Effect, Schema, Stream } from "effect";
import { AsyncResult } from "effect/reactivity";
import { CircleAlert, Check, Copy, RefreshCw, ShieldAlert, Swords, Unlink } from "lucide";
import { copyText } from "@/components/communications-menu";
import { EnemyFactionSetup } from "@/components/enemy-faction-setup";
import { Icon } from "@/components/ui/icon";
import { Button, inputClass } from "@/components/ui/primitives";
import { Settings } from "@/domain/Settings";
import type { ActivityHour } from "@/lib/activity-tracking";
import type { Faction } from "@/lib/faction";
import type { FFScouterData, FFScouterMemberActivityBatch } from "@/lib/ffscouter";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { dataOf, errorOf } from "@/lib/result";
import { enemyFactionIdOf } from "@/lib/torn-api";
import { cn } from "@/lib/utils";
import {
  analyzeSide,
  formatStats,
  median,
  mergeObservations,
  nextOccurrence,
  observationsFromFFScouter,
  observationsFromRecorded,
  parseStats,
  type PlanMember,
  rankTargets,
  type SideAnalysis,
  type SuggestedWindow,
  suggestWindows,
  type Target,
  zonedParts,
} from "@/lib/war-plan";
import { buildPlanMessage } from "@/lib/war-plan-message";
import { GetRecordedActivity } from "@/queries/activity";
import { GetFFScouterStats, GetMemberActivity, playerIds, statsById } from "@/queries/ffscouter";
import { GetEnemyFaction, GetOurFaction } from "@/queries/torn";

const HOUR = 3_600_000;
const HISTORY_DAYS = 28;
// Below this, plans are hints rather than patterns.
const SOLID_DAYS = 7;
const TIMELINE_HOURS = 48;
const MEMBER_ACTIVITY_LIMIT = 100;
const ZONES = [
  { value: "UTC", label: "Torn time (TCT)", short: "TCT" },
  { value: Intl.DateTimeFormat().resolvedOptions().timeZone, label: "My timezone", short: "local" },
];
const SELECT_CLASS = "h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-ring";
const KIND = {
  push: { label: "Push", icon: Swords, tone: "text-emerald-600 dark:text-emerald-400" },
  defend: { label: "Expect hits", icon: ShieldAlert, tone: "text-rose-600 dark:text-rose-400" },
  chain: { label: "Chain risk", icon: Unlink, tone: "text-amber-600 dark:text-amber-400" },
  custom: { label: "Window", icon: Swords, tone: "text-muted-foreground" },
} as const;

export const WarPlanningPageMessage = UiSchema.TaggedEnum({
  Ticked: { now: Schema.Number },
  ChangedWindowLength: { value: Schema.String },
  ChangedTimeZone: { value: Schema.String },
  UpdatedCapInput: { value: Schema.String },
  ClickedWindow: { start: Schema.Number },
  ClickedTimelineHour: { hour: Schema.Number },
  ClickedCopyPlan: {},
  CompletedCopyPlan: {},
  CompletedWaitAfterCopy: { copiedAt: Schema.Number },
  ClickedShowAllTargets: {},
  ChangedOurFaction: {},
  ChangedEnemySetup: { settings: Settings },
});
type WarPlanningPageMessage = typeof WarPlanningPageMessage.Type;
type H = Html.H<WarPlanningPageMessage>;

export const WarPlanningPageEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const CopyPlan = Command.make("CopyPlan", { args: { text: Schema.String } }, ({ text }) =>
  copyText(text).pipe(Effect.as(WarPlanningPageMessage.CompletedCopyPlan())),
);

const WaitAfterCopy = Command.make(
  "WaitAfterCopy",
  { args: { copiedAt: Schema.Number } },
  ({ copiedAt }) =>
    Effect.sleep("2 seconds").pipe(
      Effect.as(WarPlanningPageMessage.CompletedWaitAfterCopy({ copiedAt })),
    ),
);

const WarPlanningPageModel = Schema.Struct({
  now: Schema.Number,
  /** The history the plan is built from, in milliseconds, fixed when the page opens. */
  range: Schema.Struct({ start: Schema.Number, end: Schema.Number }),
  timeZone: Schema.String,
  length: Schema.Number,
  capInput: Schema.String,
  selected: Schema.NullOr(Schema.Number),
  copiedAt: Schema.NullOr(Schema.Number),
  showAllTargets: Schema.Boolean,
});
type WarPlanningPageModel = typeof WarPlanningPageModel.Type;

type Range = WarPlanningPageModel["range"];

const factionArgs = (settings: Settings) => ({
  key: settings.publicKey ?? "",
});

const memberIds = (faction: Faction | undefined) =>
  playerIds(Object.keys(faction?.members ?? {}).map(Number));

const statsArgs = (settings: Settings, faction: Faction | undefined) => {
  const ids = memberIds(faction);
  return settings.ffscouterKey && ids.length ? { key: settings.ffscouterKey, ids } : undefined;
};

const activityArgs = (settings: Settings, faction: Faction | undefined, range: Range) => {
  const ids = memberIds(faction);
  return settings.ffscouterKey && ids.length
    ? {
        key: settings.ffscouterKey,
        playerIds: ids,
        start: range.start / 1000,
        end: range.end / 1000,
        limit: MEMBER_ACTIVITY_LIMIT,
      }
    : undefined;
};

const WarPlanningPageDef = Html.component({
  name: "WarPlanningPage",
  props: Schema.Struct({ settings: Settings }),
  model: WarPlanningPageModel,
  message: WarPlanningPageMessage,
  events: WarPlanningPageEvents,
  restore: (model): WarPlanningPageModel => ({ ...model, copiedAt: null }),
  queries: {
    ourFaction: {
      query: GetOurFaction,
      args: ({ props }) => factionArgs(props.settings),
      onChange: () => WarPlanningPageMessage.ChangedOurFaction(),
    },
    enemyFaction: {
      query: GetEnemyFaction,
      args: ({ props }) =>
        props.settings.enemyFactionId
          ? { ...factionArgs(props.settings), factionId: props.settings.enemyFactionId }
          : undefined,
    },
    ourStats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) => statsArgs(props.settings, dataOf(queries.ourFaction)?.faction),
    },
    enemyStats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) =>
        statsArgs(props.settings, dataOf(queries.enemyFaction)?.faction),
    },
    ourActivity: {
      query: GetMemberActivity,
      args: ({ props, model, queries }) =>
        activityArgs(props.settings, dataOf(queries.ourFaction)?.faction, model.range),
    },
    enemyActivity: {
      query: GetMemberActivity,
      args: ({ props, model, queries }) =>
        activityArgs(props.settings, dataOf(queries.enemyFaction)?.faction, model.range),
    },
    ourRecorded: {
      query: GetRecordedActivity,
      args: ({ queries }) => {
        const snapshot = dataOf(queries.ourFaction);
        return snapshot
          ? { factionId: snapshot.faction.ID, recordedAt: snapshot.fetchedAt }
          : undefined;
      },
    },
    enemyRecorded: {
      query: GetRecordedActivity,
      args: ({ queries }) => {
        const snapshot = dataOf(queries.enemyFaction);
        return snapshot
          ? { factionId: snapshot.faction.ID, recordedAt: snapshot.fetchedAt }
          : undefined;
      },
    },
  },
});

const toPlanMembers = (
  faction: Faction | undefined,
  stats: ReadonlyMap<number, { bs_estimate: number }>,
) =>
  Object.entries(faction?.members ?? {}).map(([id, member]): PlanMember => ({
    id: Number(id),
    name: member.name,
    level: member.level,
    bs: stats.get(Number(id))?.bs_estimate,
    state: member.status.state,
    until: member.status.until,
    description: member.status.description,
  }));

const sideOf = (
  faction: Faction | undefined,
  stats: ReturnType<typeof statsById>,
  activity: FFScouterMemberActivityBatch | undefined,
  recorded: ActivityHour[] | undefined,
  model: WarPlanningPageModel,
): SideAnalysis =>
  analyzeSide(
    toPlanMembers(faction, stats),
    mergeObservations(
      observationsFromFFScouter(activity?.members ?? [], model.range.start, model.range.end),
      observationsFromRecorded(recorded ?? []),
    ),
    model.timeZone,
    model.length,
  );

/** Everything the page shows about the plan, from the Model and the queries' latest data. */
const planOf = (
  model: WarPlanningPageModel,
  queries: {
    readonly ourFaction: AsyncResult.AsyncResult<{ faction: Faction }, string>;
    readonly enemyFaction: AsyncResult.AsyncResult<{ faction: Faction }, string>;
    readonly ourStats: AsyncResult.AsyncResult<ReadonlyArray<FFScouterData>, string>;
    readonly enemyStats: AsyncResult.AsyncResult<ReadonlyArray<FFScouterData>, string>;
    readonly ourActivity: AsyncResult.AsyncResult<FFScouterMemberActivityBatch, string>;
    readonly enemyActivity: AsyncResult.AsyncResult<FFScouterMemberActivityBatch, string>;
    readonly ourRecorded: AsyncResult.AsyncResult<ActivityHour[], string>;
    readonly enemyRecorded: AsyncResult.AsyncResult<ActivityHour[], string>;
  },
) => {
  const ourFaction = dataOf(queries.ourFaction)?.faction;
  const enemyFaction = dataOf(queries.enemyFaction)?.faction;
  const ours = sideOf(
    ourFaction,
    statsById(dataOf(queries.ourStats)),
    dataOf(queries.ourActivity),
    dataOf(queries.ourRecorded),
    model,
  );
  const theirs = sideOf(
    enemyFaction,
    statsById(dataOf(queries.enemyStats)),
    dataOf(queries.enemyActivity),
    dataOf(queries.enemyRecorded),
    model,
  );
  const suggestions =
    ours.covered && theirs.covered ? suggestWindows(ours, theirs, model.length) : [];
  const { now, timeZone, length } = model;
  const war = Object.values(ourFaction?.ranked_wars ?? {})[0]?.war;
  const warStart = war?.start ? war.start * 1000 : undefined;
  const warLive = warStart !== undefined && warStart <= now && !war?.end;
  // Plan for the war itself once one is scheduled.
  const planFrom = warStart && warStart > now ? warStart : now;
  const zone = ZONES.find((z) => z.value === timeZone) ?? ZONES[0];

  const start: number | undefined = model.selected ?? suggestions[0]?.start;
  const suggestion = suggestions.find((s) => s.start === start && s.kind !== "chain");
  const likely =
    start === undefined
      ? []
      : ours.members.filter((m, i) => m.bs && ours.presence[start][i].chance >= 0.5);
  const autoCap =
    start === undefined
      ? undefined
      : median((likely.length ? likely : ours.members).flatMap((m) => (m.bs ? [m.bs] : [])));
  const cap = parseStats(model.capInput) ?? autoCap;

  const formatAt = (at: number, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", ...options }).format(at);
  const describeWindow = (startHour: number, hours: number) => {
    const at = nextOccurrence(startHour, planFrom, timeZone);
    const delta = Math.round((at - now) / HOUR);
    return {
      at,
      text: `${formatAt(at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}–${formatAt(
        at + hours * HOUR,
        { hour: "2-digit", minute: "2-digit" },
      )} ${zone.short}`,
      relative: delta <= 0 ? "now" : `in ${delta}h`,
    };
  };

  const targets = start === undefined ? [] : rankTargets(theirs, start, cap);
  const threats =
    start === undefined
      ? []
      : theirs.members
          .filter((_, i) => theirs.presence[start][i].chance >= 0.5)
          .sort((a, b) => (b.bs ?? 0) - (a.bs ?? 0))
          .slice(0, 8);
  const ourPresence = (start === undefined ? [] : ours.members)
    .map((member, i) => ({ ...member, chance: ours.presence[start!][i].chance }))
    .sort((a, b) => (b.bs ?? 0) - (a.bs ?? 0));
  const likelyOn = ourPresence.filter((m) => m.chance >= 0.6);
  const toPing = ourPresence.filter((m) => m.chance >= 0.2 && m.chance < 0.6);
  const selectedWindow = start === undefined ? undefined : describeWindow(start, length);

  const planMessage =
    start === undefined || !selectedWindow
      ? undefined
      : buildPlanMessage({
          title: KIND[suggestion?.kind ?? "custom"].label,
          when: `${selectedWindow.text} (${selectedWindow.relative})`,
          ours: ours.windows[start].count,
          theirs: theirs.windows[start].count,
          theirStrength: theirs.windows[start].strength,
          cap,
          targets: targets.filter((t) => t.beatable).slice(0, 10),
          threats: threats.slice(0, 5),
          rally: toPing,
        });

  return {
    ourFaction,
    enemyFaction,
    ours,
    theirs,
    suggestions,
    warStart,
    warLive,
    zone,
    start,
    suggestion,
    autoCap,
    cap,
    formatAt,
    describeWindow,
    targets,
    threats,
    ourPresence,
    likelyOn,
    toPing,
    selectedWindow,
    planMessage,
  };
};
type Plan = ReturnType<typeof planOf>;

const dayCount = (days: number) => {
  const capped = Math.min(HISTORY_DAYS, days);
  return `${capped} ${capped === 1 ? "day" : "days"}`;
};

const Shell = (
  h: H,
  options: {
    readonly subtitle?: string | undefined;
    readonly controls?: View.Content<WarPlanningPageMessage, never>;
    readonly children: View.Content<WarPlanningPageMessage, never>;
  },
) =>
  h.main
    .class("mx-auto max-w-[1500px] px-3 pb-12 pt-6 sm:px-6")
    .children(
      h.div
        .class("mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5")
        .children(
          h.div.children(
            h.h1.class("text-3xl font-semibold tracking-tight").children("War planning"),
            h.p
              .class("mt-2 max-w-2xl text-sm text-muted-foreground")
              .children(options.subtitle ?? "When to hit, who to hit, and who needs to be online."),
          ),
          options.controls &&
            h.div.class("flex flex-wrap items-end gap-3").children(options.controls),
        ),
      options.children,
    );

const Notice = (h: H, title: string, text: string, destructive = false) =>
  h.div
    .attr("role", destructive ? "alert" : undefined)
    .class(
      cn(
        "flex gap-3 rounded-lg border p-5",
        destructive && "border-destructive/50 bg-destructive/5",
      ),
    )
    .children(
      Icon(h, CircleAlert, {
        class: cn("mt-0.5 size-5", destructive ? "text-destructive" : "text-muted-foreground"),
      }),
      h.div.children(
        h.p.class("font-medium").children(title),
        h.p.class("mt-1 text-sm text-muted-foreground").children(text),
      ),
    );

const DataQuality = (
  h: H,
  options: {
    readonly ours: SideAnalysis;
    readonly theirs: SideAnalysis;
    readonly days: number;
    readonly activityError: string | undefined;
    readonly missing: number;
  },
) => {
  const { ours, theirs, days, activityError, missing } = options;
  const hoursCovered = ours.hourly.filter(
    (hour, i) => hour.days > 0 && theirs.hourly[i].days > 0,
  ).length;
  const thin = days < SOLID_DAYS || hoursCovered < 20;
  const source = activityError
    ? "presence TornOps recorded in this browser"
    : "FFScouter activity plus presence TornOps recorded";
  return h.section
    .attr("aria-label", "Data behind this plan")
    .class(
      cn(
        "rounded-lg border px-4 py-3 text-sm",
        thin ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/30",
      ),
    )
    .children(
      h.p
        .class("flex items-start gap-2")
        .children(
          thin && Icon(h, CircleAlert, { class: "mt-0.5 size-4 shrink-0 text-amber-600" }),
          h.span.children(
            h.strong.children(
              days === 0
                ? "No activity recorded yet."
                : thin
                  ? "Limited data: treat suggestions as hints, not patterns."
                  : "Data behind this plan",
            ),
            ` Based on ${dayCount(days)} of ${source}, covering ${hoursCovered} of 24 hours of the day for both sides.`,
          ),
        ),
      h.ul
        .class("mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2")
        .children(
          h.li.children(
            `Them: ${dayCount(theirs.daysObserved)}, ${theirs.covered}/${theirs.members.length} members observed${
              missing && !activityError ? ` (${missing} could not be loaded)` : ""
            }`,
          ),
          h.li.children(
            `Us: ${dayCount(ours.daysObserved)}, ${ours.covered}/${ours.members.length} members observed`,
          ),
          h.li.children("Grey hours were never observed and are never suggested."),
          h.li.children("Each window shows how many days back it; 1–2 days can be a coincidence."),
        ),
      activityError &&
        h.details
          .class("mt-2 text-xs text-muted-foreground")
          .children(
            h.summary.class("cursor-pointer").children("How this data is gathered"),
            h.p
              .class("mt-1")
              .children(
                `FFScouter activity history is unavailable (${activityError}). Instead TornOps saves who is online whenever the war room, chain watcher or this page refreshes both factions: one snapshot a minute, kept for 30 days in this browser only. This keeps working in a background tab, but not when the browser is closed or the computer sleeps. Leaving a TornOps tab open fills the grey hours fastest. With FFScouter Premium you get 28 days of every hour immediately.`,
              ),
          ),
    );
};

const WindowCard = (
  h: H,
  suggestion: SuggestedWindow,
  when: { text: string; relative: string },
  active: boolean,
) => {
  const kind = KIND[suggestion.kind];
  const dataDays = Math.min(
    HISTORY_DAYS,
    suggestion.ours.days,
    suggestion.kind === "chain" ? Infinity : suggestion.theirs.days,
  );
  const detail =
    suggestion.kind === "chain"
      ? `Only ~${suggestion.ours.count.toFixed(1)} of us usually online. Line up chain watchers.`
      : `Us ~${suggestion.ours.count.toFixed(1)} · them ~${suggestion.theirs.count.toFixed(1)}${
          suggestion.theirs.strength ? ` (${formatStats(suggestion.theirs.strength)} stats)` : ""
        }`;
  return h.button
    .key(`${suggestion.kind}-${suggestion.start}`)
    .attrs({ type: "button", "aria-pressed": active ? "true" : "false" })
    .disabled(suggestion.kind === "chain")
    .on("click", WarPlanningPageMessage.ClickedWindow({ start: suggestion.start }))
    .class(
      cn(
        "rounded-lg border p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
        active && "border-primary ring-1 ring-primary",
      ),
    )
    .children(
      h.span
        .class(
          cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-wider", kind.tone),
        )
        .children(Icon(h, kind.icon, { class: "size-4" }), kind.label),
      h.span.class("mt-2 block font-mono text-lg font-semibold tabular-nums").children(when.text),
      h.span.class("text-xs text-muted-foreground").children(when.relative),
      h.span.class("mt-2 block text-sm").children(detail),
      h.span
        .class(
          cn(
            "mt-1 block text-xs",
            dataDays < 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          ),
        )
        .children(
          `From ${dataDays} ${dataDays === 1 ? "day" : "days"} of data${dataDays < 3 ? " · could be a coincidence" : ""}`,
        ),
    );
};

const Timeline = (h: H, plan: Plan, model: WarPlanningPageModel) => {
  const { ours, theirs, warStart, start: selected, formatAt } = plan;
  const { now, timeZone, length } = model;
  const first = Math.floor(now / HOUR) * HOUR;
  const slots = Array.from({ length: TIMELINE_HOURS }, (_, i) => {
    const at = first + i * HOUR;
    return { at, hour: zonedParts(at, timeZone).hour };
  });
  const ourMax = Math.max(1e-9, ...ours.hourly.map((hour) => hour.count));
  const theirMax = Math.max(1e-9, ...theirs.hourly.map((hour) => hour.count));
  const strengthMax = Math.max(1e-9, ...theirs.hourly.map((hour) => hour.strength));
  const useStrength = theirs.hourly.some((hour) => hour.strength > 0);
  const advantage = (hour: number) =>
    ours.hourly[hour].count / ourMax -
    (useStrength
      ? theirs.hourly[hour].strength / strengthMax
      : theirs.hourly[hour].count / theirMax);
  const inSelection = (hour: number) =>
    selected !== undefined && (hour - selected + 24) % 24 < length;
  const isWarStart = (at: number) =>
    warStart !== undefined && warStart >= at && warStart < at + HOUR;
  const rows: Array<{
    label: string;
    value: (hour: number) => string;
    color: (hour: number) => string;
    observed: (hour: number) => boolean;
  }> = [
    {
      label: "Us online",
      observed: (hour) => ours.hourly[hour].days > 0,
      value: (hour) => ours.hourly[hour].count.toFixed(0),
      color: (hour) => `rgb(16 185 129 / ${0.08 + (ours.hourly[hour].count / ourMax) * 0.6})`,
    },
    {
      label: "Them online",
      observed: (hour) => theirs.hourly[hour].days > 0,
      value: (hour) => theirs.hourly[hour].count.toFixed(0),
      color: (hour) => `rgb(244 63 94 / ${0.08 + (theirs.hourly[hour].count / theirMax) * 0.6})`,
    },
    {
      label: "Their stats",
      observed: (hour) => theirs.hourly[hour].days > 0,
      // Too wide for the cell; the colour carries it and the tooltip has the number.
      value: () => "",
      color: (hour) =>
        `rgb(244 63 94 / ${0.08 + (theirs.hourly[hour].strength / strengthMax) * 0.6})`,
    },
    {
      label: "Advantage",
      observed: (hour) => ours.hourly[hour].days > 0 && theirs.hourly[hour].days > 0,
      value: (hour) => (advantage(hour) > 0.15 ? "+" : advantage(hour) < -0.15 ? "−" : ""),
      color: (hour) =>
        advantage(hour) >= 0
          ? `rgb(16 185 129 / ${Math.min(0.75, advantage(hour))})`
          : `rgb(244 63 94 / ${Math.min(0.75, -advantage(hour))})`,
    },
  ];
  const grid = "grid grid-cols-[6.5rem_repeat(48,minmax(1.5rem,1fr))] gap-px";
  return h.section.class("overflow-hidden rounded-lg border").children(
    h.div
      .class("border-b px-5 py-4")
      .children(
        h.h2.class("font-semibold").children("Next 48 hours"),
        h.p
          .class("mt-1 text-xs text-muted-foreground")
          .children(
            "Expected members online each hour, from their usual pattern. Grey hours have no observations yet. Click an hour to plan a window starting there.",
          ),
      ),
    h.div.class("overflow-x-auto p-4").children(
      h.div.class("min-w-[1100px] text-[10px]").children(
        h.div.class(cn(grid, "mb-1 text-muted-foreground")).children(
          h.span,
          slots.map(({ at, hour }) =>
            h.span
              .key(String(at))
              .class(
                cn(
                  "text-center",
                  hour === 0 && "font-semibold text-foreground",
                  isWarStart(at) && "text-primary",
                ),
              )
              .children(
                hour === 0 ? formatAt(at, { weekday: "short" }) : String(hour).padStart(2, "0"),
              ),
          ),
        ),
        rows.map((row) =>
          h.div
            .key(row.label)
            .class(cn(grid, "mt-px items-center"))
            .children(
              h.span.class("pr-2 text-xs text-muted-foreground").children(row.label),
              slots.map(({ at, hour }) =>
                h.button
                  .key(String(at))
                  .attrs({
                    type: "button",
                    title: `${formatAt(at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}: ${
                      row.observed(hour)
                        ? `us ~${ours.hourly[hour].count.toFixed(1)}, them ~${theirs.hourly[hour].count.toFixed(1)} (${formatStats(theirs.hourly[hour].strength)}), ${Math.min(ours.hourly[hour].days, theirs.hourly[hour].days)} days of data`
                        : "no observations yet"
                    }`,
                  })
                  .on("click", WarPlanningPageMessage.ClickedTimelineHour({ hour }))
                  .class(
                    cn(
                      "h-7 cursor-pointer tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
                      inSelection(hour) && "outline-2 -outline-offset-2 outline-primary",
                      isWarStart(at) && "border-l-2 border-primary",
                      hour === 0 && "border-l border-foreground/30",
                      !row.observed(hour) && "bg-muted",
                    ),
                  )
                  .style({ backgroundColor: row.observed(hour) && row.color(hour) })
                  .children(row.observed(hour) ? row.value(hour) : ""),
              ),
            ),
        ),
      ),
    ),
  );
};

const statusText = (member: PlanMember, now: number, formatAt: Plan["formatAt"]) => {
  if (member.state === "Hospital" && member.until * 1000 > now)
    return `Hospital until ${formatAt(member.until * 1000, { hour: "2-digit", minute: "2-digit" })}`;
  if (member.state === "Okay") return "Okay";
  return member.description;
};

const TargetList = (
  h: H,
  targets: Target[],
  model: WarPlanningPageModel,
  formatAt: Plan["formatAt"],
) => {
  const shown = model.showAllTargets ? targets : targets.slice(0, 15);
  return h.div.children(
    h.div
      .class("px-5 pt-4")
      .children(
        h.h3
          .class("font-semibold")
          .children(`Targets (${targets.filter((t) => t.beatable).length} beatable)`),
        h.p
          .class("mt-1 text-xs text-muted-foreground")
          .children(
            "Usually offline in this window, so no retaliation or quick revive. Beatable first, then most reliably offline.",
          ),
      ),
    targets.length
      ? h.div.class("overflow-x-auto").children(
          h.table.class("mt-3 w-full min-w-[560px] text-left text-sm").children(
            h.thead
              .class("bg-muted/30 text-xs text-muted-foreground")
              .children(
                h.tr.children(
                  h.th.class("px-5 py-2 font-medium").children("Target"),
                  h.th.class("px-3 py-2 font-medium").children("Stats est."),
                  h.th.class("px-3 py-2 font-medium").children("Offline"),
                  h.th.class("px-3 py-2 font-medium").children("Now"),
                  h.th.class("px-5 py-2"),
                ),
              ),
            h.tbody.class("divide-y").children(
              shown.map((target) =>
                h.tr
                  .key(String(target.id))
                  .class(cn(!target.beatable && "text-muted-foreground"))
                  .children(
                    h.td.class("px-5 py-2").children(
                      h.a
                        .attrs({
                          href: playerProfileLink(target.id),
                          target: "_blank",
                          rel: "noreferrer",
                        })
                        .class("font-medium hover:underline")
                        .children(target.name),
                      h.span
                        .class("ml-2 text-xs text-muted-foreground")
                        .children(`Lv ${target.level}`),
                    ),
                    h.td
                      .class("px-3 py-2 tabular-nums")
                      .children(
                        formatStats(target.bs),
                        !target.beatable && h.span.class("ml-1 text-xs").children("(too strong)"),
                      ),
                    h.td
                      .class("px-3 py-2 tabular-nums")
                      .children(
                        `${Math.round(target.offline * 100)}%`,
                        h.span
                          .class("ml-1 text-xs text-muted-foreground")
                          .children(`of ${Math.min(HISTORY_DAYS, target.daysObserved)}d`),
                      ),
                    h.td
                      .class("px-3 py-2 text-xs")
                      .children(statusText(target, model.now, formatAt)),
                    h.td.class("px-5 py-2 text-right").children(
                      h.a
                        .attrs({
                          href: playerAttackLink(target.id),
                          target: "_blank",
                          rel: "noreferrer",
                        })
                        .class("text-xs font-medium text-primary hover:underline")
                        .children("Attack"),
                    ),
                  ),
              ),
            ),
          ),
          targets.length > shown.length &&
            Button(h, { variant: "ghost", size: "sm", class: "m-3" })
              .on("click", WarPlanningPageMessage.ClickedShowAllTargets())
              .children(`Show all ${targets.length}`),
        )
      : h.p
          .class("p-5 text-sm text-muted-foreground")
          .children("No enemies are reliably offline in this window."),
  );
};

const MemberList = (
  h: H,
  options: {
    readonly title: string;
    readonly hint: string;
    readonly members: ReadonlyArray<PlanMember & { chance?: number }>;
    readonly showChance: boolean;
    readonly empty: string;
  },
) =>
  h.div.class("p-5").children(
    h.h3.class("font-semibold").children(options.title),
    h.p.class("mt-1 text-xs text-muted-foreground").children(options.hint),
    options.members.length
      ? h.ul.class("mt-3 space-y-1.5 text-sm").children(
          options.members.map((member) =>
            h.li
              .key(String(member.id))
              .class("flex items-center justify-between gap-3")
              .children(
                h.a
                  .attrs({
                    href: playerProfileLink(member.id),
                    target: "_blank",
                    rel: "noreferrer",
                  })
                  .class("truncate hover:underline")
                  .children(member.name),
                h.span
                  .class("shrink-0 text-xs tabular-nums text-muted-foreground")
                  .children(
                    `${formatStats(member.bs)}${
                      options.showChance && member.chance !== undefined
                        ? ` · on ${Math.round(member.chance * 100)}%`
                        : ""
                    }`,
                  ),
              ),
          ),
        )
      : h.p.class("mt-3 text-sm text-muted-foreground").children(options.empty),
  );

const change = (settings: Settings) => WarPlanningPageEvents.RequestedSettingsChange({ settings });

export const WarPlanningPage = WarPlanningPageDef.make({
  init: () => {
    const now = Date.now();
    const end = Math.floor(now / HOUR) * HOUR;
    return {
      now,
      range: { start: end - HISTORY_DAYS * 24 * HOUR, end },
      timeZone: "UTC",
      length: 3,
      capInput: "",
      selected: null,
      copiedAt: null,
      showAllTargets: false,
    };
  },
  update: {
    Ticked: ($, { now }) => $.evolve({ now }),
    ChangedWindowLength: ($, { value }) => {
      const length = Number(value);
      return Number.isFinite(length) && length > 0 ? $.evolve({ length }) : $.model;
    },
    ChangedTimeZone: ($, { value }) => $.evolve({ timeZone: value }),
    UpdatedCapInput: ($, { value }) => $.evolve({ capInput: value }),
    ClickedWindow: ($, { start }) => $.evolve({ selected: start }),
    ClickedTimelineHour: ($, { hour }) => $.evolve({ selected: hour }),
    ClickedCopyPlan: ($) => {
      const text = planOf($.model, $.queries).planMessage;
      return text === undefined ? $.model : $.run(CopyPlan.make({ text }));
    },
    CompletedCopyPlan: ($) => {
      const copiedAt = Date.now();
      return $.evolve({ copiedAt }).run(WaitAfterCopy.make({ copiedAt }));
    },
    CompletedWaitAfterCopy: ($, { copiedAt }) =>
      $.model.copiedAt === copiedAt ? $.evolve({ copiedAt: null }) : $.model,
    ClickedShowAllTargets: ($) => $.evolve({ showAllTargets: true }),
    // Our ranked war names the enemy, so planning follows the war that is coming.
    ChangedOurFaction: ($) => {
      const faction = dataOf($.queries.ourFaction)?.faction;
      const enemyId = faction ? enemyFactionIdOf(faction) : undefined;
      return enemyId !== undefined && enemyId !== $.props.settings.enemyFactionId
        ? $.emit(change({ ...$.props.settings, enemyFactionId: enemyId }))
        : $.model;
    },
    ChangedEnemySetup: ($, { settings }) => $.emit(change(settings)),
  },
  subscriptions: () => [
    Subscription.make(
      "clock",
      Stream.tick("1 minute").pipe(
        Stream.map(() => WarPlanningPageMessage.Ticked({ now: Date.now() })),
      ),
    ),
  ],
  view: (h, model) => {
    const { settings } = h.props;
    if (!settings.ffscouterKey)
      return Shell(h, {
        children: Notice(
          h,
          "Add an FFScouter API key",
          "War planning uses FFScouter activity history and battle stat estimates. Open settings and add a Premium key.",
        ),
      });
    if (!settings.enemyFactionId)
      return Shell(h, {
        children: EnemyFactionSetup(h, {
          props: { settings },
          onEmit: {
            RequestedSettingsChange: ({ settings }) =>
              WarPlanningPageMessage.ChangedEnemySetup({ settings }),
          },
        }),
      });

    const plan = planOf(model, h.queries);
    const { ours, theirs, start, selectedWindow, suggestion, warStart, warLive, zone, formatAt } =
      plan;
    const { now } = model;
    const q = h.queries;
    const loading =
      AsyncResult.isInitial(q.ourFaction) ||
      AsyncResult.isInitial(q.enemyFaction) ||
      (AsyncResult.isInitial(q.ourActivity) && q.ourActivity.waiting) ||
      (AsyncResult.isInitial(q.enemyActivity) && q.enemyActivity.waiting);
    const error =
      (!plan.ourFaction && errorOf(q.ourFaction)) ||
      (!plan.enemyFaction && errorOf(q.enemyFaction));
    const enemyActivity = dataOf(q.enemyActivity);
    // Without FFScouter activity (e.g. no Premium) we still plan from presence TornOps recorded.
    const activityError =
      errorOf(q.ourActivity) ??
      errorOf(q.enemyActivity) ??
      (enemyActivity && !enemyActivity.members.length ? enemyActivity.firstError : undefined);
    const statsError = errorOf(q.enemyStats) ?? errorOf(q.ourStats);
    const days = Math.min(ours.daysObserved, theirs.daysObserved);
    const missing = [
      ...(enemyActivity?.failedPlayerIds ?? []),
      ...(enemyActivity?.omittedPlayerIds ?? []),
    ].length;
    const copied = model.copiedAt !== null;

    const controls = h.div.class("contents").children(
      h.label.class("grid gap-1 text-xs text-muted-foreground").children(
        "Window",
        h.select
          .class(SELECT_CLASS)
          .on("change", ({ value }) => WarPlanningPageMessage.ChangedWindowLength({ value }))
          .children(
            [1, 2, 3, 4, 6].map((hours) =>
              h.option
                .key(String(hours))
                .attr("value", String(hours))
                .selected(hours === model.length)
                .children(`${hours} ${hours === 1 ? "hour" : "hours"}`),
            ),
          ),
      ),
      h.label.class("grid gap-1 text-xs text-muted-foreground").children(
        "Timezone",
        h.select
          .class(SELECT_CLASS)
          .on("change", ({ value }) => WarPlanningPageMessage.ChangedTimeZone({ value }))
          .children(
            ZONES.map((z) =>
              h.option
                .key(z.value)
                .attr("value", z.value)
                .selected(z.value === model.timeZone)
                .children(z.label),
            ),
          ),
      ),
    );

    const body = error
      ? Notice(
          h,
          "Planning data is unavailable",
          `FFScouter: ${error}. Check the FFScouter key in settings; activity history requires FFScouter Premium.`,
          true,
        )
      : loading
        ? h.div
            .class("flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground")
            .children(
              Icon(h, RefreshCw, { class: "size-4 animate-spin" }),
              `Loading ${HISTORY_DAYS} days of activity for both factions… this takes a moment.`,
            )
        : h.div.class("space-y-5").children(
            DataQuality(h, { ours, theirs, days, activityError, missing }),
            statsError &&
              h.p
                .attr("role", "alert")
                .class("text-sm text-destructive")
                .children(
                  `Battle stat estimates are unavailable (${statsError}). Targets are not filtered by strength.`,
                ),
            warStart !== undefined &&
              (warStart > now || warLive) &&
              h.div
                .class("rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm")
                .children(
                  h.strong.children(`Ranked war ${warLive ? "is live" : "starts"}`),
                  ` ${formatAt(warStart, { weekday: "short", hour: "2-digit", minute: "2-digit" })} ${zone.short}`,
                  !warLive &&
                    h.span
                      .class("text-muted-foreground")
                      .children(
                        ` · in ${Math.round((warStart - now) / HOUR)}h. Windows below are the first ones after the start.`,
                      ),
                ),
            h.section
              .attr("aria-label", "Suggested windows")
              .class("grid gap-3 md:grid-cols-2 xl:grid-cols-4")
              .children(
                plan.suggestions.map((s) =>
                  WindowCard(
                    h,
                    s,
                    plan.describeWindow(s.start, s.length),
                    s.kind !== "chain" && s.start === start,
                  ),
                ),
              ),
            Timeline(h, plan, model),
            start !== undefined &&
              selectedWindow &&
              h.section.class("rounded-lg border").children(
                h.div.class("flex flex-wrap items-end justify-between gap-3 border-b p-5").children(
                  h.div.children(
                    h.p
                      .class(
                        cn(
                          "text-xs font-semibold uppercase tracking-wider",
                          KIND[suggestion?.kind ?? "custom"].tone,
                        ),
                      )
                      .children(KIND[suggestion?.kind ?? "custom"].label),
                    h.h2
                      .class("mt-1 text-xl font-semibold")
                      .children(
                        `${selectedWindow.text} `,
                        h.span
                          .class("text-sm font-normal text-muted-foreground")
                          .children(selectedWindow.relative),
                      ),
                    h.p
                      .class("mt-1 text-sm text-muted-foreground")
                      .children(
                        `Expected online: us ~${ours.windows[start].count.toFixed(1)} · them ~${theirs.windows[start].count.toFixed(1)}${
                          theirs.windows[start].strength > 0
                            ? ` (${formatStats(theirs.windows[start].strength)} stats)`
                            : ""
                        }`,
                      ),
                  ),
                  h.div.class("flex flex-wrap items-end gap-2").children(
                    h.label.class("grid gap-1 text-xs text-muted-foreground").children(
                      "Beatable up to",
                      h.input
                        .attrs({
                          placeholder: `auto · ${formatStats(plan.autoCap)}`,
                          "aria-describedby": "cap-help",
                        })
                        .class(inputClass("w-36"))
                        .value(model.capInput)
                        .on("input", ({ value }) =>
                          WarPlanningPageMessage.UpdatedCapInput({ value }),
                        ),
                    ),
                    Button(h)
                      .on("click", WarPlanningPageMessage.ClickedCopyPlan())
                      .children(
                        Icon(h, copied ? Check : Copy),
                        copied ? "Copied" : "Copy plan for chat",
                      ),
                  ),
                ),
                h.p
                  .id("cap-help")
                  .class("border-b px-5 py-2 text-xs text-muted-foreground")
                  .children(
                    "Auto uses the median battle stat estimate of our members usually online in this window. Type a value like 1.5b to override.",
                  ),
                h.div
                  .class("grid divide-y lg:grid-cols-[2fr_1fr] lg:divide-x lg:divide-y-0")
                  .children(
                    TargetList(h, plan.targets, model, formatAt),
                    h.div.class("divide-y").children(
                      MemberList(h, {
                        title: "Their threats online",
                        hint: "Usually online in this window, strongest first. Expect retaliation from these.",
                        members: plan.threats,
                        showChance: false,
                        empty: "None of them are usually online in this window.",
                      }),
                      MemberList(h, {
                        title: `Ping these (${plan.toPing.length})`,
                        hint: `Sometimes online then. ${plan.likelyOn.length} of ours are usually on already.`,
                        members: plan.toPing,
                        showChance: true,
                        empty: "Nobody else is likely to come online in this window.",
                      }),
                    ),
                  ),
              ),
          );

    return Shell(h, {
      subtitle:
        plan.enemyFaction && plan.ourFaction
          ? `${plan.ourFaction.name} vs ${plan.enemyFaction.name}: when to hit, who to hit, and who needs to be online.`
          : undefined,
      controls,
      children: body,
    });
  },
});
