import { describe, expect, it } from "vite-plus/test";
import { rankedWarsFromCache } from "@/hooks/use-torn";
import type { FactionAttack } from "@/lib/faction";

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

describe("rankedWarsFromCache", () => {
  it("rebuilds the war selector without faction API data", () => {
    const cachedAttack = attack(1, "2026-09-20T10:00:00Z", 10, {
      is_ranked_war: true,
      defender: {
        id: 20,
        name: "Opponent",
        level: 50,
        faction: { id: 2, name: "Other faction" },
      },
    });

    expect(
      rankedWarsFromCache([
        {
          range: { id: 123, from: 1_758_340_800, to: 1_758_427_201 },
          attacks: [cachedAttack],
        },
      ]),
    ).toEqual([
      {
        id: 123,
        start: 1_758_340_800,
        end: 1_758_427_200,
        target: 0,
        winner: null,
        factions: [
          { id: 1, name: "Test faction", score: 0, chain: 0 },
          { id: 2, name: "Other faction", score: 0, chain: 0 },
        ],
      },
    ]);
  });
});
