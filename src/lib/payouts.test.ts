import { describe, expect, it } from "vite-plus/test";
import type { FactionAttack } from "@/lib/faction";
import { parseMoney, summarizePayouts, type PayoutSettings } from "./payouts";

function attack(
  id: number,
  attackerId: number,
  overrides: Partial<FactionAttack> = {},
): FactionAttack {
  return {
    id,
    code: `attack-${id}`,
    started: 1_000 + id,
    ended: 1_005 + id,
    attacker: {
      id: attackerId,
      name: `Member ${attackerId}`,
      level: 50,
      faction: { id: 1, name: "Test faction" },
    },
    defender: { id: 9000 + id, name: `Defender ${id}`, level: 10, faction: null },
    result: "Hospitalized",
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

const settings = (overrides: Partial<PayoutSettings> = {}): PayoutSettings => ({
  payout: 1_000,
  payType: "respect",
  includeBonus: true,
  bonusRespect: 10,
  ...overrides,
});

describe("parseMoney", () => {
  it("reads plain, formatted and suffixed amounts", () => {
    expect(parseMoney("750000000")).toBe(750_000_000);
    expect(parseMoney("$750,000,000")).toBe(750_000_000);
    expect(parseMoney("750m")).toBe(750_000_000);
    expect(parseMoney("1.5B")).toBe(1_500_000_000);
    expect(parseMoney("lots")).toBeNull();
  });
});

describe("summarizePayouts", () => {
  const attacks = [
    attack(1, 1, { respect_gain: 3 }),
    attack(2, 1, { respect_gain: 3 }),
    attack(3, 2, { respect_gain: 4 }),
    // The 10th chain hit pays the chain bonus.
    attack(4, 2, { respect_gain: 10, chain: 10 }),
    // Failed attacks and assists earn nothing.
    attack(5, 3, { result: "Lost", respect_gain: 0 }),
    attack(6, 3, { result: "Assist", respect_gain: 0 }),
  ];

  it("splits the pool by respect, bonus hits included", () => {
    const summary = summarizePayouts(attacks, settings());
    expect(summary.countedRespect).toBe(20);
    expect(summary.members.map((m) => [m.id, m.hits, m.countedRespect, m.payout])).toEqual([
      [2, 2, 14, 700],
      [1, 2, 6, 300],
    ]);
  });

  it("counts each bonus hit as the set respect when bonuses are left out", () => {
    const summary = summarizePayouts(attacks, settings({ includeBonus: false, bonusRespect: 2 }));
    expect(summary.respect).toBe(20);
    expect(summary.countedRespect).toBe(12);
    expect(summary.members.map((m) => [m.id, m.bonusHits, m.countedRespect, m.payout])).toEqual([
      [1, 0, 6, 500],
      [2, 1, 6, 500],
    ]);
  });

  it("can count each bonus hit as the member's average over their other hits", () => {
    const summary = summarizePayouts(
      [
        ...attacks,
        // Only a bonus hit, so this member gets the faction average of the other hits: 10 / 3.
        attack(8, 4, { respect_gain: 20, chain: 25 }),
      ],
      settings({ includeBonus: false, bonusRespect: "average", payout: 0 }),
    );
    const counted = new Map(summary.members.map((m) => [m.id, m.countedRespect]));
    expect(counted.get(1)).toBe(6);
    expect(counted.get(2)).toBe(8);
    expect(counted.get(4)).toBeCloseTo(10 / 3);
  });

  it("splits the pool by hits", () => {
    const summary = summarizePayouts(
      [...attacks, attack(7, 1, { respect_gain: 1 })],
      settings({ payType: "hit", payout: 1_000 }),
    );
    expect(summary.rate).toBeCloseTo(200);
    expect(summary.members.map((m) => [m.id, m.hits, m.payout])).toEqual([
      [1, 3, 600],
      [2, 2, 400],
    ]);
  });

  it("rounds each payout down and reports what is left", () => {
    const summary = summarizePayouts(
      [attack(1, 1), attack(2, 2), attack(3, 3)],
      settings({ payout: 100 }),
    );
    expect(summary.members.map((m) => m.payout)).toEqual([33, 33, 33]);
    expect(summary.remainder).toBe(1);
  });
});
