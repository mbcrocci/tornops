import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Copy, RefreshCw, ShieldAlert, Swords, Unlink } from "lucide-react";
import { EnemyFactionEmptyState } from "@/components/enemy-faction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFFScouterData, useFFScouterMemberActivity } from "@/hooks/use-ffscouter";
import { useEnemyFactionData, useUserFaction } from "@/hooks/use-torn";
import { readActivity } from "@/lib/activity-tracking";
import type { Faction } from "@/lib/faction";
import { usePresenceHistoryState } from "@/lib/faction-presence";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";
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
  zonedParts,
} from "@/lib/war-plan";
import { buildPlanMessage } from "@/lib/war-plan-message";

const HOUR = 3_600_000;
const HISTORY_DAYS = 28;
// Below this, plans are hints rather than patterns.
const SOLID_DAYS = 7;
const TIMELINE_HOURS = 48;
const ZONES = [
  { value: "UTC", label: "Torn time (TCT)", short: "TCT" },
  {
    value: Intl.DateTimeFormat().resolvedOptions().timeZone,
    label: "My timezone",
    short: "local",
  },
];
const selectClass = "h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-ring";
const KIND = {
  push: { label: "Push", icon: Swords, tone: "text-emerald-600 dark:text-emerald-400" },
  defend: { label: "Expect hits", icon: ShieldAlert, tone: "text-rose-600 dark:text-rose-400" },
  chain: { label: "Chain risk", icon: Unlink, tone: "text-amber-600 dark:text-amber-400" },
  custom: { label: "Window", icon: Swords, tone: "text-muted-foreground" },
} as const;

function toPlanMembers(faction: Faction | null | undefined, stats: Map<number, number>) {
  return Object.entries(faction?.members ?? {}).map(([id, member]): PlanMember => ({
    id: Number(id),
    name: member.name,
    level: member.level,
    bs: stats.get(Number(id)),
    state: member.status.state,
    until: member.status.until,
    description: member.status.description,
  }));
}

function useSideData(faction: Faction | null | undefined, range: { start: number; end: number }) {
  const ids = useMemo(() => Object.keys(faction?.members ?? {}).map(Number), [faction?.members]);
  const stats = useFFScouterData(ids);
  const activity = useFFScouterMemberActivity(
    ids,
    range.start / 1000,
    range.end / 1000,
    ids.length > 0,
    100,
  );
  const revision = usePresenceHistoryState((state) => state.revision);
  const client = useQueryClient();
  const recorded = useQuery({
    queryKey: ["tracked-activity", faction?.ID],
    queryFn: () => readActivity(faction!.ID),
    enabled: Boolean(faction?.ID),
  });
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ["tracked-activity"] });
  }, [revision, client]);
  const members = useMemo(() => {
    const byId = new Map((stats.data ?? []).map((row) => [row.player_id, row.bs_estimate]));
    return toPlanMembers(faction, byId);
  }, [faction, stats.data]);
  const observations = useMemo(
    () =>
      mergeObservations(
        observationsFromFFScouter(activity.data?.members ?? [], range.start, range.end),
        observationsFromRecorded(recorded.data ?? []),
      ),
    [activity.data, recorded.data, range],
  );
  return { members, observations, activity, stats };
}

