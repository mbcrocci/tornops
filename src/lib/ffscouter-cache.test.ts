// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const stats = (player_id: number) => ({
  player_id,
  fair_fight: 2.5,
  bs_estimate: 100_000,
  bs_estimate_human: "100k",
  bss_public: 0,
  last_updated: 1,
});
const response = (ids: number[]) => new Response(JSON.stringify(ids.map(stats)));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function client() {
  return import("./ffscouter-cache");
}

describe("FFScouter stats cache", () => {
  it("reuses estimates across overlapping and reordered rosters", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([1, 2]))
      .mockResolvedValueOnce(response([3]));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await getCachedFFScouterData("key", [2, 1, 1]);
    expect(await getCachedFFScouterData("key", [3, 2])).toEqual([stats(2), stats(3)]);
    await getCachedFFScouterData("key", [2, 1]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("targets")).toBe("3");
  });

  it("deduplicates overlapping batches in flight", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([1, 2]))
      .mockResolvedValueOnce(response([3]));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await Promise.all([
      getCachedFFScouterData("key", [1, 2]),
      getCachedFFScouterData("key", [2, 3]),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("targets")).toBe("3");
  });

  it("keeps the cache across reloads without storing the API key", async () => {
    const fetch = vi.fn().mockResolvedValue(response([1]));
    vi.stubGlobal("fetch", fetch);
    await (await client()).getCachedFFScouterData("secret-key", [1]);
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).not.toContain("secret-key");
    vi.resetModules();
    expect(await (await client()).getCachedFFScouterData("secret-key", [1])).toEqual([stats(1)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires estimates after 24 hours", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response([1])));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData, FFSCOUTER_STATS_TTL } = await client();
    await getCachedFFScouterData("key", [1]);
    clock.mockReturnValue(now + FFSCOUTER_STATS_TTL - 1);
    await getCachedFFScouterData("key", [1]);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + FFSCOUTER_STATS_TTL);
    await getCachedFFScouterData("key", [1]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("separates estimates by API key", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response([1])));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await getCachedFFScouterData("key-a", [1]);
    await getCachedFFScouterData("key-b", [1]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("remembers players without an estimate", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await getCachedFFScouterData("key", [1]);
    expect(await getCachedFFScouterData("key", [1])).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("backs off after a 429 and honors Retry-After", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "120" } }))
      .mockResolvedValueOnce(response([1]));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await expect(getCachedFFScouterData("key", [1])).rejects.toThrow("429");
    clock.mockReturnValue(now + 60_000);
    await expect(getCachedFFScouterData("key", [2])).rejects.toThrow("rate limit");
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 120_000);
    await getCachedFFScouterData("key", [1]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(response([1]));
    vi.stubGlobal("fetch", fetch);
    const { getCachedFFScouterData } = await client();
    await expect(getCachedFFScouterData("key", [1])).rejects.toThrow("500");
    expect(await getCachedFFScouterData("key", [1])).toEqual([stats(1)]);
  });
});
