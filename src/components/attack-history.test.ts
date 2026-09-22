import { describe, expect, it } from "vitest";
import type { FactionAttack } from "@/lib/faction";
import { analyzeAttacks } from "./attack-history";

function attack(
  id: number,
  ended: string,
  attackerId: number,
  overrides: Partial<FactionAttack> = {},
): FactionAttack {
  return {
    id,
    code: `attack-${id}`,
    started: Math.floor(new Date(ended).getTime() / 1000) - 5,
    ended: Math.floor(new Date(ended).getTime() / 1000),
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
      faction: null,
    },
    result: "Attacked",
    respect_gain: 2,
    respect_loss: 0,
    chain: 1,
    is_interrupted: false,
    is_stealthed: false,
    is_raid: false,
    is_ranked_war: false,
    is_territory_war: false,
    ...overrides,
  };
}

describe("analyzeAttacks", () => {
  it("groups activity in the selected timezone", () => {
    const result = analyzeAttacks(
      [attack(1, "2026-09-20T23:30:00Z", 10), attack(2, "2026-09-21T00:30:00Z", 11)],
      "America/New_York",
    );

    expect(result.hours[19].attacks).toBe(1);
    expect(result.hours[20].attacks).toBe(1);
    expect([...result.days.keys()]).toEqual(["2026-09-20"]);
  });

  it("separates attempts from successful hits and finds member peak hours", () => {
    const result = analyzeAttacks(
      [
        attack(1, "2026-09-20T10:00:00Z", 10, { is_ranked_war: true }),
        attack(2, "2026-09-20T10:30:00Z", 10, { respect_gain: 0, result: "Lost" }),
        attack(3, "2026-09-21T18:00:00Z", 10),
      ],
      "UTC",
    );

    expect(result.members[0]).toMatchObject({
      attacks: 3,
      hits: 2,
      activeDays: 2,
      rankedWarHits: 1,
      peakHours: [10, 18],
    });
  });

  it("scores planning windows by unique members across active days", () => {
    const result = analyzeAttacks(
      [
        attack(1, "2026-09-20T10:00:00Z", 10),
        attack(2, "2026-09-20T10:15:00Z", 11),
        attack(3, "2026-09-21T10:30:00Z", 10),
        attack(4, "2026-09-22T20:00:00Z", 12),
      ],
      "UTC",
    );

    expect(result.scheduleWindows[10]).toMatchObject({
      medianMembers: 1,
      averageMembers: 1,
      bestDayMembers: 2,
      daysWithCoverage: 2,
      totalDays: 3,
    });
    expect(result.members.find((member) => member.id === 10)?.reliableWindow).toMatchObject({
      startHour: 10,
      daysSeen: 2,
      totalDays: 3,
      reliability: 2 / 3,
    });
  });
});