export function WarPlanning() {
  const ffscouterKey = useCredentialsStore((state) => state.ffscouterKey);
  const enemyFactionId = useGlobalStore((state) => state.enemyFactionId);
  const ourFaction = useUserFaction();
  const enemyFaction = useEnemyFactionData();
  const [range] = useState(() => {
    const end = Math.floor(Date.now() / HOUR) * HOUR;
    return { start: end - HISTORY_DAYS * 24 * HOUR, end };
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [timeZone, setTimeZone] = useState("UTC");
  const [length, setLength] = useState(3);
  const [capInput, setCapInput] = useState("");
  const [selected, setSelected] = useState<number>();
  const [copied, setCopied] = useState(false);

  const enemy = enemyFaction.data && !("error" in enemyFaction.data) ? enemyFaction.data : null;
  const us = useSideData(ourFaction.data, range);
  const them = useSideData(enemy, range);

  const ours = useMemo(
    () => analyzeSide(us.members, us.observations, timeZone, length),
    [us.members, us.observations, timeZone, length],
  );
  const theirs = useMemo(
    () => analyzeSide(them.members, them.observations, timeZone, length),
    [them.members, them.observations, timeZone, length],
  );
  const suggestions = useMemo(
    () => (ours.covered && theirs.covered ? suggestWindows(ours, theirs, length) : []),
    [ours, theirs, length],
  );

  const war = Object.values(ourFaction.data?.ranked_wars ?? {})[0]?.war;
  const warStart = war?.start ? war.start * 1000 : undefined;
  const warLive = warStart !== undefined && warStart <= now && !war?.end;
  // Plan for the war itself once one is scheduled.
  const planFrom = warStart && warStart > now ? warStart : now;
  const zone = ZONES.find((z) => z.value === timeZone) ?? ZONES[0];

  const start = selected ?? suggestions[0]?.start;
  const suggestion = suggestions.find((s) => s.start === start && s.kind !== "chain");
  const autoCap = useMemo(() => {
    if (start === undefined) return undefined;
    const likely = ours.members.filter((m, i) => m.bs && ours.presence[start][i].chance >= 0.5);
    return median((likely.length ? likely : ours.members).flatMap((m) => (m.bs ? [m.bs] : [])));
  }, [ours, start]);
  const cap = parseStats(capInput) ?? autoCap;

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

  if (!ffscouterKey) {
    return (
      <Shell>
        <Notice title="Add an FFScouter API key">
          War planning uses FFScouter activity history and battle stat estimates. Open settings and
          add a Premium key.
        </Notice>
      </Shell>
    );
  }
  if (!enemyFactionId) {
    return (
      <Shell>
        <EnemyFactionEmptyState />
      </Shell>
    );
  }

  const loading =
    ourFaction.isPending ||
    enemyFaction.isPending ||
    us.activity.isPending ||
    them.activity.isPending;
  const error = ourFaction.error ?? enemyFaction.error;
  // Without FFScouter activity (e.g. no Premium) we still plan from presence TornOps recorded.
  const activityError =
    us.activity.error?.message ??
    them.activity.error?.message ??
    (them.activity.data && !them.activity.data.members.length
      ? them.activity.data.firstError
      : undefined);
  const statsError = them.stats.error ?? us.stats.error;
  const days = Math.min(ours.daysObserved, theirs.daysObserved);
  const missing = [
    ...(them.activity.data?.failedPlayerIds ?? []),
    ...(them.activity.data?.omittedPlayerIds ?? []),
  ].length;

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

  async function copyPlan() {
    if (start === undefined || !selectedWindow) return;
    await navigator.clipboard.writeText(
      buildPlanMessage({
        title: KIND[suggestion?.kind ?? "custom"].label,
        when: `${selectedWindow.text} (${selectedWindow.relative})`,
        ours: ours.windows[start].count,
        theirs: theirs.windows[start].count,
        theirStrength: theirs.windows[start].strength,
        cap,
        targets: targets.filter((t) => t.beatable).slice(0, 10),
        threats: threats.slice(0, 5),
        rally: toPing,
      }),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Shell
      subtitle={
        enemy && ourFaction.data
          ? `${ourFaction.data.name} vs ${enemy.name}: when to hit, who to hit, and who needs to be online.`
          : undefined
      }
      controls={
        <>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Window
            <select
              className={selectClass}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 6].map((hours) => (
                <option key={hours} value={hours}>
                  {hours} {hours === 1 ? "hour" : "hours"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Timezone
            <select
              className={selectClass}
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      {error ? (
        <Notice title="Planning data is unavailable" destructive>
          FFScouter: {error.message}. Check the FFScouter key in settings; activity history requires
          FFScouter Premium.
        </Notice>
      ) : loading ? (
        <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Loading {HISTORY_DAYS} days of activity for both factions… this takes a moment.
        </div>
      ) : (
        <div className="space-y-5">
          <DataQuality
            ours={ours}
            theirs={theirs}
            days={days}
            activityError={activityError}
            missing={missing}
          />

          {statsError && (
            <p role="alert" className="text-sm text-destructive">
              Battle stat estimates are unavailable ({statsError.message}). Targets are not filtered
              by strength.
            </p>
          )}

          {warStart && (warStart > now || warLive) && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <strong>Ranked war {warLive ? "is live" : "starts"}</strong>{" "}
              {formatAt(warStart, { weekday: "short", hour: "2-digit", minute: "2-digit" })}{" "}
              {zone.short}
              {!warLive && (
                <span className="text-muted-foreground">
                  {" "}
                  · in {Math.round((warStart - now) / HOUR)}h. Windows below are the first ones
                  after the start.
                </span>
              )}
            </div>
          )}

          <section
            aria-label="Suggested windows"
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          >
            {suggestions.map((s) => (
              <WindowCard
                key={`${s.kind}-${s.start}`}
                suggestion={s}
                when={describeWindow(s.start, s.length)}
                active={s.kind !== "chain" && s.start === start}
                onSelect={() => setSelected(s.start)}
              />
            ))}
          </section>

          <Timeline
            ours={ours}
            theirs={theirs}
            now={now}
            timeZone={timeZone}
            warStart={warStart}
            selected={start}
            length={length}
            formatAt={formatAt}
            onSelect={setSelected}
          />

          {start !== undefined && selectedWindow && (
            <section className="rounded-lg border">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5">
                <div>
                  <p
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      KIND[suggestion?.kind ?? "custom"].tone,
                    )}
                  >
                    {KIND[suggestion?.kind ?? "custom"].label}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selectedWindow.text}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {selectedWindow.relative}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Expected online: us ~{ours.windows[start].count.toFixed(1)} · them ~
                    {theirs.windows[start].count.toFixed(1)}
                    {theirs.windows[start].strength > 0 &&
                      ` (${formatStats(theirs.windows[start].strength)} stats)`}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Beatable up to
                    <Input
                      className="w-36"
                      placeholder={`auto · ${formatStats(autoCap)}`}
                      value={capInput}
                      onChange={(event) => setCapInput(event.target.value)}
                      aria-describedby="cap-help"
                    />
                  </label>
                  <Button onClick={copyPlan}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy plan for chat"}
                  </Button>
                </div>
              </div>
              <p id="cap-help" className="border-b px-5 py-2 text-xs text-muted-foreground">
                Auto uses the median battle stat estimate of our members usually online in this
                window. Type a value like 1.5b to override.
              </p>
              <div className="grid divide-y lg:grid-cols-[2fr_1fr] lg:divide-x lg:divide-y-0">
                <TargetList targets={targets} now={now} formatAt={formatAt} />
                <div className="divide-y">
                  <MemberList
                    title="Their threats online"
                    hint="Usually online in this window, strongest first. Expect retaliation from these."
                    members={threats}
                    empty="None of them are usually online in this window."
                  />
                  <MemberList
                    title={`Ping these (${toPing.length})`}
                    hint={`Sometimes online then. ${likelyOn.length} of ours are usually on already.`}
                    members={toPing}
                    chance={(m) => ourPresence.find((p) => p.id === m.id)?.chance}
                    empty="Nobody else is likely to come online in this window."
                  />
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}

function dayCount(days: number) {
  const capped = Math.min(HISTORY_DAYS, days);
  return `${capped} ${capped === 1 ? "day" : "days"}`;
}

function DataQuality({
  ours,
  theirs,
  days,
  activityError,
  missing,
}: {
  ours: SideAnalysis;
  theirs: SideAnalysis;
  days: number;
  activityError?: string;
  missing: number;
}) {
  const hoursCovered = ours.hourly.filter(
    (hour, i) => hour.days > 0 && theirs.hourly[i].days > 0,
  ).length;
  const thin = days < SOLID_DAYS || hoursCovered < 20;
  const source = activityError
    ? "presence TornOps recorded in this browser"
    : "FFScouter activity plus presence TornOps recorded";
  return (
    <section
      aria-label="Data behind this plan"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        thin ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/30",
      )}
    >
      <p className="flex items-start gap-2">
        {thin && <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
        <span>
          <strong>
            {days === 0
              ? "No activity recorded yet."
              : thin
                ? "Limited data: treat suggestions as hints, not patterns."
                : "Data behind this plan"}
          </strong>{" "}
          Based on {dayCount(days)} of {source}, covering {hoursCovered} of 24 hours of the day for
          both sides.
        </span>
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <li>
          Them: {dayCount(theirs.daysObserved)}, {theirs.covered}/{theirs.members.length} members
          observed
          {missing && !activityError ? ` (${missing} could not be loaded)` : ""}
        </li>
        <li>
          Us: {dayCount(ours.daysObserved)}, {ours.covered}/{ours.members.length} members observed
        </li>
        <li>Grey hours were never observed and are never suggested.</li>
        <li>Each window shows how many days back it; 1–2 days can be a coincidence.</li>
      </ul>
      {activityError && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">How this data is gathered</summary>
          <p className="mt-1">
            FFScouter activity history is unavailable ({activityError}). Instead TornOps saves who
            is online whenever the war room or this page refreshes both factions: one snapshot a
            minute, kept for 30 days in this browser only. Opening TornOps at different times of day
            fills the grey hours fastest. With FFScouter Premium you get 28 days of every hour
            immediately.
          </p>
        </details>
      )}
    </section>
  );
}

function Shell({
  children,
  subtitle,
  controls,
}: {
  children: React.ReactNode;
  subtitle?: string;
  controls?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-12 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">War planning</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {subtitle ?? "When to hit, who to hit, and who needs to be online."}
          </p>
        </div>
        {controls && <div className="flex flex-wrap items-end gap-3">{controls}</div>}
      </div>
      {children}
    </main>
  );
}

function Notice({
  title,
  children,
  destructive,
}: {
  title: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div
      role={destructive ? "alert" : undefined}
      className={cn(
        "flex gap-3 rounded-lg border p-5",
        destructive && "border-destructive/50 bg-destructive/5",
      )}
    >
      <AlertCircle
        className={cn("mt-0.5 size-5", destructive ? "text-destructive" : "text-muted-foreground")}
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function WindowCard({
  suggestion,
  when,
  active,
  onSelect,
}: {
  suggestion: SuggestedWindow;
  when: { text: string; relative: string };
  active: boolean;
  onSelect: () => void;
}) {
  const kind = KIND[suggestion.kind];
  const Icon = kind.icon;
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
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={suggestion.kind === "chain"}
      aria-pressed={active}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors enabled:hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider",
          kind.tone,
        )}
      >
        <Icon className="size-4" />
        {kind.label}
      </span>
      <span className="mt-2 block font-mono text-lg font-semibold tabular-nums">{when.text}</span>
      <span className="text-xs text-muted-foreground">{when.relative}</span>
      <span className="mt-2 block text-sm">{detail}</span>
      <span
        className={cn(
          "mt-1 block text-xs",
          dataDays < 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        From {dataDays} {dataDays === 1 ? "day" : "days"} of data
        {dataDays < 3 && " · could be a coincidence"}
      </span>
    </button>
  );
}

function Timeline({
  ours,
  theirs,
  now,
  timeZone,
  warStart,
  selected,
  length,
  formatAt,
  onSelect,
}: {
  ours: SideAnalysis;
  theirs: SideAnalysis;
  now: number;
  timeZone: string;
  warStart?: number;
  selected?: number;
  length: number;
  formatAt: (at: number, options: Intl.DateTimeFormatOptions) => string;
  onSelect: (hour: number) => void;
}) {
  const first = Math.floor(now / HOUR) * HOUR;
  const slots = Array.from({ length: TIMELINE_HOURS }, (_, i) => {
    const at = first + i * HOUR;
    return { at, hour: zonedParts(at, timeZone).hour };
  });
  const ourMax = Math.max(1e-9, ...ours.hourly.map((h) => h.count));
  const theirMax = Math.max(1e-9, ...theirs.hourly.map((h) => h.count));
  const strengthMax = Math.max(1e-9, ...theirs.hourly.map((h) => h.strength));
  const useStrength = theirs.hourly.some((h) => h.strength > 0);
  const advantage = (hour: number) =>
    ours.hourly[hour].count / ourMax -
    (useStrength
      ? theirs.hourly[hour].strength / strengthMax
      : theirs.hourly[hour].count / theirMax);
  const inSelection = (hour: number) =>
    selected !== undefined && (hour - selected + 24) % 24 < length;
  const rows: Array<{
    label: string;
    value: (hour: number) => string;
    color: (hour: number) => string;
    observed: (hour: number) => boolean;
  }> = [
    {
      label: "Us online",
      observed: (h) => ours.hourly[h].days > 0,
      value: (h) => ours.hourly[h].count.toFixed(0),
      color: (h) => `rgb(16 185 129 / ${0.08 + (ours.hourly[h].count / ourMax) * 0.6})`,
    },
    {
      label: "Them online",
      observed: (h) => theirs.hourly[h].days > 0,
      value: (h) => theirs.hourly[h].count.toFixed(0),
      color: (h) => `rgb(244 63 94 / ${0.08 + (theirs.hourly[h].count / theirMax) * 0.6})`,
    },
    {
      label: "Their stats",
      observed: (h) => theirs.hourly[h].days > 0,
      // Too wide for the cell; the colour carries it and the tooltip has the number.
      value: () => "",
      color: (h) => `rgb(244 63 94 / ${0.08 + (theirs.hourly[h].strength / strengthMax) * 0.6})`,
    },
    {
      label: "Advantage",
      observed: (h) => ours.hourly[h].days > 0 && theirs.hourly[h].days > 0,
      value: (h) => (advantage(h) > 0.15 ? "+" : advantage(h) < -0.15 ? "−" : ""),
      color: (h) =>
        advantage(h) >= 0
          ? `rgb(16 185 129 / ${Math.min(0.75, advantage(h))})`
          : `rgb(244 63 94 / ${Math.min(0.75, -advantage(h))})`,
    },
  ];
  const grid = "grid grid-cols-[6.5rem_repeat(48,minmax(1.5rem,1fr))] gap-px";
  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Next 48 hours</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Expected members online each hour, from their usual pattern. Grey hours have no
          observations yet. Click an hour to plan a window starting there.
        </p>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="min-w-[1100px] text-[10px]">
          <div className={cn(grid, "mb-1 text-muted-foreground")}>
            <span />
            {slots.map(({ at, hour }) => (
              <span
                key={at}
                className={cn(
                  "text-center",
                  hour === 0 && "font-semibold text-foreground",
                  warStart !== undefined &&
                    warStart >= at &&
                    warStart < at + HOUR &&
                    "text-primary",
                )}
              >
                {hour === 0 ? formatAt(at, { weekday: "short" }) : String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.label} className={cn(grid, "mt-px items-center")}>
              <span className="pr-2 text-xs text-muted-foreground">{row.label}</span>
              {slots.map(({ at, hour }) => (
                <button
                  key={at}
                  type="button"
                  onClick={() => onSelect(hour)}
                  title={`${formatAt(at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}: ${
                    row.observed(hour)
                      ? `us ~${ours.hourly[hour].count.toFixed(1)}, them ~${theirs.hourly[hour].count.toFixed(1)} (${formatStats(theirs.hourly[hour].strength)}), ${Math.min(ours.hourly[hour].days, theirs.hourly[hour].days)} days of data`
                      : "no observations yet"
                  }`}
                  className={cn(
                    "h-7 tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
                    inSelection(hour) && "outline-2 -outline-offset-2 outline-primary",
                    warStart !== undefined &&
                      warStart >= at &&
                      warStart < at + HOUR &&
                      "border-l-2 border-primary",
                    hour === 0 && "border-l border-foreground/30",
                    !row.observed(hour) && "bg-muted",
                  )}
                  style={row.observed(hour) ? { backgroundColor: row.color(hour) } : undefined}
                >
                  {row.observed(hour) ? row.value(hour) : ""}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function statusText(
  member: PlanMember,
  now: number,
  formatAt: (at: number, o: Intl.DateTimeFormatOptions) => string,
) {
  if (member.state === "Hospital" && member.until * 1000 > now) {
    return `Hospital until ${formatAt(member.until * 1000, { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (member.state === "Okay") return "Okay";
  return member.description;
}

function TargetList({
  targets,
  now,
  formatAt,
}: {
  targets: ReturnType<typeof rankTargets>;
  now: number;
  formatAt: (at: number, options: Intl.DateTimeFormatOptions) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? targets : targets.slice(0, 15);
  return (
    <div>
      <div className="px-5 pt-4">
        <h3 className="font-semibold">
          Targets ({targets.filter((t) => t.beatable).length} beatable)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Usually offline in this window, so no retaliation or quick revive. Beatable first, then
          most reliably offline.
        </p>
      </div>
      {targets.length ? (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[560px] text-left text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Stats est.</th>
                <th className="px-3 py-2 font-medium">Offline</th>
                <th className="px-3 py-2 font-medium">Now</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((target) => (
                <tr key={target.id} className={cn(!target.beatable && "text-muted-foreground")}>
                  <td className="px-5 py-2">
                    <a
                      className="font-medium hover:underline"
                      href={playerProfileLink(target.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {target.name}
                    </a>
                    <span className="ml-2 text-xs text-muted-foreground">Lv {target.level}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatStats(target.bs)}
                    {!target.beatable && <span className="ml-1 text-xs">(too strong)</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Math.round(target.offline * 100)}%
                    <span className="ml-1 text-xs text-muted-foreground">
                      of {Math.min(HISTORY_DAYS, target.daysObserved)}d
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{statusText(target, now, formatAt)}</td>
                  <td className="px-5 py-2 text-right">
                    <a
                      className="text-xs font-medium text-primary hover:underline"
                      href={playerAttackLink(target.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Attack
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {targets.length > shown.length && (
            <Button variant="ghost" size="sm" className="m-3" onClick={() => setShowAll(true)}>
              Show all {targets.length}
            </Button>
          )}
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          No enemies are reliably offline in this window.
        </p>
      )}
    </div>
  );
}

function MemberList({
  title,
  hint,
  members,
  chance,
  empty,
}: {
  title: string;
  hint: string;
  members: PlanMember[];
  chance?: (member: PlanMember) => number | undefined;
  empty: string;
}) {
  return (
    <div className="p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {members.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {members.map((member) => {
            const value = chance?.(member);
            return (
              <li key={member.id} className="flex items-center justify-between gap-3">
                <a
                  className="truncate hover:underline"
                  href={playerProfileLink(member.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {member.name}
                </a>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatStats(member.bs)}
                  {value !== undefined && ` · on ${Math.round(value * 100)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
