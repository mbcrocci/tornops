import { describe, expect, it } from "vite-plus/test";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import {
  type Bounty,
  createThrottle,
  groupBounties,
  isAvailable,
  statusRefetchDelay,
  withinFF,
  withinLevel,
} from "./bounties";

const bounty = (overrides: Partial<Bounty>): Bounty => ({
  target_id: 1,
  target_name: "Target",
  target_level: 10,
  lister_id: 99,
  lister_name: "Lister",
  reward: 100_000,
  reason: null,
  quantity: 1,
  is_anonymous: false,
  valid_until: 0,
  ...overrides,
});

const ffs = (fair_fight: number): FFScouterData => ({
  player_id: 1,
  fair_fight,
  bs_estimate: 0,
  bs_estimate_human: "0",
  bss_public: 0,
  last_updated: 0,
});

describe("groupBounties", () => {
  it("merges bounties on the same target and sorts by highest reward", () => {
    const targets = groupBounties([
      bounty({ target_id: 1, reward: 100_000, quantity: 2, reason: "mugged me" }),
      bounty({ target_id: 2, reward: 500_000 }),
      bounty({ target_id: 1, reward: 300_000 }),
    ]);

    expect(targets.map((target) => target.id)).toEqual([2, 1]);
    expect(targets[1]).toMatchObject({
      reward: 300_000,
      totalReward: 500_000,
      count: 3,
      reasons: ["mugged me"],
    });
  });
});

describe("filters", () => {
  it("limits by level only when a max is set", () => {
    const [target] = groupBounties([bounty({ target_level: 20 })]);
    expect(withinLevel(target, undefined)).toBe(true);
    expect(withinLevel(target, 20)).toBe(true);
    expect(withinLevel(target, 19)).toBe(false);
  });

  it("excludes unknown FF once a max FF is set", () => {
    expect(withinFF(undefined, undefined)).toBe(true);
    expect(withinFF(undefined, 3)).toBe(false);
    expect(withinFF(ffs(2.5), 3)).toBe(true);
    expect(withinFF(ffs(3.5), 3)).toBe(false);
  });

  it("treats only Okay players as available", () => {
    expect(isAvailable(undefined)).toBe(false);
    expect(
      isAvailable({ state: "Okay", description: "Okay", details: "", color: "green", until: 0 }),
    ).toBe(true);
    expect(
      isAvailable({
        state: "Hospital",
        description: "In hospital",
        details: "",
        color: "red",
        until: 1,
      }),
    ).toBe(false);
  });
});

describe("createThrottle", () => {
  it("waits for the window to free a slot once the limit is reached", async () => {
    let time = 0;
    const waits: number[] = [];
    const throttle = createThrottle(
      2,
      60_000,
      () => time,
      async (ms) => {
        waits.push(ms);
        time += ms;
      },
    );

    await throttle();
    time = 10_000;
    await throttle();
    await throttle();

    expect(waits).toEqual([50_000]);
    expect(time).toBe(60_000);
  });
});

describe("createThrottle cancellation", () => {
  it("skips callers aborted while queued without using a slot", async () => {
    let time = 0;
    const throttle = createThrottle(
      1,
      60_000,
      () => time,
      async (ms) => {
        time += ms;
      },
    );
    const controller = new AbortController();

    await throttle();
    const cancelled = throttle(controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toThrow();
    await throttle();

    expect(time).toBe(60_000);
  });
});

describe("statusRefetchDelay", () => {
  const status = (state: "Okay" | "Hospital" | "Traveling" | "Abroad", until = 0) => ({
    state,
    description: state,
    details: "",
    color: "green" as const,
    until,
  });

  it("waits for hospital stays to end and polls travellers slowly", () => {
    const now = 1_000_000_000;
    expect(statusRefetchDelay(status("Okay"), 60_000, now)).toBe(60_000);
    expect(statusRefetchDelay(status("Hospital", now / 1000 + 600), 60_000, now)).toBe(601_000);
    expect(statusRefetchDelay(status("Hospital", now / 1000 + 10), 60_000, now)).toBe(11_000);
    expect(statusRefetchDelay(status("Traveling"), 60_000, now)).toBe(180_000);
    expect(statusRefetchDelay(status("Abroad"), 60_000, now)).toBe(300_000);
  });
});
