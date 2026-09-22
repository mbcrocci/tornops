import {
  Activity,
  AlertCircle,
  CalendarDays,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  type FFScouterActivityBucket,
  type FFScouterMemberActivity,
  useFFScouterFactionActivity,
  useFFScouterMemberActivity,
} from "@/hooks/use-ffscouter";
import { useUserFactionData } from "@/hooks/use-torn";
import { useCredentialsStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

const WINDOW_HOURS = 3;
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

export type ActivityScheduleWindow = {
  startHour: number;
  typicalMembers: number;
  averageMembers: number;
  floorMembers: number;
  bestMembers: number;
  daysWithCoverage: number;
  totalDays: number;
};

export type MemberAvailability = {
  id: number;
  name: string;
  activeBuckets: number;
  activeDays: number;
  reliableWindow: {
    startHour: number;
    daysSeen: number;
    totalDays: number;
    reliability: number;
    confidence: number;
  };
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
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function wilsonLowerBound(successes: number, total: number) {
  if (!total) return 0;
  const proportion = successes / total;
  const z = 1.28;
  return (
    (proportion + z ** 2 / (2 * total)) / (1 + z ** 2 / total) -
    (z * Math.sqrt((proportion * (1 - proportion)) / total + z ** 2 / (4 * total ** 2))) /
      (1 + z ** 2 / total)
  );
}

export function analyzeFactionActivity(buckets: FFScouterActivityBucket[], timeZone: string) {
  const days = new Map<string, number[]>();
  for (const bucket of buckets) {
    const day = dateKey(bucket.ts, timeZone);
    const hour = hourAt(bucket.ts, timeZone);
    const hours = days.get(day) ?? Array(24).fill(0);
    hours[hour] = bucket.active_players ?? bucket.activity_score;
    days.set(day, hours);
  }

  const dayRows = [...days.values()];
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const values = dayRows.map((day) => day[hour]);
    return {
      hour,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      typical: median(values),
      floor: percentile(values, 0.25),
    };
  });

  const windows: ActivityScheduleWindow[] = Array.from({ length: 24 }, (_, startHour) => {
    const dailyAverages = dayRows.map((day) => {
      const values = Array.from(
        { length: WINDOW_HOURS },
        (_, offset) => day[(startHour + offset) % 24],
      );
      return values.reduce((sum, value) => sum + value, 0) / WINDOW_HOURS;
    });
    return {
      startHour,
      typicalMembers: median(dailyAverages),
      averageMembers: dailyAverages.length
        ? dailyAverages.reduce((sum, value) => sum + value, 0) / dailyAverages.length
        : 0,
      floorMembers: percentile(dailyAverages, 0.25),
      bestMembers: Math.max(0, ...dailyAverages),
      daysWithCoverage: dailyAverages.filter((value) => value > 0).length,
      totalDays: dayRows.length,
    };
  });

  return { days, hourly, windows };
}

export function analyzeMemberActivity(
  activity: FFScouterMemberActivity[],
  names: Map<number, string>,
  timeZone: string,
): MemberAvailability[] {
  return activity
    .map(({ playerId, buckets }) => {
      const days = new Map<string, boolean[]>();
      let activeBuckets = 0;
      for (const bucket of buckets) {
        const day = dateKey(bucket.ts, timeZone);
        const hour = hourAt(bucket.ts, timeZone);
        const hours = days.get(day) ?? Array(24).fill(false);
        if (bucket.activity_score > 0) {
          hours[hour] = true;
          activeBuckets += 1;
        }
        days.set(day, hours);
      }

      const dayRows = [...days.values()];
      const windows = Array.from({ length: 24 }, (_, startHour) => {
        const daysSeen = dayRows.filter((day) =>
          Array.from({ length: WINDOW_HOURS }, (_, offset) => day[(startHour + offset) % 24]).some(
            Boolean,
          ),
        ).length;
        return {
          startHour,
          daysSeen,
          totalDays: dayRows.length,
          reliability: dayRows.length ? daysSeen / dayRows.length : 0,
          confidence: wilsonLowerBound(daysSeen, dayRows.length),
        };
      });
      const reliableWindow = windows.reduce((best, window) =>
        window.daysSeen >= best.daysSeen ? window : best,
      );

      return {
        id: playerId,
        name: names.get(playerId) ?? `Player ${playerId}`,
        activeBuckets,
        activeDays: dayRows.filter((day) => day.some(Boolean)).length,
        reliableWindow,
      };
    })
    .sort(
      (a, b) =>
        b.reliableWindow.confidence - a.reliableWindow.confidence ||
        b.activeBuckets - a.activeBuckets,
    );
}

function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function formatWindow(startHour: number) {
  return `${formatHour(startHour)} to ${formatHour((startHour + WINDOW_HOURS) % 24)}`;
}

