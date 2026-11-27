import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
  Activity,
  CalendarDays,
  CircleAlert,
  Coins,
  Layers3,
  RefreshCw,
  ShieldAlert,
  ShieldHalf,
  Swords,
  Users,
} from "lucide";
import { Icon } from "@/components/ui/icon";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { AttackLog } from "@/components/war-history/attack-log";
import { Chains } from "@/components/war-history/chains";
import { DayHeatmap, WarScoreMoves } from "@/components/war-history/charts";
import {
  formatRespect,
  formatSigned,
  formatWarDate,
  isWarOngoing,
  TIME_ZONES,
  timeZoneLabel,
  warEnd,
  warOpponent,
  warOutcome,
} from "@/components/war-history/format";
import { HitQuality } from "@/components/war-history/hit-quality";
import { AbsentMembers, MemberTable } from "@/components/war-history/members";
import { PlanningWindows } from "@/components/war-history/planning";
import { WarComparison } from "@/components/war-history/war-comparison";
import { WarPicker } from "@/components/war-history/war-picker";
import { Settings } from "@/domain/Settings";
import type { FactionAttack, FactionRankedWar } from "@/lib/faction";
import { memoizeLast } from "@/lib/memo";
import { dataOf, errorOf, isFetching } from "@/lib/result";
import {
  analyzeWar,
  bonusMarks,
  findAbsentMembers,
  respectTimeline,
  type RosterMember,
  summarizeAttacks,
} from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { RefreshWarReport } from "@/queries/refresh";
import { GetArmoryXanax, GetAttackHistory, GetOurFaction, GetRankedWars } from "@/queries/torn";
import { AppRoute } from "@/routes";

export const WarReportPageMessage = UiSchema.TaggedEnum({
  ChangedTimeZone: { value: Schema.String },
  RequestedWarSelection: { warIds: Schema.Array(Schema.Number) },
  ClickedRefresh: {},
});
type WarReportPageMessage = typeof WarReportPageMessage.Type;
type H = Html.H<WarReportPageMessage>;

const WarReportPageModel = Schema.Struct({
  timeZone: Schema.String,
  /** The wars picked, or null for the latest one. */
  selectedWarIds: Schema.NullOr(Schema.Array(Schema.Number)),
  /** Bumped by Refresh, so the attacks are fetched again past the browser cache. */
  refresh: Schema.Number,
});
type WarReportPageModel = typeof WarReportPageModel.Type;

const selectedWarsOf = (
  wars: ReadonlyArray<FactionRankedWar>,
  selected: ReadonlyArray<number> | null,
) => {
  if (selected === null) return wars.slice(0, 1);
  const ids = new Set(selected);
  return wars.filter((war) => ids.has(war.id));
};

const rangesOf = (wars: ReadonlyArray<FactionRankedWar>) =>
  wars.map((war) => ({ id: war.id, from: war.start, to: isWarOngoing(war) ? 0 : war.end + 1 }));

const rangesFor = (
  queries: { readonly wars: AsyncResult.AsyncResult<{ wars: FactionRankedWar[] }, string> },
  model: WarReportPageModel,
) => rangesOf(selectedWarsOf(dataOf(queries.wars)?.wars ?? [], model.selectedWarIds));

const WarReportPageDef = Html.component({
  name: "WarReportPage",
  props: Schema.Struct({ settings: Settings }),
  model: WarReportPageModel,
  message: WarReportPageMessage,
  queries: {
    wars: { query: GetRankedWars, args: ({ props }) => ({ key: props.settings.publicKey ?? "" }) },
    faction: {
      query: GetOurFaction,
      // Only once Torn answered: from the cache the roster would be just as unreachable.
      args: ({ props, queries }) =>
        dataOf(queries.wars)?.source === "network"
          ? { key: props.settings.publicKey ?? "" }
          : undefined,
    },
    attacks: {
      query: GetAttackHistory,
      args: ({ props, model, queries }) => {
        const ranges = rangesFor(queries, model);
        return ranges.length
          ? { key: props.settings.publicKey ?? "", ranges, refresh: model.refresh }
          : undefined;
      },
    },
    xanax: {
      query: GetArmoryXanax,
      args: ({ props, model, queries }) => {
        const ranges = rangesFor(queries, model);
        return ranges.length ? { key: props.settings.publicKey ?? "", ranges } : undefined;
      },
    },
  },
});

