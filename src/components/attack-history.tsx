import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Layers3,
  RefreshCw,
  ShieldAlert,
  ShieldHalf,
  Swords,
  Users,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  useFactionAttackHistory,
  useFactionRankedWars,
  useUserFactionData,
} from "@/hooks/use-torn";
import {
  analyzeWar,
  findAbsentMembers,
  type RosterMember,
  summarizeAttacks,
} from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { AttackLog } from "./war-history/attack-log";
import { DayHeatmap, NetRespectByHour } from "./war-history/charts";
import {
  TIME_ZONES,
  formatRespect,
  formatSigned,
  formatWarDate,
  isWarOngoing,
  timeZoneLabel,
  warEnd,
  warOpponent,
  warOutcome,
} from "./war-history/format";
import { HitQuality } from "./war-history/hit-quality";
import { AbsentMembers, MemberTable } from "./war-history/members";
import { PlanningWindows } from "./war-history/planning";
import { WarComparison } from "./war-history/war-comparison";

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="border-l-2 border-primary/60 pl-3">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex gap-3 py-5">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{children}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AttackHistory() {
  const [timeZone, setTimeZone] = useState("local");
  const [selectedWarIds, setSelectedWarIds] = useState<number[] | null>(null);
  const warsQuery = useFactionRankedWars();
  const usingCachedWars = warsQuery.data?.source === "cache";
  const factionQuery = useUserFactionData(warsQuery.isSuccess && !usingCachedWars);
  const wars = warsQuery.data?.wars ?? [];
  const selectedWars = useMemo(() => {
    if (selectedWarIds === null) return wars.slice(0, 1);
    const ids = new Set(selectedWarIds);
    return wars.filter((war) => ids.has(war.id));
  }, [selectedWarIds, wars]);
  const attackRanges = useMemo(
    () =>
      selectedWars.map((war) => ({
        id: war.id,
        from: war.start,
        to: isWarOngoing(war) ? 0 : war.end + 1,
      })),
    [selectedWars],
  );
  const attackQuery = useFactionAttackHistory(attackRanges);
  // A war in progress is analysed up to when its attacks were last fetched.
  const fetchedAt = Math.floor((attackQuery.dataUpdatedAt || Date.now()) / 1000);
  const analysisRanges = useMemo(
    () => attackRanges.map((range) => (range.to === 0 ? { ...range, to: fetchedAt } : range)),
    [attackRanges, fetchedAt],
  );
  const outgoing = useMemo(
    () => (attackQuery.data?.attacks ?? []).filter((attack) => attack.is_ranked_war),
    [attackQuery.data],
  );
  const incoming = useMemo(
    () => (attackQuery.data?.incoming ?? []).filter((attack) => attack.is_ranked_war),
    [attackQuery.data],
  );
  const analysis = useMemo(
    () => analyzeWar({ outgoing, incoming, ranges: analysisRanges, timeZone }),
    [outgoing, incoming, analysisRanges, timeZone],
  );
  const warRows = useMemo(
    () =>
      selectedWars.map((war) => {
        const inWar = (attack: { ended: number }) =>
          attack.ended >= war.start && attack.ended <= warEnd(war, fetchedAt) + 1;
        return { war, totals: summarizeAttacks(outgoing.filter(inWar), incoming.filter(inWar)) };
      }),
    [selectedWars, outgoing, incoming, fetchedAt],
  );

  const ownFactionId =
    factionQuery.data?.ID ??
    outgoing.find((attack) => attack.attacker?.faction)?.attacker?.faction?.id;
  const selectionStart = Math.min(...selectedWars.map((war) => war.start));
  const selectionEnd = Math.max(...selectedWars.map((war) => warEnd(war, fetchedAt)));
  const roster = useMemo<RosterMember[] | null>(
    () =>
      factionQuery.data?.members
        ? Object.entries(factionQuery.data.members).map(([id, member]) => ({
            id: Number(id),
            name: member.name,
            position: member.position,
            daysInFaction: member.days_in_faction,
          }))
        : null,
    [factionQuery.data],
  );
  const absent = useMemo(
    () =>
      roster
        ? findAbsentMembers(
            roster,
            analysis.members,
            { from: selectionStart, to: selectionEnd },
            Date.now() / 1000,
          )
        : [],
    [roster, analysis.members, selectionStart, selectionEnd],
  );
  const absentThroughout = absent.filter((member) => member.joined === "before").length;
  const { totals } = analysis;

  const selectedWarIdsSet = new Set(selectedWars.map((war) => war.id));
  const wins = selectedWars.filter((war) => warOutcome(war, ownFactionId) === "Victory").length;
  const losses = selectedWars.filter((war) => warOutcome(war, ownFactionId) === "Defeat").length;
  const ongoing = selectedWars.filter(isWarOngoing).length;
  const draws = selectedWars.length - wins - losses - ongoing;
  const hasWarResults = selectedWars.every((war) => war.target > 0);
  const firstSelectedWar = selectedWars[0];
  const firstOwnFaction = firstSelectedWar?.factions.find((faction) => faction.id === ownFactionId);
  const firstOpponent = firstSelectedWar ? warOpponent(firstSelectedWar, ownFactionId) : undefined;
  const isPending = warsQuery.isPending || Boolean(selectedWars.length && attackQuery.isPending);
  const isFetching = warsQuery.isFetching || attackQuery.isFetching;
  const isError = warsQuery.isError || attackQuery.isError;
  const error = warsQuery.error ?? attackQuery.error;
  const refresh = () => {
    void warsQuery.refetch();
    if (selectedWars.length) void attackQuery.refetchFresh();
  };
  const toggleWar = (warId: number) => {
    const currentIds = selectedWarIds ?? selectedWars.map((war) => war.id);
    setSelectedWarIds(
      currentIds.includes(warId) ? currentIds.filter((id) => id !== warId) : [...currentIds, warId],
    );
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6">
      <section className="mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            <Swords className="size-4" aria-hidden />
            Faction intelligence
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Faction attack history
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Combine one or more ranked wars, including one in progress. Only ranked-war attacks
            between your faction and the opponent are counted, in both directions.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(290px,1fr)_auto_auto] sm:items-end">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>Ranked wars</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full min-w-0 justify-between px-3 font-normal text-foreground"
                  disabled={wars.length === 0}
                >
                  <span className="truncate">
                    {selectedWars.length === 0
                      ? "Choose wars"
                      : selectedWars.length === 1
                        ? `${warOpponent(selectedWars[0], factionQuery.data?.ID)?.name ?? `War ${selectedWars[0].id}`} · ${isWarOngoing(selectedWars[0]) ? "Ongoing" : formatWarDate(selectedWars[0].end, timeZone)}`
                        : `${selectedWars.length} wars selected`}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(92vw,28rem)] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedWars.length} of {wars.length} selected
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedWarIds(wars.map((war) => war.id))}
                    >
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedWarIds([])}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-1">
                  {wars.map((war) => {
                    const rival = warOpponent(war, factionQuery.data?.ID);
                    const checkboxId = `war-${war.id}`;
                    return (
                      <label
                        key={war.id}
                        htmlFor={checkboxId}
                        className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-muted"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selectedWarIdsSet.has(war.id)}
                          onCheckedChange={() => toggleWar(war.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {rival?.name ?? `War ${war.id}`}
                          </span>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {formatWarDate(war.start, timeZone)} · #{war.id}
                            {isWarOngoing(war) && (
                              <span className="ml-1.5 uppercase text-primary">· Ongoing</span>
                            )}
                          </span>
                        </span>
                        {war.target > 0 && (
                          <span className="font-mono text-xs tabular-nums text-foreground">
                            {war.factions.find((faction) => faction.id === factionQuery.data?.ID)
                              ?.score ?? 0}
                            :{rival?.score ?? 0}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Display timezone
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={cn(isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </section>

      {isError ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex gap-3 py-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">War history is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The Torn API request failed."} The key
                needs Limited Access and the faction API Access permission.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="size-4 animate-spin" />
              {warsQuery.isPending
                ? "Loading ranked wars…"
                : `Loading every attack from ${selectedWars.length} ${selectedWars.length === 1 ? "war" : "wars"}, both ways…`}
            </div>
            {!warsQuery.isPending && (
              <p className="mt-2 text-xs">
                If Torn applies its request limit, loading pauses for 65 seconds before retrying.
              </p>
            )}
          </div>
        </div>
      ) : wars.length === 0 ? (
        <Notice title="No ranked wars found">
          Torn did not return any ranked wars for this faction.
        </Notice>
      ) : (
        <div className="space-y-4">
          {usingCachedWars && (
            <Notice title="Showing cached wars">
              Torn could not be reached, so the war list comes from this browser's cache. Wars that
              ended since the last visit are missing until Refresh succeeds.
            </Notice>
          )}
          {selectedWars.length > 0 ? (
            <Card className="overflow-hidden border-primary/30 p-0">
              <div className="grid gap-4 bg-primary/[0.055] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {selectedWars.length} ranked {selectedWars.length === 1 ? "war" : "wars"} ·{" "}
                    {formatWarDate(selectionStart, timeZone)} to{" "}
                    {selectedWars.some(isWarOngoing)
                      ? "now"
                      : formatWarDate(selectionEnd, timeZone)}
                  </p>
                  <h2 className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">
                    {selectedWars.length === 1
                      ? `${firstOwnFaction?.name ?? "Your faction"} vs ${firstOpponent?.name ?? "Opponent"}`
                      : `${selectedWars.length} wars combined`}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {outgoing.length.toLocaleString()} attacks made and{" "}
                    {incoming.length.toLocaleString()} received over {analysis.liveHours} war hours
                  </p>
                </div>
                <div className="border-l-2 border-primary/50 pl-4 font-mono">
                  {hasWarResults ? (
                    <>
                      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <Layers3 className="size-3.5" /> Combined record
                      </div>
                      <div className="flex items-end gap-4">
                        <div>
                          <div className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {wins}
                          </div>
                          <div className="text-[10px] uppercase text-muted-foreground">Wins</div>
                        </div>
                        <div>
                          <div className="text-2xl font-semibold tabular-nums text-destructive">
                            {losses}
                          </div>
                          <div className="text-[10px] uppercase text-muted-foreground">Losses</div>
                        </div>
                        {draws > 0 && (
                          <div>
                            <div className="text-2xl font-semibold tabular-nums">{draws}</div>
                            <div className="text-[10px] uppercase text-muted-foreground">Draws</div>
                          </div>
                        )}
                        {ongoing > 0 && (
                          <div>
                            <div className="text-2xl font-semibold tabular-nums text-primary">
                              {ongoing}
                            </div>
                            <div className="text-[10px] uppercase text-muted-foreground">
                              Ongoing
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <Layers3 className="size-3.5" /> Local cache
                      </div>
                      <div className="text-sm">Final scores were not cached</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Notice title="Choose at least one war">
              Open the war selector and pick the wars to compare.
            </Notice>
          )}

          {selectedWars.length === 0 ? null : outgoing.length === 0 && incoming.length === 0 ? (
            <Notice title="No ranked-war attacks found">
              Torn returned the war, but no attacks marked as ranked-war hits in either direction.
            </Notice>
          ) : (
            <>
              <Card className="overflow-hidden p-0">
                <div className="grid gap-5 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    icon={Swords}
                    label="Successful hits"
                    value={totals.hits.toLocaleString()}
                    detail={`${totals.attacks.toLocaleString()} attacks · ${totals.failed} wasted · ${totals.assists} assists`}
                  />
                  <Metric
                    icon={Users}
                    label="Participation"
                    value={
                      roster
                        ? `${totals.attackers} / ${roster.length}`
                        : totals.attackers.toLocaleString()
                    }
                    detail={
                      roster
                        ? `${absentThroughout} long-standing ${absentThroughout === 1 ? "member" : "members"} never scored`
                        : "members who attacked"
                    }
                  />
                  <Metric
                    icon={Activity}
                    label="Net respect"
                    value={formatSigned(totals.respect - totals.respectLost)}
                    detail={`${formatRespect(totals.respect)} gained · ${formatRespect(totals.respectLost)} lost`}
                  />
                  <Metric
                    icon={ShieldHalf}
                    label="Hits taken"
                    value={totals.hitsTaken.toLocaleString()}
                    detail={`from ${totals.enemyAttackers} enemies · ${totals.defendsWon} of their attacks failed`}
                  />
                </div>
              </Card>

              <PlanningWindows
                windows={analysis.scheduleWindows}
                timeZone={timeZone}
                hasIncoming={incoming.length > 0}
              />

              <Card>
                <CardContent className="py-3">
                  <NetRespectByHour hours={analysis.hours} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" /> Every war hour
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    One row per day, {timeZoneLabel(timeZone)}
                  </p>
                </CardHeader>
                <CardContent>
                  <DayHeatmap days={analysis.days} />
                </CardContent>
              </Card>

              <HitQuality analysis={analysis} />

              {selectedWars.length > 1 && (
                <WarComparison rows={warRows} ownFactionId={ownFactionId} timeZone={timeZone} />
              )}

              <MemberTable members={analysis.members} />

              <AbsentMembers absent={absent} rosterAvailable={roster !== null} />

              <AttackLog outgoing={outgoing} incoming={incoming} timeZone={timeZone} />
            </>
          )}
        </div>
      )}
    </main>
  );
}
