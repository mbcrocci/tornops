import { describe, expect, it } from "vite-plus/test";
import type { FactionAttack } from "@/lib/faction";
import {
  analyzeWar,
  chainWatch,
  dangerWindows,
  findAbsentMembers,
  pushWindows,
  type ScheduleWindow,
} from "./war-analysis";

const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function attack(
  id: number,
  ended: string,
  attackerId: number,
  overrides: Partial<FactionAttack> = {},
): FactionAttack {
  return {
    id,
    code: `attack-${id}`,
    started: seconds(ended) - 5,
    ended: seconds(ended),
    attacker: {
      id: attackerId,
      name: `Member ${attackerId}`,
      level: 50,
      faction: { id: 1, name: "Test faction" },
    },
    defender: {
      id: 9000 + id,
      name: `Defender ${id}`,
      level: 10,
      faction: { id: 2, name: "Other faction" },
    },
    result: "Hospitalized",
    respect_gain: 2,
    respect_loss: 0,
    chain: 1,
    is_interrupted: false,
    is_stealthed: false,
    is_raid: false,
    is_ranked_war: true,
    is_territory_war: false,
    ...overrides,
  };
}

function incoming(id: number, ended: string, attackerId: number, defenderId: number) {
  return attack(id, ended, attackerId, {
    attacker: {
      id: attackerId,
      name: `Enemy ${attackerId}`,
      level: 50,
      faction: { id: 2, name: "Other faction" },
    },
    defender: {
      id: defenderId,
      name: `Member ${defenderId}`,
      level: 50,
      faction: { id: 1, name: "Test faction" },
    },
  });
}

const range = (from: string, to: string) => ({ from: seconds(from), to: seconds(to) });

function scheduleWindow(overrides: Partial<ScheduleWindow>): ScheduleWindow {
  return {
    startHour: 0,
    sampledDays: 1,
    medianMembers: 0,
    averageMembers: 0,
    bestDayMembers: 0,
    daysWithCoverage: 0,
    enemyMedianAttackers: 0,
    enemyAverageAttackers: 0,
    averageHitsTaken: 0,
    averageNetRespect: 0,
    ...overrides,
  };
}

describe("analyzeWar", () => {
  it("groups activity in the selected timezone", () => {
    const result = analyzeWar({
      outgoing: [attack(1, "2026-09-20T23:30:00Z", 10), attack(2, "2026-09-21T00:30:00Z", 11)],
      incoming: [],
      ranges: [range("2026-09-20T22:00:00Z", "2026-09-21T02:00:00Z")],
      timeZone: "America/New_York",
    });

    expect(result.hours[19].attacks).toBe(1);
    expect(result.hours[20].attacks).toBe(1);
    expect(result.days.map((row) => row.day)).toEqual(["2026-09-20"]);
  });

  it("only samples hours when the war was running", () => {
    // The war starts at 20:00 on the 20th and ends at 02:00 on the 22nd.
    const result = analyzeWar({
      outgoing: [attack(1, "2026-09-20T21:10:00Z", 10), attack(2, "2026-09-21T21:20:00Z", 10)],
      incoming: [],
      ranges: [range("2026-09-20T20:00:00Z", "2026-09-22T02:00:00Z")],
      timeZone: "UTC",
    });

    expect(result.liveHours).toBe(30);
    expect(result.hours[10].liveHours).toBe(1);
    expect(result.hours[21].liveHours).toBe(2);
    expect(result.days[0].hours[19].live).toBe(false);
    expect(result.days[0].hours[20].live).toBe(true);
    // 10:00 only ran on the 21st, so it was sampled once instead of on every day.
    expect(result.scheduleWindows[10].sampledDays).toBe(1);
    expect(result.scheduleWindows[20]).toMatchObject({ sampledDays: 2, medianMembers: 1 });
    expect(result.members[0].reliableWindow).toMatchObject({
      daysSeen: 2,
      sampledDays: 2,
      reliability: 1,
    });
  });

  it("carries planning windows across midnight", () => {
    const result = analyzeWar({
      outgoing: [attack(1, "2026-09-21T00:30:00Z", 10), attack(2, "2026-09-21T01:30:00Z", 11)],
      incoming: [],
      ranges: [range("2026-09-20T20:00:00Z", "2026-09-21T06:00:00Z")],
      timeZone: "UTC",
    });

    expect(result.scheduleWindows[23]).toMatchObject({ sampledDays: 1, medianMembers: 2 });
  });

  it("separates hits, failures, assists and chain bonus hits", () => {
    const result = analyzeWar({
      outgoing: [
        attack(1, "2026-09-20T10:00:00Z", 10, { respect_gain: 4 }),
        attack(2, "2026-09-20T10:10:00Z", 10, { respect_gain: 0, result: "Lost" }),
        attack(3, "2026-09-20T10:20:00Z", 10, { respect_gain: 0, result: "Assist" }),
        attack(4, "2026-09-20T10:30:00Z", 10, { respect_gain: 20, chain: 25 }),
        attack(5, "2026-09-20T10:40:00Z", 11, {
          respect_gain: 0,
          result: "Stalemate",
          modifiers: { fair_fight: 3 },
        }),
        attack(6, "2026-09-20T10:50:00Z", 11, { respect_gain: 2, modifiers: { fair_fight: 2.5 } }),
      ],
      incoming: [
        incoming(7, "2026-09-20T11:00:00Z", 50, 11),
        incoming(8, "2026-09-20T11:10:00Z", 51, 11),
      ],
      ranges: [range("2026-09-20T09:00:00Z", "2026-09-20T12:00:00Z")],
      timeZone: "UTC",
    });

    expect(result.totals).toMatchObject({
      attacks: 6,
      hits: 3,
      failed: 2,
      assists: 1,
      bonusHits: 1,
      respect: 26,
      bonusRespect: 20,
      respectPerHit: 3,
      fairFight: 2.5,
      hitsTaken: 2,
      respectLost: 4,
      enemyAttackers: 2,
    });
    expect(result.members.find((row) => row.id === 10)).toMatchObject({
      hits: 2,
      failed: 1,
      respectPerHit: 4,
    });
    expect(result.members.find((row) => row.id === 11)).toMatchObject({ hitsTaken: 2 });
    expect(result.hours[11]).toMatchObject({ hitsTaken: 2, respectLost: 4 });
    expect(result.results[0]).toMatchObject({ result: "Hospitalized", group: "hit", count: 3 });
    expect(result.topFiveShare).toBe(1);
  });
});

