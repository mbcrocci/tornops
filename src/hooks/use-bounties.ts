import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type Bounty, createThrottle } from "@/lib/bounties";
import type { StatusClass } from "@/lib/faction";
import { getCachedFFScouterData, FFSCOUTER_STATS_TTL } from "@/lib/ffscouter-cache";
import { StatusScheduler } from "@/lib/status-scheduler";
import { useBountyStore, useCredentialsStore } from "@/lib/stores";
import { createTornGet } from "@/lib/torn-request";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Torn sorts bounties by reward, and the long tail of small rewards spans 50+ pages.
const MAX_BOUNTY_PAGES = 100;
// The full list costs one request per 100 bounties, so it refreshes far less often than
// the statuses on screen.
export const BOUNTY_LIST_REFRESH_INTERVAL = 5 * 60_000;
const FFSCOUTER_BATCH_SIZE = 200;

// Torn allows 100 requests a minute per key, shared with every other open page, so this
// page keeps some headroom for the war room.
const throttle = createThrottle(60, 60_000);
const tornGet = createTornGet({ throttle });

// Pages are sorted by reward, so paging stops at the first page that drops below the minimum.
const getBounties = async (
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

export const useBounties = () => {
  const key = useCredentialsStore((state) => state.publicKey ?? "");
  const minReward = useBountyStore((state) => state.minReward);

  return useQuery({
    queryKey: ["bounties", key, minReward],
    queryFn: ({ signal }) => getBounties(key, minReward, signal),
    enabled: Boolean(key),
    staleTime: BOUNTY_LIST_REFRESH_INTERVAL,
    refetchInterval: BOUNTY_LIST_REFRESH_INTERVAL,
  });
};

/** FFScouter stats for many players, batched to stay within the request size limit. */
export const useBountyFFScouterData = (targets: number[]) => {
  const ffScouterKey = useCredentialsStore((state) => state.ffscouterKey ?? "");
  const ids = [...new Set(targets)].sort((a, b) => a - b);

  return useQuery({
    queryKey: ["ffscouter-data-batched", ffScouterKey, ids],
    queryFn: async () => {
      const results = [];
      for (let i = 0; i < ids.length; i += FFSCOUTER_BATCH_SIZE) {
        results.push(
          ...(await getCachedFFScouterData(ffScouterKey, ids.slice(i, i + FFSCOUTER_BATCH_SIZE))),
        );
      }
      return results;
    },
    enabled: Boolean(ffScouterKey) && ids.length > 0,
    staleTime: FFSCOUTER_STATS_TTL,
    gcTime: FFSCOUTER_STATS_TTL,
    placeholderData: (previous) => previous,
    refetchInterval: false,
    retry: false,
  });
};

const schedulers = new Map<string, StatusScheduler>();

function getScheduler(key: string, refreshInterval: number) {
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

/**
 * Keeps the statuses of bounty targets fresh while the page is open: the players on the
 * current page first, then everyone else in `order`. Statuses survive leaving the page.
 */
export const useBountyStatuses = (pageIds: number[], order: number[]) => {
  const key = useCredentialsStore((state) => state.publicKey ?? "");
  const refreshInterval = useBountyStore((state) => state.refreshInterval);
  const scheduler = useMemo(() => getScheduler(key, refreshInterval), [key]);

  useEffect(() => {
    if (!key) return;
    scheduler.start();
    return () => scheduler.stop();
  }, [key, scheduler]);

  useEffect(() => {
    scheduler.setRefreshInterval(refreshInterval);
  }, [scheduler, refreshInterval]);

  useEffect(() => {
    scheduler.setTargets(pageIds, order);
  }, [scheduler, pageIds, order]);

  useSyncExternalStore(scheduler.subscribe, scheduler.getVersion);

  return scheduler;
};