const rankedOnly = memoizeLast((attacks: ReadonlyArray<FactionAttack> | undefined) =>
  (attacks ?? []).filter((attack) => attack.is_ranked_war),
);
const rankedIncoming = memoizeLast((attacks: ReadonlyArray<FactionAttack> | undefined) =>
  (attacks ?? []).filter((attack) => attack.is_ranked_war),
);

type Range = { id: number; from: number; to: number };
const rangesKey = (ranges: ReadonlyArray<Range>) =>
  ranges.map((r) => `${r.id}:${r.from}:${r.to}`).join(",");

// Each analysis is kept until its attacks, war ranges or time zone change. The ranges come
// as their printed key, which keeps its identity across renders where the array would not.
const analyze = memoizeLast(
  (outgoing: FactionAttack[], incoming: FactionAttack[], key: string, timeZone: string) => {
    const ranges: Range[] = key
      ? key.split(",").map((part) => {
          const [id, from, to] = part.split(":").map(Number);
          return { id, from, to };
        })
      : [];
    return {
      analysis: analyzeWar({ outgoing, incoming, ranges, timeZone }),
      timeline: respectTimeline(outgoing, incoming, ranges),
      bonuses: bonusMarks(outgoing, ranges),
    };
  },
);

const Metric = (h: H, icon: typeof Activity, label: string, value: string, detail: string) =>
  h.div
    .class("border-l-2 border-primary/60 pl-3")
    .children(
      h.div
        .class(
          "mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground",
        )
        .children(Icon(h, icon, { class: "size-3.5" }), label),
      h.div.class("font-mono text-2xl font-semibold").children(value),
      h.div.class("mt-1 text-xs text-muted-foreground").children(detail),
    );

const Notice = (h: H, title: string, text: string) =>
  Card(h).children(
    CardContent(h, { class: "flex gap-3 py-5" }).children(
      Icon(h, CircleAlert, { class: "mt-0.5 size-5 shrink-0 text-muted-foreground" }),
      h.div.children(
        h.p.class("font-medium").children(title),
        h.p.class("mt-1 text-sm text-muted-foreground").children(text),
      ),
    ),
  );

const Record = (h: H, value: number, label: string, tone?: string) =>
  h.div.children(
    h.div.class(cn("text-2xl font-semibold tabular-nums", tone)).children(String(value)),
    h.div.class("text-[10px] uppercase text-muted-foreground").children(label),
  );

