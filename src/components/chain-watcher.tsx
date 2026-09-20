import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Crosshair,
  ExternalLink,
  HeartPulse,
  Radio,
  ShieldCheck,
  Swords,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useEnemyMembers,
  useFactionChainAttacks,
  useFactionChainReport,
  useUserData,
  useUserFactionChain,
  useUserFactionData,
} from "@/hooks/use-torn";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { type EnemyMember, useGlobalStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function useCountdown(seconds: number | undefined) {
  const [remaining, setRemaining] = useState(seconds ?? 0);

  useEffect(() => {
    setRemaining(seconds ?? 0);
    if (!seconds) return;

    const interval = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [seconds]);

  return remaining;
}

type PrioritizedTarget = EnemyMember & {
  availability: "alive" | "soon";
  availableIn: number;
};

const MAX_VIABLE_FAIR_FIGHT = 3.5;

export function prioritizeTargets(
  members: EnemyMember[],
  chainSecondsRemaining: number,
  nowInSeconds: number,
): PrioritizedTarget[] {
  if (chainSecondsRemaining <= 0) return [];

  const prioritizeSafestTarget = chainSecondsRemaining < 45;

  return members
    .flatMap((member): PrioritizedTarget[] => {
      if (
        member.ffs?.fair_fight !== undefined &&
        member.ffs.fair_fight > MAX_VIABLE_FAIR_FIGHT
      ) {
        return [];
      }

      if (member.status.state === "Okay") {
        return [{ ...member, availability: "alive", availableIn: 0 }];
      }

      if (member.status.state !== "Hospital" || member.status.until <= nowInSeconds) {
        return [];
      }

      const availableIn = member.status.until - nowInSeconds;
      if (availableIn > chainSecondsRemaining - 60) return [];

      return [{ ...member, availability: "soon", availableIn }];
    })
    .sort((a, b) => {
      if (a.availability !== b.availability) {
        return a.availability === "alive" ? -1 : 1;
      }

      const ffA = a.ffs?.fair_fight;
      const ffB = b.ffs?.fair_fight;
      if (ffA === undefined && ffB !== undefined) return 1;
      if (ffA !== undefined && ffB === undefined) return -1;
      if (ffA !== undefined && ffB !== undefined && ffA !== ffB) {
        return prioritizeSafestTarget ? ffA - ffB : ffB - ffA;
      }

      if (a.availability === "soon" && b.availability === "soon") {
        return a.availableIn - b.availableIn;
      }

      const activityOrder = { Online: 0, Idle: 1, Offline: 2 };
      return activityOrder[a.last_action.status] - activityOrder[b.last_action.status];
    })
    .slice(0, 5);
}

type ChainUrgency = "normal" | "warning" | "danger" | "critical";

export function getChainUrgency(seconds: number): ChainUrgency {
  if (seconds > 0 && seconds < 30) return "critical";
  if (seconds > 0 && seconds < 60) return "danger";
  if (seconds > 0 && seconds < 120) return "warning";
  return "normal";
}

const chainUrgencyStyles: Record<
  ChainUrgency,
  { card: string; bar: string; text: string; label: string }
> = {
  normal: {
    card: "border-primary/25",
    bar: "bg-primary",
    text: "text-primary",
    label: "Live chain",
  },
  warning: {
    card: "border-amber-500/70 bg-amber-500/[0.07] shadow-sm shadow-amber-500/10",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    label: "Chain warning",
  },
  danger: {
    card: "border-red-500/80 bg-red-500/[0.09] shadow-sm shadow-red-500/15",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    label: "Chain danger",
  },
  critical: {
    card: "chain-critical-flash border-red-500",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    label: "Critical — hit now",
  },
};

function ChainStatusCard() {
  const { data, isPending, isError } = useUserFactionChain();
  const { data: user } = useUserData();
  const chain = data?.chain;
  const remaining = useCountdown(chain?.timeout);
  const urgency = getChainUrgency(remaining);
  const urgencyStyles = chainUrgencyStyles[urgency];
  const progress = chain?.max ? (chain.current / chain.max) * 100 : 0;
  const energy = user?.energy.current;
  const maximumEnergy = user?.energy.maximum;
  const hitsLeft = energy === undefined ? undefined : Math.floor(energy / 25);
  const StatusIcon = urgency === "normal" ? Radio : AlertTriangle;

  return (
    <Card
      className={cn("p-0 transition-colors duration-300", urgencyStyles.card)}
      data-chain-urgency={urgency}
    >
      <div className="mx-4 mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-500",
            urgencyStyles.bar,
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <CardContent className="grid gap-5 p-5 pt-2 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div
            className={cn(
              "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
              urgencyStyles.text,
            )}
          >
            <StatusIcon className="size-3.5" aria-hidden />
            {urgencyStyles.label}
          </div>
          {isPending ? (
            <p className="text-muted-foreground">Loading chain…</p>
          ) : isError || !chain ? (
            <p className="text-destructive">Chain data is unavailable.</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span
                className={cn(
                  "font-mono text-4xl font-bold tabular-nums transition-colors sm:text-5xl",
                  urgency !== "normal" && urgencyStyles.text,
                )}
              >
                {formatDuration(remaining)}
              </span>
              <span className="text-sm text-muted-foreground">until the chain expires</span>
            </div>
          )}
        </div>
        {chain && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 border-l-2 border-primary/25 pl-4 text-sm">
            <span className="text-muted-foreground">Hits</span>
            <strong className="text-right tabular-nums">
              {chain.current.toLocaleString()} / {chain.max.toLocaleString()}
            </strong>
            <span className="text-muted-foreground">Modifier</span>
            <strong className="text-right tabular-nums">{chain.modifier}x</strong>
            <span className="text-muted-foreground">Energy</span>
            <strong className="text-right tabular-nums">
              {energy === undefined
                ? "—"
                : `${energy.toLocaleString()} / ${maximumEnergy?.toLocaleString() ?? "—"}`}
            </strong>
            <span className="text-muted-foreground">Hits left</span>
            <strong className="text-right tabular-nums">
              {hitsLeft === undefined ? "—" : hitsLeft}
              {hitsLeft !== undefined && (
                <span className="ml-1 font-normal text-muted-foreground">× 25E</span>
              )}
            </strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatAttackTime(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 10) return "Just now";
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
}

type ObservedChainActivity = {
  id: string;
  attackerId: number;
  hits: number;
  attackAt: number;
};

function LatestChainAttacks() {
  const { data: chainData, isPending: isChainPending } = useUserFactionChain();
  const chain = chainData?.chain;
  const hasActiveChain = Boolean(chain?.current && chain.start);
  const {
    data: attackData,
    isPending,
    isError,
    error,
  } = useFactionChainAttacks(hasActiveChain ? chain?.start : undefined);
  const attacks = attackData?.attacks ?? [];
  const isMonitoring = attackData?.scope === "monitor";
  const {
    data: chainReport,
    dataUpdatedAt,
    isPending: isReportPending,
  } = useFactionChainReport(hasActiveChain && isMonitoring);
  const { data: factionData } = useUserFactionData();
  const previousReport = useRef<{ chainId: number; totals: Map<number, number> } | undefined>(
    undefined,
  );
  const [activity, setActivity] = useState<ObservedChainActivity[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!chainReport || !chain || chain.current !== chainReport.details.chain) return;

    const totals = new Map(
      chainReport.attackers.map((attacker) => [attacker.id, attacker.attacks.total]),
    );
    const previous = previousReport.current;
    previousReport.current = { chainId: chainReport.id, totals };

    if (!previous || previous.chainId !== chainReport.id) {
      setActivity([]);
      return;
    }

    // A Torn chain expires five minutes after its latest hit, so `end - 300`
    // is the timestamp of the attack rather than the time we observed the report.
    const attackAt = chain.end - 300;
    const changes = chainReport.attackers.flatMap((attacker) => {
      const hits = attacker.attacks.total - (previous.totals.get(attacker.id) ?? 0);
      return hits > 0
        ? [{ id: `${dataUpdatedAt}-${attacker.id}`, attackerId: attacker.id, hits, attackAt }]
        : [];
    });

    if (changes.length > 0) {
      setActivity((current) => [...changes, ...current].slice(0, 10));
    }
  }, [chain, chainReport, dataUpdatedAt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader className="border-b pb-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Swords className="size-3.5" aria-hidden />
              Attack feed
            </div>
            <CardTitle className="text-xl">Latest chain attacks</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {isMonitoring
              ? "Live faction activity · detected every 10 seconds"
              : "Last 10 faction chain-building hits"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {isChainPending || (hasActiveChain && isPending) || (isMonitoring && isReportPending) ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading attacks…</p>
        ) : !hasActiveChain ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Chain attacks will appear here when a chain is active.
          </p>
        ) : isError ? (
          <div className="px-5 py-8 text-center">
            <p className="font-medium text-destructive">Attack data is unavailable.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "The Torn API request failed."}
            </p>
          </div>
        ) : isMonitoring && activity.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="font-medium">Watching for the next faction hit</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Member-level access can detect new hitters, but not their targets or past order.
            </p>
          </div>
        ) : isMonitoring ? (
          <ol className="divide-y">
            {activity.map((event) => {
              const member = factionData?.members[event.attackerId.toString()];
              return (
                <li
                  key={event.id}
                  className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:px-5"
                >
                  <div>
                    <div className="font-mono text-sm font-bold tabular-nums text-primary">
                      +{event.hits}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {event.hits === 1 ? "Hit" : "Hits"}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <a
                      href={playerProfileLink(event.attackerId)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-semibold hover:text-primary"
                    >
                      {member?.name ?? `Player ${event.attackerId}`}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added {event.hits === 1 ? "a hit" : `${event.hits} hits`} to the chain
                    </p>
                  </div>
                  <time className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatAttackTime(event.attackAt, now)}
                  </time>
                </li>
              );
            })}
          </ol>
        ) : attacks.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No chain-building attacks have been recorded yet.
          </p>
        ) : (
          <ol className="divide-y">
            {attacks.map((attack) => (
              <li
                key={attack.id}
                className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:px-5"
              >
                <div>
                  <div className="font-mono text-sm font-bold tabular-nums text-primary">
                    #{attack.chain?.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Chain
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm">
                    {attack.attacker ? (
                      <a
                        href={playerProfileLink(attack.attacker.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-semibold hover:text-primary"
                      >
                        {attack.attacker.name}
                      </a>
                    ) : (
                      <span className="truncate font-semibold">Stealthed attacker</span>
                    )}
                    <span className="shrink-0 text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <a
                      href={playerProfileLink(attack.defender.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-semibold hover:text-primary"
                    >
                      {attack.defender.name}
                    </a>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{attack.result}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{attack.respect_gain.toFixed(2)} respect
                    </span>
                  </div>
                </div>
                <time
                  dateTime={new Date(attack.ended * 1000).toISOString()}
                  title={new Date(attack.ended * 1000).toLocaleString()}
                  className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                >
                  {formatAttackTime(attack.ended, now)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TargetQueue() {
  useEnemyMembers();

  const { data } = useUserFactionChain();
  const enemyMembers = useGlobalStore((state) => state.enemyMembers);
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);
  const remaining = useCountdown(data?.chain.timeout);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const targets = useMemo(
    () => prioritizeTargets(enemyMembers, remaining, now),
    [enemyMembers, remaining, now],
  );

  return (
    <Card>
      <CardHeader className="border-b pb-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Crosshair className="size-3.5" aria-hidden />
              Target queue
            </div>
            <CardTitle className="text-xl">Next targets</CardTitle>
          </div>
          {enemyFaction && (
            <p className="text-xs text-muted-foreground">
              {enemyFaction.tag} · {enemyFaction.name}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {targets.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <ShieldCheck className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden />
            <p className="font-medium">No viable targets right now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Alive enemies and hospital releases with a one-minute safety margin will appear here.
            </p>
          </div>
        ) : (
          <ol className="divide-y">
            {targets.map((target, index) => (
              <li
                key={target.id}
                className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:grid-cols-[2.75rem_1fr_auto_auto] sm:px-5"
              >
                <span className="font-mono text-lg font-bold text-muted-foreground/60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <a
                    href={playerProfileLink(target.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-semibold hover:text-primary"
                  >
                    {target.name}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={
                        target.availability === "alive"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {target.availability === "alive" ? (
                        <>
                          <HeartPulse className="mr-1 inline size-3" aria-hidden />
                          Alive
                        </>
                      ) : (
                        `Out in ${formatDuration(target.availableIn)}`
                      )}
                    </span>
                    <span>Lv. {target.level}</span>
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="font-mono font-bold tabular-nums">
                    {target.ffs?.fair_fight?.toFixed(2) ?? "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    FF
                  </div>
                </div>
                <a
                  href={playerAttackLink(target.id)}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "sm" })}
                  aria-label={`Attack ${target.name}`}
                >
                  Attack <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ChainWatcher() {
  return (
    <main className="container mx-auto max-w-4xl p-3 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3 pr-11 sm:pr-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Operations
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Chain watcher</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
      <div className="space-y-3">
        <ChainStatusCard />
        <TargetQueue />
        <LatestChainAttacks />
      </div>
    </main>
  );
}