describe("planning windows", () => {
  it("picks pushes that do not overlap, including across midnight", () => {
    const windows = [
      scheduleWindow({ startHour: 23, medianMembers: 9 }),
      scheduleWindow({ startHour: 0, medianMembers: 8 }),
      scheduleWindow({ startHour: 1, medianMembers: 7 }),
      scheduleWindow({ startHour: 2, medianMembers: 6 }),
      scheduleWindow({ startHour: 12, medianMembers: 5, sampledDays: 0 }),
    ];

    expect(pushWindows(windows).map((window) => window.startHour)).toEqual([23, 2]);
  });

  it("ranks danger by how far the enemy outnumbers us", () => {
    const windows = [
      scheduleWindow({ startHour: 3, averageMembers: 0, enemyAverageAttackers: 1 }),
      scheduleWindow({ startHour: 12, averageMembers: 4, enemyAverageAttackers: 9 }),
      scheduleWindow({ startHour: 18, averageMembers: 8, enemyAverageAttackers: 6 }),
    ];

    expect(dangerWindows(windows).map((window) => window.startHour)).toEqual([12, 3, 18]);
  });
});

describe("findAbsentMembers", () => {
  it("lists members without hits and estimates when they joined", () => {
    const now = seconds("2026-10-01T00:00:00Z");
    const result = analyzeWar({
      outgoing: [attack(1, "2026-09-20T10:00:00Z", 10)],
      incoming: [incoming(2, "2026-09-20T11:00:00Z", 50, 12)],
      ranges: [range("2026-09-20T09:00:00Z", "2026-09-21T09:00:00Z")],
      timeZone: "UTC",
    });

    const absent = findAbsentMembers(
      [
        { id: 10, name: "Hitter", position: "Member", daysInFaction: 100 },
        { id: 11, name: "Recruit", position: "Member", daysInFaction: 2 },
        { id: 12, name: "Sleeper", position: "Member", daysInFaction: 100 },
      ],
      result.members,
      range("2026-09-20T09:00:00Z", "2026-09-21T09:00:00Z"),
      now,
    );

    expect(absent).toEqual([
      {
        id: 12,
        name: "Sleeper",
        position: "Member",
        daysInFaction: 100,
        joined: "before",
        hitsTaken: 1,
      },
      {
        id: 11,
        name: "Recruit",
        position: "Member",
        daysInFaction: 2,
        joined: "after",
        hitsTaken: 0,
      },
    ]);
  });
});

describe("chainWatch", () => {
  it("credits each hit with the time since the previous chain hit", () => {
    const watch = chainWatch([
      attack(1, "2026-01-01T00:00:00Z", 1, { chain: 1 }),
      attack(2, "2026-01-01T00:01:00Z", 2, { chain: 2 }),
      attack(3, "2026-01-01T00:04:00Z", 1, { chain: 3 }),
    ]);
    expect(watch.chainSeconds).toBe(240);
    expect(watch.seconds.get(1)).toBe(180);
    expect(watch.seconds.get(2)).toBe(60);
  });

  it("starts over when a new chain begins and caps gaps at the chain timeout", () => {
    const watch = chainWatch([
      attack(1, "2026-01-01T00:00:00Z", 1, { chain: 5 }),
      attack(2, "2026-01-01T00:02:00Z", 2, { chain: 1 }),
      attack(3, "2026-01-01T00:20:00Z", 2, { chain: 9 }),
      attack(4, "2026-01-01T00:21:00Z", 1, { result: "Lost", respect_gain: 0, chain: 0 }),
    ]);
    expect(watch.chainSeconds).toBe(300);
    expect(watch.seconds.get(2)).toBe(300);
    expect(watch.seconds.has(1)).toBe(false);
  });
});
