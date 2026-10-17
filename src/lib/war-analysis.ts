import type { FactionAttack } from "@/lib/faction";

export const PLANNING_WINDOW_HOURS = 3;

// An hour belongs to the war when the war covered at least half of it. The first and last
// hours of a war are usually partial.
const LIVE_HOUR_SECONDS = 30 * 60;
// Every time zone offset is a multiple of 15 minutes, so quarter hours never straddle two
// local hours.
const QUARTER_HOUR_SECONDS = 15 * 60;

const CHAIN_BONUS_HITS = new Set([
  10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
]);
const FAILED_RESULTS = new Set(["Lost", "Stalemate", "Escape", "Timeout", "Interrupted"]);

export type WarRange = { from: number; to: number };

export type ResultGroup = "hit" | "assist" | "failed" | "other";

export type HourOfDay = {
  hour: number;
  liveHours: number;
  attacks: number;
  hits: number;
  respectGained: number;
  hitsTaken: number;
  respectLost: number;
};

export type DayHour = { live: boolean; attacks: number; hitsTaken: number };

export type DayRow = { day: string; hours: DayHour[] };

export type ScheduleWindow = {
  startHour: number;
  sampledDays: number;
  medianMembers: number;
  averageMembers: number;
  bestDayMembers: number;
  daysWithCoverage: number;
  enemyMedianAttackers: number;
  enemyAverageAttackers: number;
  averageHitsTaken: number;
  averageNetRespect: number;
};

export type ReliableWindow = {
  startHour: number;
  daysSeen: number;
  sampledDays: number;
  reliability: number;
  confidence: number;
};

export type AttackTotals = {
  attacks: number;
  hits: number;
  failed: number;
  assists: number;
  bonusHits: number;
  respect: number;
  bonusRespect: number;
  respectPerHit: number;
  fairFight: number | null;
  attackers: number;
  incomingAttacks: number;
  hitsTaken: number;
  respectLost: number;
  defendsWon: number;
  enemyAttackers: number;
};

export type MemberSummary = {
  id: number;
  name: string;
  attacks: number;
  hits: number;
  failed: number;
  assists: number;
  bonusHits: number;
  respect: number;
  bonusRespect: number;
  respectPerHit: number;
  fairFight: number | null;
  hitsTaken: number;
  respectLost: number;
  lastAttack: number;
  reliableWindow: ReliableWindow | null;
};

export type ResultCount = { result: string; group: ResultGroup; count: number };

export type TargetSummary = { id: number; name: string; hits: number; respect: number };

export type WarAnalysis = {
  totals: AttackTotals;
  hours: HourOfDay[];
  days: DayRow[];
  liveHours: number;
  scheduleWindows: ScheduleWindow[];
  members: MemberSummary[];
  results: ResultCount[];
  targets: TargetSummary[];
  topFiveShare: number;
};

export function resultGroup(attack: FactionAttack): ResultGroup {
  if (attack.is_interrupted || FAILED_RESULTS.has(attack.result)) return "failed";
  if (attack.result === "Assist") return "assist";
  if (attack.respect_gain > 0) return "hit";
  return "other";
}

export const isHit = (attack: FactionAttack) => resultGroup(attack) === "hit";

// Chain bonus hits pay a fixed, much larger amount of respect. They say nothing about how
// well the target was chosen, so per-hit averages leave them out.
export const isBonusHit = (attack: FactionAttack) =>
  isHit(attack) && attack.chain !== null && CHAIN_BONUS_HITS.has(attack.chain);

type Slot = { day: string; hour: number };

function createClock(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone === "local" ? undefined : timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return (timestamp: number): Slot => {
    const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const part of format.formatToParts(new Date(timestamp * 1000))) {
      parts[part.type] = part.value;
    }
    return {
      day: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour) % 24,
    };
  };
}

