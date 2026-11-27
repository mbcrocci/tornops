import { describe, expect, it } from "vite-plus/test";
import type { FactionMember } from "@/components/war-room/roster";
import type { ObservedChainActivity } from "@/domain/Settings";
import { isStoredAttackActivityValid, prioritizeTargets } from "./chain";

function member(id: number, fairFight?: number): FactionMember {
  return {
    id,
    name: `Target ${id}`,
    level: 1,
    status: { state: "Okay" },
    last_action: { status: "Online" },
    ffs:
      fairFight === undefined
        ? undefined
        : {
            player_id: id,
            fair_fight: fairFight,
            bs_estimate: 0,
            bs_estimate_human: "0",
            bss_public: 0,
            last_updated: 0,
          },
  } as FactionMember;
}

describe("prioritizeTargets", () => {
  const members = [member(1, 2), member(2, 3.5), member(3), member(4, 3), member(5, 4)];

  it("prioritizes the highest viable fair fight while the chain is safe", () => {
    expect(prioritizeTargets(members, 45, 0).map(({ id }) => id)).toEqual([2, 4, 1, 3]);
  });

  it("prioritizes the lowest viable fair fight when fewer than 45 seconds remain", () => {
    expect(prioritizeTargets(members, 44, 0).map(({ id }) => id)).toEqual([1, 4, 2, 3]);
  });

  it("includes targets at the fair fight limit", () => {
    expect(prioritizeTargets([member(1, 3.5), member(2, 3.51)], 45, 0).map(({ id }) => id)).toEqual(
      [1],
    );
  });

  it("does not suggest targets after the chain expires", () => {
    expect(prioritizeTargets(members, 0, 0)).toEqual([]);
  });
});

describe("isStoredAttackActivityValid", () => {
  const activity = [{ chainNumber: 12 }] as ObservedChainActivity[];

  it("keeps activity from the current chain", () => {
    expect(isStoredAttackActivityValid(activity, 12)).toBe(true);
    expect(isStoredAttackActivityValid(activity, 13)).toBe(true);
  });

  it("rejects activity ahead of the current chain", () => {
    expect(isStoredAttackActivityValid(activity, 11)).toBe(false);
  });

  it("accepts an empty feed", () => {
    expect(isStoredAttackActivityValid([], 0)).toBe(true);
  });
});
