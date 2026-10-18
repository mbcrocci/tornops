import type { FFScouterData } from "@/hooks/use-ffscouter";
import type { StatusClass } from "./faction";

export type Bounty = {
  target_id: number;
  target_name: string;
  target_level: number;
  lister_id: number | null;
  lister_name: string | null;
  reward: number;
  reason: string | null;
  quantity: number;
  is_anonymous: boolean;
  valid_until: number;
};

// One row per player: a target can have several bounties listed by different players.
export type BountyTarget = {
  id: number;
  name: string;
  level: number;
  reward: number;
  totalReward: number;
  count: number;
  reasons: string[];
};

export type BountyRow = BountyTarget & {
  ffs?: FFScouterData;
  status?: StatusClass;
};

export type BountyFilters = {
  minReward: number | undefined;
  maxLevel: number | undefined;
  maxFF: number | undefined;
  onlyAvailable: boolean;
};

/** Groups bounties by target, sorted by the highest single reward. */
export function groupBounties(bounties: Bounty[]): BountyTarget[] {
  const targets = new Map<number, BountyTarget>();

  for (const bounty of bounties) {
    const target = targets.get(bounty.target_id) ?? {
      id: bounty.target_id,
      name: bounty.target_name,
      level: bounty.target_level,
      reward: 0,
      totalReward: 0,
      count: 0,
      reasons: [],
    };
    target.reward = Math.max(target.reward, bounty.reward);
    target.totalReward += bounty.reward * bounty.quantity;
    target.count += bounty.quantity;
    if (bounty.reason) target.reasons.push(bounty.reason);
    targets.set(bounty.target_id, target);
  }

  return [...targets.values()].sort((a, b) => b.reward - a.reward);
}

export function withinReward(target: BountyTarget, minReward: number | undefined): boolean {
  return minReward === undefined || target.reward >= minReward;
}

export function withinLevel(target: BountyTarget, maxLevel: number | undefined): boolean {
  return maxLevel === undefined || target.level <= maxLevel;
}

// Players without an FFScouter estimate are excluded once a max FF is set: their FF is unknown.
export function withinFF(ffs: FFScouterData | undefined, maxFF: number | undefined): boolean {
  return maxFF === undefined || (ffs !== undefined && ffs.fair_fight <= maxFF);
}

export function isAvailable(status: StatusClass | undefined): boolean {
  return status?.state === "Okay";
}

const TRAVELING_REFETCH_INTERVAL = 3 * 60_000;
const ABROAD_REFETCH_INTERVAL = 5 * 60_000;

/**
 * How long to wait before checking a player's status again. Hospital and jail stays are
 * checked when they end, and travel changes slowly, so only players who are around are
 * polled at the refresh interval.
 */
export function statusRefetchDelay(
  status: StatusClass | undefined,
  refreshInterval: number,
  now = Date.now(),
): number {
  // Check hospital and jail stays as soon as they end, however soon that is.
  const remaining = (status?.until ?? 0) * 1000 - now;
  if (remaining > 0) return remaining + 1000;
  if (status?.state === "Traveling") return Math.max(refreshInterval, TRAVELING_REFETCH_INTERVAL);
  if (status?.state === "Abroad") return Math.max(refreshInterval, ABROAD_REFETCH_INTERVAL);
  return refreshInterval;
}

/**
 * Returns a function that resolves once a request may be sent, allowing at most `limit`
 * requests per `windowMs`. Callers are served in order; a caller whose signal is aborted
 * while queued is rejected without using up a slot.
 */
export function createThrottle(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const sent: number[] = [];
  let queue = Promise.resolve();

  return (signal?: AbortSignal) => {
    const turn = queue.then(async () => {
      for (;;) {
        signal?.throwIfAborted();
        while (sent.length > 0 && now() - sent[0] >= windowMs) sent.shift();
        if (sent.length < limit) {
          sent.push(now());
          return;
        }
        await wait(windowMs - (now() - sent[0]));
      }
    });
    queue = turn.catch(() => undefined);
    return turn;
  };
}