const slotKey = (day: string, hour: number) => `${day} ${hour}`;

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// A window that starts late in the evening runs into the next calendar day.
function windowSlots(day: string, startHour: number) {
  return Array.from({ length: PLANNING_WINDOW_HOURS }, (_, offset) => {
    const hour = startHour + offset;
    return hour < 24 ? slotKey(day, hour) : slotKey(nextDay(day), hour - 24);
  });
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

// Lower bound of the Wilson score interval. Ranks 4 of 5 days above 1 of 1 day.
function wilsonLowerBound(successes: number, trials: number, z = 1.28) {
  if (trials === 0) return 0;
  const rate = successes / trials;
  const z2 = z ** 2;
  return (
    (rate +
      z2 / (2 * trials) -
      z * Math.sqrt((rate * (1 - rate)) / trials + z2 / (4 * trials ** 2))) /
    (1 + z2 / trials)
  );
}

function averageFairFight(attacks: FactionAttack[]) {
  const values = attacks
    .filter((attack) => isHit(attack) && typeof attack.modifiers?.fair_fight === "number")
    .map((attack) => attack.modifiers?.fair_fight as number);
  return values.length ? average(values) : null;
}

export function summarizeAttacks(
  outgoing: FactionAttack[],
  incoming: FactionAttack[],
): AttackTotals {
  const hits = outgoing.filter(isHit);
  const bonusHits = hits.filter(isBonusHit);
  const respect = hits.reduce((total, attack) => total + attack.respect_gain, 0);
  const bonusRespect = bonusHits.reduce((total, attack) => total + attack.respect_gain, 0);
  const hitsTaken = incoming.filter(isHit);

  return {
    attacks: outgoing.length,
    hits: hits.length,
    failed: outgoing.filter((attack) => resultGroup(attack) === "failed").length,
    assists: outgoing.filter((attack) => resultGroup(attack) === "assist").length,
    bonusHits: bonusHits.length,
    respect,
    bonusRespect,
    respectPerHit: (respect - bonusRespect) / Math.max(1, hits.length - bonusHits.length),
    fairFight: averageFairFight(outgoing),
    attackers: new Set(outgoing.flatMap((attack) => (attack.attacker ? [attack.attacker.id] : [])))
      .size,
    incomingAttacks: incoming.length,
    hitsTaken: hitsTaken.length,
    respectLost: hitsTaken.reduce((total, attack) => total + attack.respect_gain, 0),
    defendsWon: incoming.filter((attack) => resultGroup(attack) === "failed").length,
    enemyAttackers: new Set(
      incoming.flatMap((attack) => (attack.attacker ? [attack.attacker.id] : [])),
    ).size,
  };
}

export function analyzeWar({
  outgoing,
  incoming,
  ranges,
  timeZone,
}: {
  outgoing: FactionAttack[];
  incoming: FactionAttack[];
  ranges: WarRange[];
  timeZone: string;
}): WarAnalysis {
  const slotAt = createClock(timeZone);

  // How many seconds of each local hour the selected wars covered.
  const exposure = new Map<string, number>();
  for (const range of ranges) {
    const first = Math.floor(range.from / QUARTER_HOUR_SECONDS) * QUARTER_HOUR_SECONDS;
    for (let start = first; start < range.to; start += QUARTER_HOUR_SECONDS) {
      const covered =
        Math.min(range.to, start + QUARTER_HOUR_SECONDS) - Math.max(range.from, start);
      if (covered <= 0) continue;
      const { day, hour } = slotAt(start);
      const key = slotKey(day, hour);
      exposure.set(key, (exposure.get(key) ?? 0) + covered);
    }
  }
  const liveSlots = new Set(
    [...exposure].filter(([, seconds]) => seconds >= LIVE_HOUR_SECONDS).map(([key]) => key),
  );

  const hours: HourOfDay[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    liveHours: 0,
    attacks: 0,
    hits: 0,
    respectGained: 0,
    hitsTaken: 0,
    respectLost: 0,
  }));
  const dayRows = new Map<string, DayHour[]>();
  const dayRow = (day: string) => {
    const existing = dayRows.get(day);
    if (existing) return existing;
    const row = Array.from({ length: 24 }, (_, hour) => ({
      live: liveSlots.has(slotKey(day, hour)),
      attacks: 0,
      hitsTaken: 0,
    }));
    dayRows.set(day, row);
    return row;
  };
  for (const key of liveSlots) {
    const [day, hour] = key.split(" ");
    hours[Number(hour)].liveHours += 1;
    dayRow(day);
  }

  type SlotActivity = {
    members: Set<number>;
    enemies: Set<number>;
    hitsTaken: number;
    netRespect: number;
  };
  const slots = new Map<string, SlotActivity>();
  const slotActivity = (key: string) => {
    const existing = slots.get(key);
    if (existing) return existing;
    const activity = {
      members: new Set<number>(),
      enemies: new Set<number>(),
      hitsTaken: 0,
      netRespect: 0,
    };
    slots.set(key, activity);
    return activity;
  };

  type MemberAccumulator = {
    id: number;
    name: string;
    outgoing: FactionAttack[];
    hitsTaken: number;
    respectLost: number;
    slots: Set<string>;
  };
  const members = new Map<number, MemberAccumulator>();
  const member = (id: number, name: string) => {
    const existing = members.get(id);
    if (existing) return existing;
    const created = {
      id,
      name,
      outgoing: [],
      hitsTaken: 0,
      respectLost: 0,
      slots: new Set<string>(),
    };
    members.set(id, created);
    return created;
  };
  const results = new Map<string, ResultCount>();
  const targets = new Map<number, TargetSummary>();

  for (const attack of outgoing) {
    const { day, hour } = slotAt(attack.ended);
    const key = slotKey(day, hour);
    const hit = isHit(attack);
    hours[hour].attacks += 1;
    dayRow(day)[hour].attacks += 1;
    const result = results.get(attack.result) ?? {
      result: attack.result,
      group: resultGroup(attack),
      count: 0,
    };
    result.count += 1;
    results.set(attack.result, result);

    if (hit) {
      hours[hour].hits += 1;
      hours[hour].respectGained += attack.respect_gain;
      slotActivity(key).netRespect += attack.respect_gain;
      const target = targets.get(attack.defender.id) ?? {
        id: attack.defender.id,
        name: attack.defender.name,
        hits: 0,
        respect: 0,
      };
      target.hits += 1;
      target.respect += attack.respect_gain;
      targets.set(target.id, target);
    }
    if (!attack.attacker) continue;
    slotActivity(key).members.add(attack.attacker.id);
    const summary = member(attack.attacker.id, attack.attacker.name);
    summary.outgoing.push(attack);
    summary.slots.add(key);
  }

  for (const attack of incoming) {
    const { day, hour } = slotAt(attack.ended);
    const key = slotKey(day, hour);
    if (attack.attacker) slotActivity(key).enemies.add(attack.attacker.id);
    if (!isHit(attack)) continue;
    hours[hour].hitsTaken += 1;
    hours[hour].respectLost += attack.respect_gain;
    dayRow(day)[hour].hitsTaken += 1;
    const activity = slotActivity(key);
    activity.hitsTaken += 1;
    activity.netRespect -= attack.respect_gain;
    const defender = member(attack.defender.id, attack.defender.name);
    defender.hitsTaken += 1;
    defender.respectLost += attack.respect_gain;
  }

  const warDays = [...dayRows.keys()].sort();
  // For every start hour, the days on which the whole window fell inside a war.
  const windowSamples = Array.from({ length: 24 }, (_, startHour) =>
    warDays
      .map((day) => windowSlots(day, startHour))
      .filter((keys) => keys.every((key) => liveSlots.has(key))),
  );

  const scheduleWindows: ScheduleWindow[] = windowSamples.map((samples, startHour) => {
    const days = samples.map((keys) => {
      const members = new Set<number>();
      const enemies = new Set<number>();
      let hitsTaken = 0;
      let netRespect = 0;
      for (const key of keys) {
        const activity = slots.get(key);
        if (!activity) continue;
        for (const id of activity.members) members.add(id);
        for (const id of activity.enemies) enemies.add(id);
        hitsTaken += activity.hitsTaken;
        netRespect += activity.netRespect;
      }
      return { members: members.size, enemies: enemies.size, hitsTaken, netRespect };
    });
    const memberCounts = days.map((day) => day.members);
    const enemyCounts = days.map((day) => day.enemies);
    return {
      startHour,
      sampledDays: samples.length,
      medianMembers: median(memberCounts),
      averageMembers: average(memberCounts),
      bestDayMembers: Math.max(0, ...memberCounts),
      daysWithCoverage: memberCounts.filter((count) => count > 0).length,
      enemyMedianAttackers: median(enemyCounts),
      enemyAverageAttackers: average(enemyCounts),
      averageHitsTaken: average(days.map((day) => day.hitsTaken)),
      averageNetRespect: average(days.map((day) => day.netRespect)),
    };
  });

  const memberRows: MemberSummary[] = [...members.values()]
    .map((summary) => {
      const totals = summarizeAttacks(summary.outgoing, []);
      const windows = windowSamples.flatMap((samples, startHour) => {
        if (samples.length === 0) return [];
        const daysSeen = samples.filter((keys) =>
          keys.some((key) => summary.slots.has(key)),
        ).length;
        return [
          {
            startHour,
            daysSeen,
            sampledDays: samples.length,
            reliability: daysSeen / samples.length,
            confidence: wilsonLowerBound(daysSeen, samples.length),
          },
        ];
      });
      const reliableWindow = windows.length
        ? windows.reduce((best, window) =>
            window.confidence > best.confidence ||
            (window.confidence === best.confidence && window.daysSeen > best.daysSeen)
              ? window
              : best,
          )
        : null;

      return {
        id: summary.id,
        name: summary.name,
        attacks: totals.attacks,
        hits: totals.hits,
        failed: totals.failed,
        assists: totals.assists,
        bonusHits: totals.bonusHits,
        respect: totals.respect,
        bonusRespect: totals.bonusRespect,
        respectPerHit: totals.respectPerHit,
        fairFight: totals.fairFight,
        hitsTaken: summary.hitsTaken,
        respectLost: summary.respectLost,
        lastAttack: Math.max(0, ...summary.outgoing.map((attack) => attack.ended)),
        reliableWindow,
      };
    })
    .sort(
      (a, b) =>
        (b.reliableWindow?.confidence ?? 0) - (a.reliableWindow?.confidence ?? 0) ||
        b.hits - a.hits ||
        b.respect - a.respect,
    );

  const totals = summarizeAttacks(outgoing, incoming);
  const topFiveRespect = memberRows
    .map((row) => row.respect)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((total, respect) => total + respect, 0);

  return {
    totals,
    hours,
    days: warDays.map((day) => ({ day, hours: dayRows.get(day) ?? [] })),
    liveHours: liveSlots.size,
    scheduleWindows,
    members: memberRows,
    results: [...results.values()].sort((a, b) => b.count - a.count),
    targets: [...targets.values()].sort((a, b) => b.hits - a.hits || b.respect - a.respect),
    topFiveShare: totals.respect > 0 ? topFiveRespect / totals.respect : 0,
  };
}

