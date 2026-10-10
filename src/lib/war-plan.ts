import type { FFScouterMemberActivity } from "@/hooks/use-ffscouter";
import type { ActivityHour } from "./activity-tracking";

const HOUR = 3_600_000;

// Per member, per hour: true = seen active, false = seen inactive, missing = no observation.
export type MemberObservations = Map<number, Map<number, boolean>>;

export type PlanMember = {
  id: number;
  name: string;
  level: number;
  bs?: number;
  state: string;
  until: number;
  description: string;
};

export type WindowPresence = {
  // Share of observed days where the member was active at some point in the window.
  chance: number;
  daysSeen: number;
  daysObserved: number;
};

export type SideAnalysis = {
  members: PlanMember[];
  // presence[startHour][memberIndex]
  presence: WindowPresence[][];
  // Expected members active in each single hour of the day. `days` is how many days of
  // observations back the estimate; 0 means the hour was never observed.
  hourly: { count: number; strength: number; days: number }[];
  windows: { start: number; count: number; strength: number; days: number }[];
  daysObserved: number;
  covered: number;
};

export type SuggestedWindow = {
  kind: "push" | "defend" | "chain";
  start: number;
  length: number;
  ours: { count: number; strength: number; days: number };
  theirs: { count: number; strength: number; days: number };
};

/** FFScouter covers every hour of the requested range; buckets mark the active ones. */
export function observationsFromFFScouter(
  activity: FFScouterMemberActivity[],
  start: number,
  end: number,
): MemberObservations {
  const result: MemberObservations = new Map();
  const latest = Math.max(0, ...activity.flatMap((member) => member.buckets.map((b) => b.ts)));
  // FFScouter lags behind real time, so hours after its latest bucket are unobserved.
  const last = Math.min(end, (latest + 3600) * 1000);
  for (const { playerId, buckets } of activity) {
    const hours = new Map<number, boolean>();
    for (let hour = start; hour < last; hour += HOUR) hours.set(hour, false);
    for (const bucket of buckets) {
      if (bucket.activity_score > 0) hours.set(Math.floor(bucket.ts / 3600) * HOUR, true);
    }
    result.set(playerId, hours);
  }
  return result;
}

/** Presence recorded by TornOps itself while the war room refreshed this faction. */
export function observationsFromRecorded(rows: ActivityHour[]): MemberObservations {
  const result: MemberObservations = new Map();
  for (const row of rows) {
    for (const [id, counts] of Object.entries(row.members)) {
      const hours = result.get(Number(id)) ?? new Map<number, boolean>();
      hours.set(row.hour, counts.online + counts.idle > 0 || hours.get(row.hour) === true);
      result.set(Number(id), hours);
    }
  }
  return result;
}

export function mergeObservations(...sources: MemberObservations[]): MemberObservations {
  const result: MemberObservations = new Map();
  for (const source of sources) {
    for (const [id, hours] of source) {
      const merged = result.get(id) ?? new Map<number, boolean>();
      for (const [hour, active] of hours) merged.set(hour, active || merged.get(hour) === true);
      result.set(id, merged);
    }
  }
  return result;
}

export function zonedParts(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// day -> 24 slots of active/inactive/unobserved
function dailyGrid(hours: Map<number, boolean>, timeZone: string) {
  const days = new Map<string, Array<boolean | undefined>>();
  for (const [at, active] of hours) {
    const { day, hour } = zonedParts(at, timeZone);
    const slots = days.get(day) ?? Array.from({ length: 24 }, () => undefined);
    slots[hour] = active || slots[hour] === true;
    days.set(day, slots);
  }
  return days;
}

export function analyzeSide(
  members: PlanMember[],
  observations: MemberObservations,
  timeZone: string,
  length: number,
): SideAnalysis {
  const grids = members.map((member) =>
    dailyGrid(observations.get(member.id) ?? new Map(), timeZone),
  );
  const presence = Array.from({ length: 24 }, (_, start) =>
    grids.map((grid) => {
      let daysSeen = 0;
      let daysObserved = 0;
      for (const slots of grid.values()) {
        const window = Array.from({ length }, (_, offset) => slots[(start + offset) % 24]);
        if (window.every((slot) => slot === undefined)) continue;
        daysObserved += 1;
        if (window.some(Boolean)) daysSeen += 1;
      }
      return { chance: daysObserved ? daysSeen / daysObserved : 0, daysSeen, daysObserved };
    }),
  );
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    let count = 0;
    let strength = 0;
    let days = 0;
    grids.forEach((grid, index) => {
      const slots = [...grid.values()].map((day) => day[hour]).filter((slot) => slot !== undefined);
      if (!slots.length) return;
      const chance = slots.filter(Boolean).length / slots.length;
      count += chance;
      strength += chance * (members[index].bs ?? 0);
      days = Math.max(days, slots.length);
    });
    return { count, strength, days };
  });
  const windows = presence.map((row, start) => ({
    start,
    count: row.reduce((sum, value) => sum + value.chance, 0),
    strength: row.reduce((sum, value, index) => sum + value.chance * (members[index].bs ?? 0), 0),
    days: Math.max(0, ...row.map((value) => value.daysObserved)),
  }));
  return {
    members,
    presence,
    hourly,
    windows,
    daysObserved: Math.max(0, ...grids.map((grid) => grid.size)),
    covered: grids.filter((grid) => grid.size).length,
  };
}

