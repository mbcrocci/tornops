import { describe, expect, it, vi } from "vite-plus/test";
import type { StatusClass } from "./faction";
import { StatusScheduler } from "./status-scheduler";

const status = (state: StatusClass["state"], until = 0): StatusClass => ({
  state,
  description: state,
  details: "",
  color: "green",
  until,
});

function scheduler(statuses: Record<number, StatusClass>, time = { now: 1_000_000_000 }) {
  return new StatusScheduler({
    fetchStatus: async (id) => statuses[id] ?? status("Okay"),
    acquire: async () => {},
    refreshInterval: 60_000,
    now: () => time.now,
  });
}

describe("StatusScheduler", () => {
  it("checks the page on screen before crawling the rest", async () => {
    const s = scheduler({});
    s.setTargets([3, 4], [1, 2, 3, 4, 5]);

    expect(s.next()).toBe(3);
    await s.check(3);
    expect(s.next()).toBe(4);
    await s.check(4);
    expect(s.next()).toBe(1);
  });

  it("moves a newly shown page to the front", async () => {
    const s = scheduler({});
    s.setTargets([1, 2], [1, 2, 3, 4, 5]);
    await s.check(1);
    await s.check(2);

    s.setTargets([5], [1, 2, 3, 4, 5]);
    expect(s.next()).toBe(5);
  });

  it("does not check a player again until their status is due", async () => {
    const time = { now: 1_000_000_000 };
    const s = scheduler({ 1: status("Hospital", time.now / 1000 + 600) }, time);
    s.setTargets([1, 2], [1, 2]);
    await s.check(1);
    await s.check(2);
    expect(s.next()).toBeUndefined();

    time.now += 61_000;
    expect(s.next()).toBe(2);
    await s.check(2);
    time.now += 530_000;
    expect(s.next()).toBe(2);
    await s.check(2);
    time.now += 10_000;
    expect(s.next()).toBe(1);
  });

  it("forgets hospital stays that have ended", async () => {
    const time = { now: 1_000_000_000 };
    const s = scheduler({ 1: status("Hospital", time.now / 1000 + 600) }, time);
    await s.check(1);
    expect(s.getStatus(1)?.state).toBe("Hospital");

    time.now += 600_000;
    expect(s.getStatus(1)).toBeUndefined();
  });
});

describe("StatusScheduler fairness", () => {
  it("keeps crawling everyone while the page on screen is rechecked", async () => {
    // 100 players around, 20 on screen, one request a second for five minutes.
    const time = { now: 1_000_000_000 };
    const s = scheduler({}, time);
    const order = Array.from({ length: 100 }, (_, i) => i + 1);
    s.setTargets(order.slice(0, 20), order);

    const checked = new Set<number>();
    for (let second = 0; second < 300; second++) {
      time.now += 1000;
      const id = s.next();
      if (id === undefined) continue;
      checked.add(id);
      await s.check(id);
    }

    expect(checked.size).toBe(100);
    expect(order.every((id) => s.getStatus(id))).toBe(true);
  });

  it("reschedules known players when the refresh interval changes", async () => {
    const time = { now: 1_000_000_000 };
    const s = scheduler({}, time);
    s.setTargets([1], [1]);
    await s.check(1);

    time.now += 10_000;
    expect(s.next()).toBeUndefined();
    s.setRefreshInterval(10_000);
    expect(s.next()).toBe(1);
  });
});

describe("StatusScheduler workers", () => {
  it("takes one slot per check and checks everyone", async () => {
    const acquire = vi.fn(async () => {});
    const fetchStatus = vi.fn(async (_id: number) => status("Okay"));
    const s = new StatusScheduler({ fetchStatus, acquire, refreshInterval: 60_000 });
    s.setTargets([5], [1, 2, 3, 4, 5]);

    s.start();
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(5));
    s.stop();

    expect(fetchStatus.mock.calls[0]).toEqual([5]);
    // At most one unused slot is held by the second, now idle, worker.
    expect(acquire.mock.calls.length).toBeLessThanOrEqual(6);
    expect(new Set(fetchStatus.mock.calls.map(([id]) => id)).size).toBe(5);
  });

  it("rechecks a hospital stay as soon as it ends", async () => {
    let calls = 0;
    const fetchStatus = vi.fn(async () =>
      calls++ === 0 ? status("Hospital", Date.now() / 1000 + 0.2) : status("Okay"),
    );
    const s = new StatusScheduler({
      fetchStatus,
      acquire: async () => {},
      refreshInterval: 60_000,
    });
    s.setTargets([1], [1]);

    s.start();
    await vi.waitFor(() => expect(s.getStatus(1)?.state).toBe("Okay"), { timeout: 3_000 });
    s.stop();
  });
});
