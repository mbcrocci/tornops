import { describe, expect, it, vi } from "vite-plus/test";
import { createTornGet } from "./torn-request";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("createTornGet", () => {
  it("takes one throttle slot per request sent", async () => {
    const throttle = vi.fn(async () => {});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 5, error: "Too many requests" } }))
      .mockImplementation(async () => json({ ok: true }));
    const tornGet = createTornGet({ throttle, fetch, rateLimitWait: 0 });

    await expect(tornGet("https://api.torn.com/x", "key", { slotAcquired: true })).resolves.toEqual(
      { ok: true },
    );
    // The first attempt used the caller's slot; only the retry took a new one.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(throttle).toHaveBeenCalledTimes(1);

    await tornGet("https://api.torn.com/x", "key");
    expect(throttle).toHaveBeenCalledTimes(2);
  });

  it("times out when the body stalls after the headers", async () => {
    const stalled = {
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    } as unknown as Response;
    const fetch = vi.fn().mockResolvedValue(stalled);
    const tornGet = createTornGet({ throttle: async () => {}, fetch, timeout: 10 });

    await expect(tornGet("https://api.torn.com/x", "key")).rejects.toThrow("Request timed out");
  });
});