export const WarReportPage = WarReportPageDef.make({
  init: () => ({ timeZone: "local", selectedWarIds: null, refresh: 0 }),
  update: {
    ChangedTimeZone: ($, { value }) => $.evolve({ timeZone: value }),
    RequestedWarSelection: ($, { warIds }) => $.evolve({ selectedWarIds: warIds }),
    ClickedRefresh: ($) =>
      $.evolve({ refresh: (refresh) => refresh + 1 }).run(RefreshWarReport.make()),
  },
  view: (h, model) => {
    const { timeZone } = model;
    const q = h.queries;
    const warsResult = dataOf(q.wars);
    const wars = warsResult?.wars ?? [];
    const usingCachedWars = warsResult?.source === "cache";
    const faction = dataOf(q.faction)?.faction;
    const selectedWars = selectedWarsOf(wars, model.selectedWarIds);
    const attackRanges = rangesOf(selectedWars);
    const attackData = dataOf(q.attacks);
    // A war in progress is analysed up to when its attacks were last fetched.
    const fetchedAt = Math.floor(
      (AsyncResult.isSuccess(q.attacks) ? q.attacks.timestamp : Date.now()) / 1000,
    );
    const analysisRanges = attackRanges.map((range) =>
      range.to === 0 ? { ...range, to: fetchedAt } : range,
    );
    const outgoing = rankedOnly(attackData?.attacks);
    const incoming = rankedIncoming(attackData?.incoming);
    const { analysis, timeline, bonuses } = analyze(
      outgoing,
      incoming,
      rangesKey(analysisRanges),
      timeZone,
    );
    const warRows = selectedWars.map((war) => {
      const inWar = (attack: { ended: number }) =>
        attack.ended >= war.start && attack.ended <= warEnd(war, fetchedAt) + 1;
      return { war, totals: summarizeAttacks(outgoing.filter(inWar), incoming.filter(inWar)) };
    });

    const ownFactionId =
      faction?.ID ?? outgoing.find((attack) => attack.attacker?.faction)?.attacker?.faction?.id;
    const selectionStart = Math.min(...selectedWars.map((war) => war.start));
    const selectionEnd = Math.max(...selectedWars.map((war) => warEnd(war, fetchedAt)));
    const roster: RosterMember[] | null = faction?.members
      ? Object.entries(faction.members).map(([id, member]) => ({
          id: Number(id),
          name: member.name,
          position: member.position,
          daysInFaction: member.days_in_faction,
        }))
      : null;
    const absent = roster
      ? findAbsentMembers(
          roster,
          analysis.members,
          { from: selectionStart, to: selectionEnd },
          Date.now() / 1000,
        )
      : [];
    const absentThroughout = absent.filter((member) => member.joined === "before").length;
    const { totals } = analysis;

    const wins = selectedWars.filter((war) => warOutcome(war, ownFactionId) === "Victory").length;
    const losses = selectedWars.filter((war) => warOutcome(war, ownFactionId) === "Defeat").length;
    const ongoing = selectedWars.filter(isWarOngoing).length;
    const draws = selectedWars.length - wins - losses - ongoing;
    const hasWarResults = selectedWars.every((war) => war.target > 0);
    const firstWar = selectedWars[0];
    const firstOwnFaction = firstWar?.factions.find((entry) => entry.id === ownFactionId);
    const firstOpponent = firstWar ? warOpponent(firstWar, ownFactionId) : undefined;
    const warsPending = AsyncResult.isInitial(q.wars);
    const isPending =
      warsPending || Boolean(selectedWars.length && AsyncResult.isInitial(q.attacks));
    const fetching = isFetching(q.wars) || isFetching(q.attacks);
    const error = (!warsResult && errorOf(q.wars)) || (!attackData && errorOf(q.attacks));

    const header = h.section
      .class("mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end")
      .children(
        h.div.children(
          h.div
            .class(
              "mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary",
            )
            .children(Icon(h, Swords, { class: "size-4" }), "Faction intelligence"),
          h.h1
            .class("font-serif text-3xl font-semibold tracking-tight sm:text-4xl")
            .children("War report"),
          h.p
            .class("mt-2 max-w-2xl text-sm leading-6 text-muted-foreground")
            .children(
              "Combine one or more ranked wars, including one in progress. Only ranked-war attacks between your faction and the opponent are counted, in both directions.",
            ),
        ),
        h.div
          .class("grid gap-2 sm:grid-cols-[minmax(290px,1fr)_auto_auto_auto] sm:items-end")
          .children(
            WarPicker(h, {
              props: {
                wars,
                selectedIds: selectedWars.map((war) => war.id),
                ownFactionId: faction?.ID ?? null,
                timeZone,
              },
              onEmit: {
                RequestedSelection: ({ warIds }) =>
                  WarReportPageMessage.RequestedWarSelection({ warIds }),
              },
            }),
            h.label.class("grid gap-1 text-xs text-muted-foreground").children(
              "Display timezone",
              h.select
                .class(
                  "h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )
                .on("change", ({ value }) => WarReportPageMessage.ChangedTimeZone({ value }))
                .children(
                  TIME_ZONES.map((zone) =>
                    h.option
                      .key(zone.value)
                      .attr("value", zone.value)
                      .selected(zone.value === timeZone)
                      .children(zone.label),
                  ),
                ),
            ),
            Button(h, { variant: "outline" })
              .disabled(fetching)
              .on("click", WarReportPageMessage.ClickedRefresh())
              .children(Icon(h, RefreshCw, { class: cn(fetching && "animate-spin") }), "Refresh"),
            ButtonLink(
              h,
              AppRoute.print(
                AppRoute.WarPayout({ search: { wars: selectedWars.map((war) => war.id) } }),
              ),
              { variant: "outline" },
            ).children(Icon(h, Coins), "Payout"),
          ),
      );

    const body = error
      ? Card(h, { class: "border-destructive/50 bg-destructive/5" }).children(
          CardContent(h, { class: "flex gap-3 py-4" }).children(
            Icon(h, ShieldAlert, { class: "mt-0.5 size-5 shrink-0 text-destructive" }),
            h.div.children(
              h.p.class("font-medium").children("War history is unavailable"),
              h.p
                .class("mt-1 text-sm text-muted-foreground")
                .children(
                  `${error} The key needs Limited Access and the faction API Access permission.`,
                ),
            ),
          ),
        )
      : isPending
        ? h.div
            .class("grid min-h-72 place-items-center text-sm text-muted-foreground")
            .children(
              h.div
                .class("text-center")
                .children(
                  h.div
                    .class("flex items-center justify-center gap-2")
                    .children(
                      Icon(h, RefreshCw, { class: "size-4 animate-spin" }),
                      warsPending
                        ? "Loading ranked wars…"
                        : `Loading every attack from ${selectedWars.length} ${selectedWars.length === 1 ? "war" : "wars"}, both ways…`,
                    ),
                  !warsPending &&
                    h.p
                      .class("mt-2 text-xs")
                      .children(
                        "If Torn applies its request limit, loading pauses for 65 seconds before retrying.",
                      ),
                ),
            )
        : wars.length === 0
          ? Notice(
              h,
              "No ranked wars found",
              "Torn did not return any ranked wars for this faction.",
            )
          : h.div.class("space-y-4").children(
              usingCachedWars &&
                Notice(
                  h,
                  "Showing cached wars",
                  "Torn could not be reached, so the war list comes from this browser's cache. Wars that ended since the last visit are missing until Refresh succeeds.",
                ),
              selectedWars.length > 0
                ? Card(h, { class: "overflow-hidden border-primary/30 p-0" }).children(
                    h.div
                      .class(
                        "grid gap-4 bg-primary/[0.055] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6",
                      )
                      .children(
                        h.div.children(
                          h.p
                            .class(
                              "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground",
                            )
                            .children(
                              `${selectedWars.length} ranked ${selectedWars.length === 1 ? "war" : "wars"} · ${formatWarDate(
                                selectionStart,
                                timeZone,
                              )} to ${selectedWars.some(isWarOngoing) ? "now" : formatWarDate(selectionEnd, timeZone)}`,
                            ),
                          h.h2
                            .class("mt-2 font-serif text-2xl font-semibold sm:text-3xl")
                            .children(
                              selectedWars.length === 1
                                ? `${firstOwnFaction?.name ?? "Your faction"} vs ${firstOpponent?.name ?? "Opponent"}`
                                : `${selectedWars.length} wars combined`,
                            ),
                          h.p
                            .class("mt-2 text-xs text-muted-foreground")
                            .children(
                              `${outgoing.length.toLocaleString()} attacks made and ${incoming.length.toLocaleString()} received over ${analysis.liveHours} war hours`,
                            ),
                        ),
                        h.div
                          .class("border-l-2 border-primary/50 pl-4 font-mono")
                          .children(
                            hasWarResults
                              ? h.div.children(
                                  h.div
                                    .class(
                                      "mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground",
                                    )
                                    .children(
                                      Icon(h, Layers3, { class: "size-3.5" }),
                                      " Combined record",
                                    ),
                                  h.div
                                    .class("flex items-end gap-4")
                                    .children(
                                      Record(
                                        h,
                                        wins,
                                        "Wins",
                                        "text-emerald-600 dark:text-emerald-400",
                                      ),
                                      Record(h, losses, "Losses", "text-destructive"),
                                      draws > 0 && Record(h, draws, "Draws"),
                                      ongoing > 0 && Record(h, ongoing, "Ongoing", "text-primary"),
                                    ),
                                )
                              : h.div.children(
                                  h.div
                                    .class(
                                      "mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground",
                                    )
                                    .children(
                                      Icon(h, Layers3, { class: "size-3.5" }),
                                      " Local cache",
                                    ),
                                  h.div.class("text-sm").children("Final scores were not cached"),
                                ),
                          ),
                      ),
                  )
                : Notice(
                    h,
                    "Choose at least one war",
                    "Open the war selector and pick the wars to compare.",
                  ),
              selectedWars.length === 0
                ? null
                : outgoing.length === 0 && incoming.length === 0
                  ? Notice(
                      h,
                      "No ranked-war attacks found",
                      "Torn returned the war, but no attacks marked as ranked-war hits in either direction.",
                    )
                  : h.div.class("space-y-4").children(
                      Card(h, { class: "overflow-hidden p-0" }).children(
                        h.div
                          .class("grid gap-5 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4")
                          .children(
                            Metric(
                              h,
                              Swords,
                              "Successful hits",
                              totals.hits.toLocaleString(),
                              `${totals.attacks.toLocaleString()} attacks · ${totals.failed} wasted · ${totals.assists} assists`,
                            ),
                            Metric(
                              h,
                              Users,
                              "Participation",
                              roster
                                ? `${totals.attackers} / ${roster.length}`
                                : totals.attackers.toLocaleString(),
                              roster
                                ? `${absentThroughout} long-standing ${absentThroughout === 1 ? "member" : "members"} never scored`
                                : "members who attacked",
                            ),
                            Metric(
                              h,
                              Activity,
                              "Net respect",
                              formatSigned(totals.respect - totals.respectLost),
                              `${formatRespect(totals.respect)} gained · ${formatRespect(totals.respectLost)} lost`,
                            ),
                            Metric(
                              h,
                              ShieldHalf,
                              "Hits taken",
                              totals.hitsTaken.toLocaleString(),
                              `from ${totals.enemyAttackers} enemies · ${totals.defendsWon} of their attacks failed`,
                            ),
                          ),
                      ),
                      PlanningWindows(h, analysis.scheduleWindows, timeZone, incoming.length > 0),
                      Card(h).children(
                        CardContent(h, { class: "py-3" }).children(
                          WarScoreMoves(h, {
                            props: {
                              hours: analysis.hours,
                              timeline,
                              bonuses,
                              warStart: selectedWars.length === 1 ? selectedWars[0].start : null,
                              timeZone,
                            },
                          }),
                        ),
                      ),
                      Card(h).children(
                        CardHeader(h).children(
                          CardTitle(h, { class: "flex items-center gap-2" }).children(
                            Icon(h, CalendarDays, { class: "size-4 text-primary" }),
                            " Every war hour",
                          ),
                          h.p
                            .class("text-xs text-muted-foreground")
                            .children(`One row per day, ${timeZoneLabel(timeZone)}`),
                        ),
                        CardContent(h).children(DayHeatmap(h, { props: { days: analysis.days } })),
                      ),
                      HitQuality(h, analysis),
                      selectedWars.length > 1 && WarComparison(h, warRows, ownFactionId, timeZone),
                      MemberTable(h, {
                        props: {
                          members: analysis.members,
                          armoryXanax: dataOf(q.xanax) ?? null,
                          armoryXanaxError: errorOf(q.xanax) !== undefined,
                        },
                      }),
                      AbsentMembers(h, absent, roster !== null),
                      Chains(h, { props: { outgoing, incoming, timeZone } }),
                      AttackLog(h, { props: { outgoing, incoming, timeZone } }),
                    ),
            );

    return h.main
      .class("mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6")
      .children(header, body);
  },
});
