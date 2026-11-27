import { type Bounty, createThrottle } from "@/lib/bounties";
import type { StatusClass } from "@/lib/faction";
import { StatusScheduler } from "@/lib/status-scheduler";
import { createTornGet } from "@/lib/torn-request";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Torn sorts bounties by reward, and the long tail of small rewards spans 50+ pages.
const MAX_BOUNTY_PAGES = 100;
// The full list costs one request per 100 bounties, so it refreshes far less often than
// the statuses on screen.
export const BOUNTY_LIST_REFRESH_INTERVAL = 5 * 60_000;

// Torn allows 100 requests a minute per key, shared with every other open page, so this
// page keeps some headroom for the war room.
const throttle = createThrottle(60, 60_000);
const tornGet = createTornGet({ throttle });

// Pages are sorted by reward, so paging stops at the first page that drops below the minimum.
export const getBounties = async (
  key: string,
  minReward: number | undefined,
  signal: AbortSignal,
): Promise<Bounty[]> => {
  const bounties: Bounty[] = [];
  let nextUrl: string | null = "https://api.torn.com/v2/torn/bounties?limit=100";

  for (let page = 0; nextUrl && page < MAX_BOUNTY_PAGES; page++) {
    const data = await tornGet(nextUrl, key, { signal });
    if (!Array.isArray(data.bounties)) {
      throw new Error("Torn API returned incomplete bounty data");
    }
    const pageBounties = data.bounties as Bounty[];
    bounties.push(...pageBounties);
    const lowest = pageBounties.at(-1)?.reward;
    if (minReward !== undefined && lowest !== undefined && lowest < minReward) break;

    const metadata = isRecord(data._metadata) ? data._metadata : null;
    const links = metadata && isRecord(metadata.links) ? metadata.links : null;
    nextUrl =
      data.bounties.length > 0 && links && typeof links.next === "string" ? links.next : null;
  }

  return bounties;
};

// The scheduler takes the throttle slot before choosing who to check.
const getPlayerStatus = async (key: string, playerId: number): Promise<StatusClass> => {
  const data = await tornGet(`https://api.torn.com/v2/user/${playerId}/basic`, key, {
    slotAcquired: true,
  });
  const status = isRecord(data.profile) ? data.profile.status : null;
  if (!isRecord(status) || typeof status.state !== "string") {
    throw new Error("Torn API returned incomplete profile data");
  }
  return {
    ...(status as StatusClass),
    details: typeof status.details === "string" ? status.details : "",
    until: typeof status.until === "number" ? status.until : 0,
  };
};

const schedulers = new Map<string, StatusScheduler>();

/** One scheduler per key, kept for the visit so statuses survive leaving the page. */
export function getScheduler(key: string, refreshInterval: number) {
  let scheduler = schedulers.get(key);
  if (!scheduler) {
    scheduler = new StatusScheduler({
      fetchStatus: (playerId) => getPlayerStatus(key, playerId),
      acquire: () => throttle(),
      refreshInterval,
    });
    schedulers.set(key, scheduler);
  }
  return scheduler;
}