const overlaps = (a: number, b: number, length: number) => {
  const distance = Math.abs(a - b) % 24;
  return Math.min(distance, 24 - distance) < length;
};

function pickSeparated(starts: number[], length: number, limit: number) {
  const picked: number[] = [];
  for (const start of starts) {
    if (picked.some((other) => overlaps(start, other, length))) continue;
    picked.push(start);
    if (picked.length === limit) break;
  }
  return picked;
}

/**
 * Push: our headcount is high while their online strength is low.
 * Defend: the reverse. Chain risk: our expected headcount is below the chain threshold.
 * Hours with fewer than `minDays` days of observations are never suggested, since an
 * unobserved hour would otherwise look empty.
 */
export function suggestWindows(
  ours: SideAnalysis,
  theirs: SideAnalysis,
  length: number,
  { chainThreshold = 3, minDays = 2 } = {},
): SuggestedWindow[] {
  const ourMax = Math.max(1e-9, ...ours.windows.map((w) => w.count));
  // Fall back to headcount if there are no battle stat estimates for the enemy.
  const theirValue = (w: { count: number; strength: number }) =>
    theirs.windows.some((x) => x.strength > 0) ? w.strength : w.count;
  const theirMax = Math.max(1e-9, ...theirs.windows.map(theirValue));
  const score = (start: number) =>
    ours.windows[start].count / ourMax - theirValue(theirs.windows[start]) / theirMax;
  const all = Array.from({ length: 24 }, (_, hour) => hour);
  const hours = all.filter(
    (start) => ours.windows[start].days >= minDays && theirs.windows[start].days >= minDays,
  );
  const build = (kind: SuggestedWindow["kind"], start: number): SuggestedWindow => ({
    kind,
    start,
    length,
    ours: ours.windows[start],
    theirs: theirs.windows[start],
  });
  const push = pickSeparated(
    [...hours].sort((a, b) => score(b) - score(a)),
    length,
    2,
  );
  const defend = pickSeparated(
    [...hours].sort((a, b) => score(a) - score(b)),
    length,
    1,
  ).filter((start) => !push.some((other) => overlaps(start, other, length)));
  const chain = pickSeparated(
    all
      .filter(
        (hour) => ours.hourly[hour].days >= minDays && ours.hourly[hour].count < chainThreshold,
      )
      .sort((a, b) => ours.hourly[a].count - ours.hourly[b].count),
    1,
    1,
  );
  return [
    ...push.map((start) => build("push", start)),
    ...defend.map((start) => build("defend", start)),
    ...chain.map((start) => ({ ...build("chain", start), length: 1, ours: ours.hourly[start] })),
  ];
}

/** Start (ms) of the next `hour` in `timeZone`; the current hour counts if it matches. */
export function nextOccurrence(hour: number, from: number, timeZone: string) {
  let at = Math.floor(from / HOUR) * HOUR;
  for (let i = 0; i < 48; i += 1, at += HOUR) {
    if (zonedParts(at, timeZone).hour === hour) return at;
  }
  return at;
}

export function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type Target = PlanMember & { offline: number; daysObserved: number; beatable: boolean };

/** Enemies most likely offline in the window, beatable ones first. */
export function rankTargets(theirs: SideAnalysis, start: number, cap: number | undefined) {
  return theirs.members
    .map((member, index): Target => {
      const presence = theirs.presence[start][index];
      return {
        ...member,
        offline: presence.daysObserved ? 1 - presence.chance : 0,
        daysObserved: presence.daysObserved,
        beatable: cap === undefined || member.bs === undefined || member.bs <= cap,
      };
    })
    .filter((target) => target.daysObserved > 0 && target.offline >= 0.5)
    .sort(
      (a, b) =>
        Number(b.beatable) - Number(a.beatable) ||
        b.offline - a.offline ||
        (b.bs ?? 0) - (a.bs ?? 0),
    );
}

export function formatStats(value: number | undefined) {
  if (value === undefined) return "?";
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}b`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}m`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  return String(Math.round(value));
}

export function parseStats(value: string): number | undefined {
  const match = /^\s*([\d.]+)\s*([kmbt]?)\s*$/i.exec(value);
  if (!match) return undefined;
  const scale = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[match[2].toLowerCase()] ?? 1;
  return Number(match[1]) * scale;
}
