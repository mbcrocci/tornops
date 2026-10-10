import { describe, expect, it } from "vite-plus/test";
import { addObservation } from "./activity-tracking";
import type { Faction } from "./faction";
import {
  analyzeSide,
  mergeObservations,
  nextOccurrence,
  observationsFromFFScouter,
  observationsFromRecorded,
  parseStats,
  type PlanMember,
  rankTargets,
  suggestWindows,
} from "./war-plan";
import { buildPlanMessage } from "./war-plan-message";

const HOUR = 3_600_000;
const day0 = Date.UTC(2026, 9, 1);

function member(id: number, bs?: number): PlanMember {
  return { id, name: `M${id}`, level: 50, bs, state: "Okay", until: 0, description: "Okay" };
}

// Member active at the given UTC hours on each of `days` days.
function ffs(activeHours: Record<number, number[]>, days = 4) {
  const start = day0;
  const end = day0 + days * 24 * HOUR;
  const activity = Object.entries(activeHours).map(([id, hours]) => ({
    playerId: Number(id),
    buckets: Array.from({ length: days }, (_, d) =>
      hours.map((hour) => ({ ts: (day0 + (d * 24 + hour) * HOUR) / 1000, activity_score: 1 })),
    ).flat(),
  }));
  // A sentinel bucket so the observed range reaches the end of the last day.
  activity.push({ playerId: -1, buckets: [{ ts: (end - HOUR) / 1000, activity_score: 0 }] });
  return observationsFromFFScouter(activity, start, end);
}

describe("observations", () => {
  it("treats FFScouter hours without a bucket as observed inactive", () => {
    const observations = ffs({ 1: [10] }, 1);
    expect(observations.get(1)?.get(day0 + 10 * HOUR)).toBe(true);
    expect(observations.get(1)?.get(day0 + 11 * HOUR)).toBe(false);
  });
  it("leaves hours after FFScouter's latest bucket unobserved", () => {
    const observations = observationsFromFFScouter(
      [{ playerId: 1, buckets: [{ ts: (day0 + 2 * HOUR) / 1000, activity_score: 1 }] }],
      day0,
      day0 + 24 * HOUR,
    );
    expect(observations.get(1)?.has(day0 + 3 * HOUR)).toBe(false);
  });
  it("fills gaps with presence TornOps recorded and lets either source mark activity", () => {
    const recorded = observationsFromRecorded([
      addObservation(
        undefined,
        {
          ID: 9,
          name: "Them",
          members: { 1: { name: "M1", last_action: { status: "Idle" } } },
        } as unknown as Faction,
        day0 + 11 * HOUR,
      ),
    ]);
    const merged = mergeObservations(ffs({ 1: [10] }, 1), recorded);
    expect(merged.get(1)?.get(day0 + 11 * HOUR)).toBe(true);
    expect(merged.get(1)?.get(day0 + 10 * HOUR)).toBe(true);
  });
});

describe("windows", () => {
  const ourMembers = [member(1, 1e9), member(2, 1e9)];
  const theirMembers = [member(10, 5e9), member(11, 5e8)];
  const ours = analyzeSide(ourMembers, ffs({ 1: [2, 3, 4], 2: [3, 4] }), "UTC", 3);
  const theirs = analyzeSide(theirMembers, ffs({ 10: [14, 15], 11: [3, 20] }), "UTC", 3);

  it("estimates presence as the share of days active in the window", () => {
    expect(ours.presence[2][0]).toMatchObject({ chance: 1, daysSeen: 4, daysObserved: 4 });
    expect(ours.windows[2].count).toBe(2);
    expect(theirs.windows[13].strength).toBe(5e9);
  });

  it("suggests pushing when we are on and they are off, and warns when their stats are on", () => {
    const suggestions = suggestWindows(ours, theirs, 3);
    expect(suggestions[0]).toMatchObject({ kind: "push" });
    expect([2, 3, 4]).toContain(suggestions[0].start);
    const defend = suggestions.find((s) => s.kind === "defend");
    expect(defend && [12, 13, 14, 15]).toContain(defend?.start);
    expect(suggestions.find((s) => s.kind === "chain")?.ours.count).toBe(0);
  });

  it("ranks beatable, reliably offline targets first", () => {
    const targets = rankTargets(theirs, 2, 1e9);
    expect(targets.map((t) => [t.id, t.beatable])).toEqual([[10, false]]);
    const evening = rankTargets(theirs, 6, 1e9);
    expect(evening.map((t) => t.id)).toEqual([11, 10]);
    expect(evening[0].offline).toBe(1);
  });

  it("builds a chat message with attack links for the targets", () => {
    const message = buildPlanMessage({
      title: "Push",
      when: "Sat 02:00–05:00 TCT (in 3h)",
      ours: 2,
      theirs: 0.25,
      theirStrength: 1.25e8,
      cap: 1e9,
      targets: rankTargets(theirs, 6, 1e9).filter((t) => t.beatable),
      threats: [],
      rally: [member(2)],
    });
    expect(message).toContain("⚔️ Push: Sat 02:00–05:00 TCT");
    expect(message).toContain("1. M11 [11] · 500m · offline 100%");
    expect(message).toContain("sid=attack&user2ID=11");
    expect(message).toContain("Need online: M2");
  });
});

describe("partial observations", () => {
  // Only hours 18-21 were ever observed (TornOps open in the evening), for 3 days.
  function evenings(active: boolean) {
    const hours = new Map<number, boolean>();
    for (let d = 0; d < 3; d += 1)
      for (const h of [18, 19, 20, 21]) hours.set(day0 + (d * 24 + h) * HOUR, active);
    return hours;
  }
  const ours = analyzeSide([member(1, 1e9)], new Map([[1, evenings(true)]]), "UTC", 2);
  const theirs = analyzeSide([member(10, 1e9)], new Map([[10, evenings(false)]]), "UTC", 2);

  it("never suggests hours nobody observed, even though they look empty", () => {
    expect(ours.hourly[3]).toMatchObject({ count: 0, days: 0 });
    const suggestions = suggestWindows(ours, theirs, 2);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.start).toBeGreaterThanOrEqual(17);
    expect(suggestions[0]).toMatchObject({ kind: "push", ours: { days: 3 } });
  });
});

describe("helpers", () => {
  it("parses battle stat shorthand", () => {
    expect(parseStats("1.5b")).toBe(1.5e9);
    expect(parseStats("750m")).toBe(7.5e8);
    expect(parseStats("")).toBeUndefined();
  });
  it("finds the next start of an hour in a timezone", () => {
    const from = Date.UTC(2026, 9, 10, 22, 30);
    expect(nextOccurrence(22, from, "UTC")).toBe(Date.UTC(2026, 9, 10, 22));
    expect(nextOccurrence(2, from, "UTC")).toBe(Date.UTC(2026, 9, 11, 2));
    expect(nextOccurrence(8, from, "Asia/Singapore")).toBe(Date.UTC(2026, 9, 11, 0));
  });
});