function windowsOverlap(a: number, b: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 24 - distance) < PLANNING_WINDOW_HOURS;
}

function pickSeparated(ranked: ScheduleWindow[], count = 3) {
  const selected: ScheduleWindow[] = [];
  for (const candidate of ranked) {
    if (selected.some((window) => windowsOverlap(window.startHour, candidate.startHour))) {
      continue;
    }
    selected.push(candidate);
    if (selected.length === count) break;
  }
  return selected;
}

export function pushWindows(windows: ScheduleWindow[]) {
  return pickSeparated(
    windows
      .filter((window) => window.sampledDays > 0)
      .sort(
        (a, b) =>
          b.medianMembers - a.medianMembers ||
          b.averageMembers - a.averageMembers ||
          a.startHour - b.startHour,
      ),
  );
}

// The gaps that matter are the ones the enemy uses. Rank by how far the enemy outnumbers
// us, then by how hard they hit.
export function dangerWindows(windows: ScheduleWindow[]) {
  return pickSeparated(
    windows
      .filter((window) => window.sampledDays > 0)
      .sort(
        (a, b) =>
          b.enemyAverageAttackers -
            b.averageMembers -
            (a.enemyAverageAttackers - a.averageMembers) ||
          b.averageHitsTaken - a.averageHitsTaken ||
          a.averageMembers - b.averageMembers ||
          a.startHour - b.startHour,
      ),
  );
}

export type RosterMember = { id: number; name: string; position: string; daysInFaction: number };

export type AbsentMember = RosterMember & {
  joined: "before" | "during" | "after";
  hitsTaken: number;
};

// Current members with no successful war hit in the selection. Torn only reports whole
// days in the faction, so the join time is an estimate.
export function findAbsentMembers(
  roster: RosterMember[],
  members: MemberSummary[],
  selection: WarRange,
  now: number,
): AbsentMember[] {
  const byId = new Map(members.map((summary) => [summary.id, summary]));
  const order = { before: 0, during: 1, after: 2 };
  return roster
    .filter((rosterMember) => (byId.get(rosterMember.id)?.hits ?? 0) === 0)
    .map((rosterMember) => {
      const joinedAt = now - rosterMember.daysInFaction * 86_400;
      const joined: AbsentMember["joined"] =
        joinedAt <= selection.from ? "before" : joinedAt < selection.to ? "during" : "after";
      return { ...rosterMember, joined, hitsTaken: byId.get(rosterMember.id)?.hitsTaken ?? 0 };
    })
    .sort((a, b) => order[a.joined] - order[b.joined] || a.name.localeCompare(b.name));
}