function selectSeparatedWindows(windows: ActivityScheduleWindow[], strongest: boolean) {
  const ranked = [...windows].sort((a, b) => {
    const direction = strongest ? -1 : 1;
    return (
      direction * (a.typicalMembers - b.typicalMembers) ||
      direction * (a.averageMembers - b.averageMembers) ||
      a.startHour - b.startHour
    );
  });
  const selected: ActivityScheduleWindow[] = [];
  for (const candidate of ranked) {
    const hours = Array.from({ length: WINDOW_HOURS }, (_, i) => (candidate.startHour + i) % 24);
    const overlaps = selected.some((window) => {
      const selectedHours = Array.from(
        { length: WINDOW_HOURS },
        (_, i) => (window.startHour + i) % 24,
      );
      return hours.some((hour) => selectedHours.includes(hour));
    });
    if (!overlaps) selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected;
}

function ActivityHeatmap({ days }: { days: Map<string, number[]> }) {
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
                  title={`${day} ${formatHour(hour)}: ${count} active members`}
                  className="aspect-square min-h-3 bg-cyan-500"
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

export function FFScouterActivityHistory() {
  const ffscouterKey = useCredentialsStore((state) => state.ffscouterKey);
  const [timeZone, setTimeZone] = useState("local");
  const [fromDate, setFromDate] = useState(() => addDays(todayInputValue(), -29));
  const [toDate, setToDate] = useState(todayInputValue);
  const [memberSearch, setMemberSearch] = useState("");
  const start = useMemo(() => zonedDateToTimestamp(fromDate, timeZone), [fromDate, timeZone]);
  const end = useMemo(() => zonedDateToTimestamp(addDays(toDate, 1), timeZone), [toDate, timeZone]);

  const factionQuery = useUserFactionData();
  const factionId = factionQuery.data?.ID;
  const memberNames = useMemo(
    () =>
      new Map(
        Object.entries(factionQuery.data?.members ?? {}).map(([id, member]) => [
          Number(id),
          member.name,
        ]),
      ),
    [factionQuery.data?.members],
  );
  const memberIds = useMemo(() => [...memberNames.keys()], [memberNames]);
  const factionActivity = useFFScouterFactionActivity(factionId, start, end);
  const memberActivity = useFFScouterMemberActivity(
    memberIds,
    start,
    end,
    Boolean(factionActivity.data),
  );
  const analysis = useMemo(
    () => analyzeFactionActivity(factionActivity.data?.buckets ?? [], timeZone),
    [factionActivity.data?.buckets, timeZone],
  );
  const members = useMemo(
    () => analyzeMemberActivity(memberActivity.data?.members ?? [], memberNames, timeZone),
    [memberActivity.data?.members, memberNames, timeZone],
  );
  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );
  const pushWindows = selectSeparatedWindows(analysis.windows, true);
  const turtleWindows = selectSeparatedWindows(analysis.windows, false);
  const bestHour = analysis.hourly.reduce(
    (best, hour) => (hour.average > analysis.hourly[best].average ? hour.hour : best),
    0,
  );
  const isRefreshing = factionActivity.isFetching || memberActivity.isFetching;
  const isPending = factionQuery.isPending || factionActivity.isPending;
  const error = factionQuery.error ?? factionActivity.error;

  const refresh = async () => {
    await factionActivity.refetch();
    await memberActivity.refetch();
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6">
      <section className="mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">
            <Activity className="size-4" /> FFScouter evidence
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Online activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The same planning questions, answered with FFScouter scanner observations instead of
            attacks.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_auto_auto_auto] sm:items-end">
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
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
          <Button
            variant="outline"
            onClick={refresh}
            disabled={isRefreshing || !factionActivity.data}
          >
            <RefreshCw className={cn(isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </section>

      {!ffscouterKey ? (
        <Card>
          <CardContent className="flex gap-3 py-5">
            <AlertCircle className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Add an FFScouter API key</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open settings and add a registered Premium key to load historical activity.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex gap-3 py-5">
            <AlertCircle className="mt-0.5 size-5 text-destructive" />
            <div>
              <p className="font-medium">FFScouter activity is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The request failed."} Activity history
                requires FFScouter Premium and tracked data for this period.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" />
            Loading faction activity…
          </div>
        </div>
      ) : !factionActivity.data?.buckets.length ? (
        <Card>
          <CardContent className="flex gap-3 py-5">
            <AlertCircle className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">No scanner activity in this period</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a more recent date range.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-xs text-muted-foreground">
            <span>Source: FFScouter hourly activity buckets</span>
            <span>
              {analysis.days.size} tracked days,{" "}
              {factionActivity.data.meta.member_count ?? memberIds.length} roster members
            </span>
          </div>

          <Card className="overflow-hidden border-cyan-500/35 p-0">
            <div className="grid lg:grid-cols-2">
              <section className="border-b bg-cyan-500/[0.07] p-5 lg:border-b-0 lg:border-r sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                      <Zap className="size-4" />
                      Call the push
                    </div>
                    <h2 className="font-serif text-2xl font-semibold">
                      More people are usually online
                    </h2>
                  </div>
                  <span className="rounded-full border border-cyan-500/30 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    3 hours, {TIME_ZONES.find((zone) => zone.value === timeZone)?.label}
                  </span>
                </div>
                <div className="space-y-3">
                  {pushWindows.map((window, index) => (
                    <div
                      key={window.startHour}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t pt-3"
                    >
                      <span
                        className={cn(
                          "grid size-7 place-items-center rounded-full font-mono text-xs",
                          index === 0 ? "bg-cyan-600 text-white" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-mono text-lg font-semibold tabular-nums">
                          {formatWindow(window.startHour)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          floor of {window.floorMembers.toFixed(1)} active per hour
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xl font-semibold tabular-nums">
                          {window.typicalMembers.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">typically online</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="p-5 sm:p-6">
                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                    <ShieldCheck className="size-4" />
                    Turtle the gap
                  </div>
                  <h2 className="font-serif text-2xl font-semibold">
                    Fewer people are usually online
                  </h2>
                </div>
                <div className="space-y-3">
                  {turtleWindows.map((window) => (
                    <div
                      key={window.startHour}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 border-t pt-3"
                    >
                      <div>
                        <div className="font-mono text-lg font-semibold tabular-nums">
                          {formatWindow(window.startHour)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          best daily average was {window.bestMembers.toFixed(1)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xl font-semibold tabular-nums">
                          {window.typicalMembers.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">typically online</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
              A person counts as active when FFScouter saw at least one activity observation in the
              hour. This is sampled presence, not continuous online time.
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-l-2 border-cyan-500 pl-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Users className="size-3.5" />
                Tracked roster
              </div>
              <div className="font-mono text-2xl font-semibold">
                {factionActivity.data.meta.member_count ?? memberIds.length}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">FFScouter roster snapshot</div>
            </div>
            <div className="border-l-2 border-cyan-500 pl-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Clock3 className="size-3.5" />
                Busiest hour
              </div>
              <div className="font-mono text-2xl font-semibold">{formatHour(bestHour)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {analysis.hourly[bestHour].average.toFixed(1)} online on average
              </div>
            </div>
            <div className="border-l-2 border-cyan-500 pl-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Tracked days
              </div>
              <div className="font-mono text-2xl font-semibold">{analysis.days.size}</div>
              <div className="mt-1 text-xs text-muted-foreground">in the selected period</div>
            </div>
            <div className="border-l-2 border-cyan-500 pl-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <UserCheck className="size-3.5" />
                Member histories
              </div>
              <div className="font-mono text-2xl font-semibold">
                {members.length}/{memberIds.length}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">loaded within the API budget</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Online members by day and hour</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityHeatmap days={analysis.days} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Typical hourly coverage</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Median and average members seen online
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.hourly.map((hour) => (
                  <div
                    key={hour.hour}
                    className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {hour.hour.toString().padStart(2, "0")}
                    </span>
                    <div className="h-1.5 bg-muted">
                      <div
                        className="h-full bg-cyan-500"
                        style={{
                          width: `${Math.min(100, (hour.average / Math.max(1, factionActivity.data.meta.member_count ?? memberIds.length)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-right font-mono">{hour.average.toFixed(1)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="size-4 text-cyan-600" />
                    Who can I count on?
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Best recurring three-hour window from individual FFScouter observations
                  </p>
                </div>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-full pl-8 sm:w-60"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Find a member"
                  />
                </label>
              </div>
            </CardHeader>
            {memberActivity.isPending ? (
              <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                Loading {memberIds.length} member histories…
              </CardContent>
            ) : (
              <CardContent className="overflow-x-auto px-0">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Member</th>
                      <th className="px-3 py-2 font-medium">Most reliable window</th>
                      <th className="px-3 py-2 font-medium">Seen</th>
                      <th className="px-3 py-2 font-medium">Observed rate</th>
                      <th className="px-3 py-2 font-medium">Active days</th>
                      <th className="px-4 py-2 text-right font-medium">Active hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-muted/25">
                        <td className="px-4 py-2.5">
                          <a
                            className="font-medium hover:text-cyan-600 hover:underline"
                            href={`https://www.torn.com/profiles.php?XID=${member.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {member.name}
                          </a>
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {member.id}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-medium">
                          {formatWindow(member.reliableWindow.startHour)}
                        </td>
                        <td className="px-3 py-2.5 font-mono">
                          {member.reliableWindow.daysSeen}/{member.reliableWindow.totalDays} days
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 bg-muted">
                              <div
                                className={cn(
                                  "h-full",
                                  member.reliableWindow.reliability >= 0.7
                                    ? "bg-emerald-500"
                                    : member.reliableWindow.reliability >= 0.4
                                      ? "bg-amber-500"
                                      : "bg-muted-foreground/50",
                                )}
                                style={{ width: `${member.reliableWindow.reliability * 100}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs">
                              {Math.round(member.reliableWindow.reliability * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono">{member.activeDays}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{member.activeBuckets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredMembers.length === 0 && !memberActivity.isPending && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No member activity matches that search.
                  </p>
                )}
              </CardContent>
            )}
            {(memberActivity.data?.failedPlayerIds.length ?? 0) > 0 && (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                FFScouter had no usable activity for {memberActivity.data?.failedPlayerIds.length}{" "}
                members.
              </div>
            )}
            {(memberActivity.data?.omittedPlayerIds.length ?? 0) > 0 && (
              <div className="border-t px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                Only the first 55 members were loaded to stay within FFScouter's player-activity
                rate limit.
              </div>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
