import { Query } from "@effect/ui";
import { Effect, Exit, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { recordObservation } from "@/lib/activity-tracking";
import { withTimeout } from "@/lib/utils";
import { GetEnemyFaction, GetOurFaction } from "./torn";

vi.mock("@/lib/activity-tracking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activity-tracking")>()),
  recordObservation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/travel-storage", () => ({
  readTravelObservations: vi.fn().mockResolvedValue([]),
  saveTravelObservations: vi.fn().mockResolvedValue(undefined),
}));

const faction = (
  id: number,
  members: object = {
    1: { name: "Target", last_action: { status: "Online" }, status: { state: "Okay" } },
  },
) => ({
  ID: id,
  name: `Faction ${id}`,
  ranked_wars: {},
  members,
});
const fetchMock = vi.fn();
const args = { key: "test-key", interval: 10_000 };

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Layer.mergeAll(GetOurFaction.layer, GetEnemyFaction.layer, Query.layer())),
    ) as Effect.Effect<A, E, never>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => faction(url.includes("/faction/42") ? 42 : 7),
  }));
  vi.mocked(recordObservation).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("automatic faction presence history", () => {
  it("records both faction requests", async () => {
    const exit = await run(
      Effect.all([GetOurFaction.get(args), GetEnemyFaction.get({ ...args, factionId: 42 })]),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(recordObservation).toHaveBeenCalledWith(faction(7), expect.any(Number));
    expect(recordObservation).toHaveBeenCalledWith(faction(42), expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails on an API error and records nothing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { error: "Too many requests" } }),
    });
    const exit = await run(GetOurFaction.get(args));
    expect(exit).toEqual(Exit.fail("Too many requests"));
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("does not store incomplete member statuses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => faction(42, { 1: { name: "Target", status: { state: "Okay" } } }),
    });
    const exit = await run(GetEnemyFaction.get({ ...args, factionId: 42 }));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("does not record an enemy response for a different faction", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => faction(99) });
    await run(GetEnemyFaction.get({ ...args, factionId: 42 }));
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("keeps live faction data usable when history storage fails", async () => {
    vi.mocked(recordObservation).mockRejectedValueOnce(new Error("Storage full"));
    const exit = await run(GetOurFaction.get(args));
    expect(Exit.isSuccess(exit) && exit.value.faction).toEqual(faction(7));
    expect(Exit.isSuccess(exit) && exit.value.presenceError).toBe("Storage full");
  });
});

describe("faction polling", () => {
  it("fails a request that never settles, so the next poll starts a new one", async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise(() => {}));
      const failed = expect(pending).rejects.toThrow("Request timed out");
      await vi.advanceTimersByTimeAsync(20_000);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });
});
