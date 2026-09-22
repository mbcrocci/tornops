import {
  Activity,
  AlertCircle,
  CalendarDays,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Swords,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useFactionAttackHistory } from "@/hooks/use-torn";
import type { FactionAttack } from "@/lib/faction";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

const TIME_ZONES = [
  { value: "local", label: "My timezone" },
  { value: "UTC", label: "Torn City Time (UTC)" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Lisbon", label: "Lisbon" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

type HourBucket = { attacks: number; attackers: Set<number>; respect: number };

export type MemberAttackSummary = {
  id: number;
  name: string;
  attacks: number;
  hits: number;
  respect: number;
  activeDays: number;
  peakHours: number[];
  rankedWarHits: number;
  lastAttack: number;
};

function dateKey(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone === "local" ? undefined : timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function hourAt(timestamp: number, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone === "local" ? undefined : timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(timestamp * 1000)),
  );
}

function zonedDateToTimestamp(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (timeZone === "local") {
    return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
  }

  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - rendered;
  }

  return Math.floor(guess / 1000);
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function analyzeAttacks(attacks: FactionAttack[], timeZone: string) {
  const hours: HourBucket[] = Array.from({ length: 24 }, () => ({
    attacks: 0,
    attackers: new Set<number>(),
    respect: 0,
  }));
  const members = new Map<
    number,
    Omit<MemberAttackSummary, "activeDays" | "peakHours"> & {
      days: Set<string>;
      hours: number[];
    }
  >();
  const days = new Map<string, number[]>();

  for (const attack of attacks) {
    const hour = hourAt(attack.ended, timeZone);
    const day = dateKey(attack.ended, timeZone);
    const isHit = attack.respect_gain > 0 && !attack.is_interrupted;
    hours[hour].attacks += 1;
    hours[hour].respect += attack.respect_gain;

    const dayHours = days.get(day) ?? Array(24).fill(0);
    dayHours[hour] += 1;
    days.set(day, dayHours);

    if (!attack.attacker) continue;
    hours[hour].attackers.add(attack.attacker.id);
    const current = members.get(attack.attacker.id) ?? {
      id: attack.attacker.id,
      name: attack.attacker.name,
      attacks: 0,
      hits: 0,
      respect: 0,
      rankedWarHits: 0,
      lastAttack: 0,
      days: new Set<string>(),
      hours: Array(24).fill(0),
    };
    current.attacks += 1;
    current.hits += isHit ? 1 : 0;
    current.respect += attack.respect_gain;
    current.rankedWarHits += isHit && attack.is_ranked_war ? 1 : 0;
    current.lastAttack = Math.max(current.lastAttack, attack.ended);
    current.days.add(day);
    current.hours[hour] += 1;
    members.set(current.id, current);
  }

  const memberRows: MemberAttackSummary[] = [...members.values()]
    .map(({ days: activeDays, hours: memberHours, ...member }) => ({
      ...member,
      activeDays: activeDays.size,
      peakHours: memberHours
        .map((count, hour) => ({ count, hour }))
        .filter(({ count }) => count > 0)
        .sort((a, b) => b.count - a.count || a.hour - b.hour)
        .slice(0, 3)
        .map(({ hour }) => hour),
    }))
    .sort((a, b) => b.hits - a.hits || b.respect - a.respect);

  return { hours, members: memberRows, days };
}

function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function formatDateTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone === "local" ? undefined : timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp * 1000));
}

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
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function ActivityClock({ hours }: { hours: HourBucket[] }) {
  const max = Math.max(1, ...hours.map((hour) => hour.attacks));

  return (
    <div>
      <div className="grid h-40 grid-cols-24 items-end gap-1" aria-label="Attacks by hour">
        {hours.map((bucket, hour) => (
          <div key={hour} className="group relative flex h-full items-end">
            <div
              className="w-full bg-primary/75 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(bucket.attacks ? 8 : 1, (bucket.attacks / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap border bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
              {formatHour(hour)} · {bucket.attacks} attacks · {bucket.attackers.size} members
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 font-mono text-[10px] text-muted-foreground">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
      </div>
    </div>
  );
}

function DayHeatmap({ days }: { days: Map<string, number[]> }) {
  const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...rows.flatMap(([, hours]) => hours));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="mb-2 grid grid-cols-[5rem_repeat(24,minmax(0,1fr))] gap-1 text-[9px] text-muted-foreground">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className={cn("text-center", hour % 3 !== 0 && "opacity-0")}>
              {hour.toString().padStart(2, "0")}
            </span>
          ))}
        </div>
        <div className="space-y-1">
          {rows.map(([day, hours]) => (
            <div key={day} className="grid grid-cols-[5rem_repeat(24,minmax(0,1fr))] gap-1">
              <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                {day.slice(5)}
              </span>
              {hours.map((count, hour) => (
                <div
                  key={hour}
                  title={`${day} ${formatHour(hour)}: ${count} attacks`}
                  className="aspect-square min-h-3 bg-primary"
                  style={{ opacity: count === 0 ? 0.06 : 0.2 + (count / max) * 0.8 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AttackHistory() {
  const [timeZone, setTimeZone] = useState("local");
  const [fromDate, setFromDate] = useState(() => addDays(todayInputValue(), -6));
  const [toDate, setToDate] = useState(todayInputValue);
  const from = useMemo(() => zonedDateToTimestamp(fromDate, timeZone), [fromDate, timeZone]);
  const to = useMemo(
    () => zonedDateToTimestamp(addDays(toDate, 1), timeZone),
    [toDate, timeZone],
  );
  const { data, isPending, isFetching, isError, error, refetch } =
    useFactionAttackHistory(from, to);
  const attacks = data?.attacks ?? [];
  const analysis = useMemo(() => analyzeAttacks(attacks, timeZone), [attacks, timeZone]);
  const hits = attacks.filter((attack) => attack.respect_gain > 0 && !attack.is_interrupted);
  const totalRespect = hits.reduce((total, attack) => total + attack.respect_gain, 0);
  const peakHour = analysis.hours.reduce(
    (best, bucket, hour) => (bucket.attacks > analysis.hours[best].attacks ? hour : best),
    0,
  );
  const maxMemberHits = Math.max(1, ...analysis.members.map((member) => member.hits));

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6">
      <section className="mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            <Swords className="size-4" aria-hidden />
            Faction intelligence
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Attack history
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            See when your faction actually fights. Hours show observed attack activity, not a promise that a member is online.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_auto_auto_auto] sm:items-end">
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Display timezone
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>{zone.label}</option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
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
              <p className="font-medium">Attack history is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The Torn API request failed."} The key needs Limited Access and the faction API Access permission.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> Loading attack history…</div>
        </div>
      ) : attacks.length === 0 ? (
        <Card>
          <CardContent className="flex gap-3 py-5">
            <AlertCircle className="mt-0.5 size-5 text-muted-foreground" />
            <div><p className="font-medium">No outgoing attacks in this period</p><p className="mt-1 text-sm text-muted-foreground">Choose a wider date range.</p></div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data?.truncated && (
            <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              This range contains more than 5,000 attacks. The charts use the first 5,000. Choose a shorter range for a complete view.
            </div>
          )}

          <Card className="overflow-hidden p-0">
            <div className="grid gap-5 border-b bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={Swords} label="Successful hits" value={hits.length.toLocaleString()} detail={`${attacks.length.toLocaleString()} attack records`} />
              <Metric icon={Users} label="Active attackers" value={analysis.members.length.toLocaleString()} detail={`across ${analysis.days.size} active days`} />
              <Metric icon={Activity} label="Respect gained" value={totalRespect.toFixed(2)} detail={`${(totalRespect / Math.max(1, hits.length)).toFixed(2)} per hit`} />
              <Metric icon={Clock3} label="Busiest hour" value={formatHour(peakHour)} detail={`${analysis.hours[peakHour].attacks} attacks in selected timezone`} />
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <div><h2 className="font-medium">The faction day</h2><p className="mt-1 text-xs text-muted-foreground">All attacks placed on a 24-hour clock</p></div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{TIME_ZONES.find((zone) => zone.value === timeZone)?.label}</span>
              </div>
              <ActivityClock hours={analysis.hours} />
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> Activity by day and hour</CardTitle></CardHeader>
              <CardContent><DayHeatmap days={analysis.days} /></CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hour coverage</CardTitle>
                <p className="text-xs text-muted-foreground">Unique faction members who attacked during each hour</p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-5 gap-y-2">
                {analysis.hours.map((bucket, hour) => (
                  <div key={hour} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground">{hour.toString().padStart(2, "0")}</span>
                    <div className="h-1.5 bg-muted"><div className="h-full bg-primary/70" style={{ width: `${(bucket.attackers.size / Math.max(1, analysis.members.length)) * 100}%` }} /></div>
                    <span className="text-right font-mono tabular-nums">{bucket.attackers.size}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member patterns</CardTitle>
              <p className="text-xs text-muted-foreground">Peak hours are based on completed outgoing attacks in this range</p>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2 font-medium">Member</th><th className="px-3 py-2 font-medium">Hits</th><th className="px-3 py-2 font-medium">Share</th><th className="px-3 py-2 font-medium">Active days</th><th className="px-3 py-2 font-medium">Peak hours</th><th className="px-3 py-2 font-medium">RW hits</th><th className="px-4 py-2 text-right font-medium">Respect</th></tr>
                </thead>
                <tbody className="divide-y">
                  {analysis.members.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/25">
                      <td className="px-4 py-2.5"><a className="font-medium hover:text-primary hover:underline" href={`https://www.torn.com/profiles.php?XID=${member.id}`} target="_blank" rel="noreferrer">{member.name}</a><span className="ml-2 font-mono text-[10px] text-muted-foreground">{member.id}</span></td>
                      <td className="px-3 py-2.5 font-mono tabular-nums">{member.hits}<span className="ml-1 text-[10px] text-muted-foreground">/ {member.attacks}</span></td>
                      <td className="px-3 py-2.5"><div className="h-1.5 w-24 bg-muted"><div className="h-full bg-primary" style={{ width: `${(member.hits / maxMemberHits) * 100}%` }} /></div></td>
                      <td className="px-3 py-2.5 font-mono tabular-nums">{member.activeDays}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{member.peakHours.map(formatHour).join(" · ")}</td>
                      <td className="px-3 py-2.5 font-mono tabular-nums">{member.rankedWarHits}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{member.respect.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent attacks</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">Attacker</th><th className="px-3 py-2 font-medium">Defender</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">Context</th><th className="px-4 py-2 text-right font-medium">Respect</th></tr></thead>
                <tbody className="divide-y">
                  {[...attacks].reverse().slice(0, 50).map((attack) => (
                    <tr key={attack.id} className="hover:bg-muted/25">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{formatDateTime(attack.ended, timeZone)}</td>
                      <td className="px-3 py-2.5">{attack.attacker?.name ?? "Stealthed"}</td>
                      <td className="px-3 py-2.5">{attack.defender.name}</td>
                      <td className="px-3 py-2.5">{attack.result}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{attack.is_ranked_war ? "Ranked war" : attack.chain ? `Chain ${attack.chain}` : "Outside chain"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{attack.respect_gain.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
