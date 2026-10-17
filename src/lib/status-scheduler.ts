import { statusRefetchDelay } from "./bounties";
import type { StatusClass } from "./faction";

type Entry = { status?: StatusClass; checkedAt: number; nextCheckAt: number; failed: boolean };

type Options = {
  fetchStatus: (playerId: number) => Promise<StatusClass>;
  /** Resolves once the next request may be sent, e.g. a rate-limit throttle. */
  acquire: () => Promise<void>;
  refreshInterval: number;
  concurrency?: number;
  now?: () => number;
};

const IDLE_POLL = 5_000;

/**
 * Keeps player statuses fresh within the rate limit. Priority players (the page on screen)
 * are always checked first. In the background, players never checked come first (in
 * `order`), then whoever is most overdue, so every player is eventually rechecked instead
 * of the top of the list hogging the budget. Each status is due again when
 * `statusRefetchDelay` says so.
 */
export class StatusScheduler {
  private entries = new Map<number, Entry>();
  private inFlight = new Set<number>();
  private priority: number[] = [];
  private order: number[] = [];
  private listeners = new Set<() => void>();
  private sleepers = new Set<() => void>();
  // Bumped on every start/stop, so workers from an earlier start exit.
  private generation = 0;
  private running = false;
  private version = 0;
  private readonly concurrency: number;
  private readonly now: () => number;

  constructor(private options: Options) {
    this.concurrency = options.concurrency ?? 2;
    this.now = options.now ?? Date.now;
  }

  setTargets(priority: number[], order: number[]) {
    this.priority = priority;
    this.order = order;
    this.wakeAll();
  }

  setRefreshInterval(refreshInterval: number) {
    if (refreshInterval === this.options.refreshInterval) return;
    this.options.refreshInterval = refreshInterval;
    // Reschedule from each player's last check, so a shorter interval applies right away.
    for (const entry of this.entries.values()) {
      if (entry.nextCheckAt === 0) continue;
      entry.nextCheckAt =
        entry.checkedAt +
        (entry.failed
          ? refreshInterval
          : statusRefetchDelay(entry.status, refreshInterval, entry.checkedAt));
    }
    this.wakeAll();
  }

  /** Marks every known status as due, so they are all checked again. */
  refreshAll() {
    for (const entry of this.entries.values()) entry.nextCheckAt = 0;
    this.wakeAll();
  }

  getStatus(playerId: number): StatusClass | undefined {
    const status = this.entries.get(playerId)?.status;
    // A hospital or jail stay that has ended no longer says anything.
    if (status && status.until > 0 && status.until * 1000 <= this.now()) return undefined;
    return status;
  }

  hasFailed(playerId: number) {
    return this.entries.get(playerId)?.failed ?? false;
  }

  isChecking(playerId: number) {
    return this.inFlight.has(playerId);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  /** The next player to check: due priority players first, then the background. */
  next(): number | undefined {
    const now = this.now();
    return this.mostOverdue(this.priority, now) ?? this.mostOverdue(this.order, now);
  }

  // Never-checked players first (in list order), then the earliest due.
  private mostOverdue(ids: number[], now: number): number | undefined {
    let best: number | undefined;
    let bestDue = Infinity;
    for (const id of ids) {
      if (this.inFlight.has(id)) continue;
      const due = this.entries.get(id)?.nextCheckAt ?? -Infinity;
      if (due <= now && due < bestDue) {
        best = id;
        bestDue = due;
      }
    }
    return best;
  }

  /** Milliseconds until the next player is due, capped at `max`. */
  private untilNextDue(max: number) {
    const now = this.now();
    let wait = max;
    for (const ids of [this.priority, this.order]) {
      for (const id of ids) {
        if (this.inFlight.has(id)) continue;
        const due = this.entries.get(id)?.nextCheckAt ?? 0;
        wait = Math.min(wait, Math.max(0, due - now));
      }
    }
    return wait;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    for (let i = 0; i < this.concurrency; i++) void this.work(generation);
  }

  stop() {
    this.running = false;
    this.generation++;
    this.wakeAll();
  }

  private async work(generation: number) {
    // A slot taken when another worker grabbed the last due player is kept for the next one.
    let holdingSlot = false;
    while (generation === this.generation) {
      if (isPageHidden()) {
        await this.sleep(IDLE_POLL);
        continue;
      }
      if (this.next() === undefined) {
        await this.sleep(Math.max(100, this.untilNextDue(IDLE_POLL)));
        continue;
      }
      if (!holdingSlot) await this.options.acquire();
      holdingSlot = true;
      // Pick again: the page may have changed while waiting for the rate limit.
      const playerId = this.next();
      if (generation !== this.generation || playerId === undefined) continue;
      holdingSlot = false;
      await this.check(playerId);
    }
  }

  async check(playerId: number) {
    this.inFlight.add(playerId);
    this.emit();
    const entry = this.entries.get(playerId);
    try {
      const status = await this.options.fetchStatus(playerId);
      const checkedAt = this.now();
      this.entries.set(playerId, {
        status,
        failed: false,
        checkedAt,
        nextCheckAt:
          checkedAt + statusRefetchDelay(status, this.options.refreshInterval, checkedAt),
      });
    } catch {
      const checkedAt = this.now();
      this.entries.set(playerId, {
        status: entry?.status,
        failed: true,
        checkedAt,
        nextCheckAt: checkedAt + this.options.refreshInterval,
      });
    } finally {
      this.inFlight.delete(playerId);
      this.emit();
    }
  }

  private wakeAll() {
    for (const wake of this.sleepers) wake();
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.sleepers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.sleepers.add(done);
    });
  }

  private emit() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

const isPageHidden = () => typeof document !== "undefined" && document.hidden;
