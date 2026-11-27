import {
  attackCacheScope,
  readCachedWar,
  readCachedWars,
  type CachedWarData,
  type WarAttackRange,
  writeCachedWar,
} from "@/lib/attack-history-cache";
import type {
  Faction,
  FactionAttack,
  FactionAttackHistory,
  FactionChain,
  FactionChainReport,
  FactionRankedWar,
} from "@/lib/faction";
import { observeFactionResponse } from "@/lib/faction-presence";
import {
  type ArmoryNews,
  countArmoryXanax,
  PRE_WAR_XANAX_SECONDS,
  type XanaxUse,
} from "@/lib/armory";
import type { User } from "@/lib/user";

// Requests to the Torn API. Each one checks the response's shape before handing it on.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getUserData = async (key: string): Promise<User> => {
  if (!key) {
    throw new Error("No key provided");
  }

  const url = "https://api.torn.com/user/";
  const params = new URLSearchParams();
  params.set("selections", "profile,cooldowns,bars");
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Torn API request failed (${response.status})`);
  }

  const data: unknown = await response.json();
  if (
    !isRecord(data) ||
    !isRecord(data.life) ||
    typeof data.life.current !== "number" ||
    typeof data.life.maximum !== "number" ||
    !isRecord(data.status) ||
    typeof data.status.state !== "string" ||
    !isRecord(data.cooldowns) ||
    typeof data.cooldowns.medical !== "number" ||
    (data.energy !== undefined &&
      (!isRecord(data.energy) ||
        typeof data.energy.current !== "number" ||
        typeof data.energy.maximum !== "number"))
  ) {
    const apiError = isRecord(data) && isRecord(data.error) ? data.error.error : null;
    const message =
      typeof apiError === "string" ? apiError : "Torn API returned incomplete user data";
    throw new Error(message);
  }

  return data as User;
};
export const getUserFaction = async (key: string) => {
  const url = "https://api.torn.com/faction/";
  const params = new URLSearchParams();
  params.set("selections", "basic,rankedwars");
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  const data = (await response.json()) as Faction;
  if (response.ok) await observeFactionResponse(data);
  return data;
};

export const getUserFactionChain = async (key: string) => {
  const url = "https://api.torn.com/v2/faction/chain";
  const params = new URLSearchParams();
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  return response.json() as Promise<{ chain: FactionChain }>;
};

export class TornApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

const keysWithoutFactionAttackAccess = new Set<string>();

const waitFor = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const getChainAttacks = async (
  key: string,
  chainStart: number,
): Promise<{ attacks: FactionAttack[]; scope: "faction" | "monitor" }> => {
  const fetchAttacks = async (scope: "faction" | "user") => {
    const url = `https://api.torn.com/v2/${scope}/attacks`;
    const params = new URLSearchParams();
    params.set("filters", "outgoing");
    params.set("from", chainStart.toString());
    params.set("limit", "100");
    params.set("sort", "DESC");
    params.set("key", key);

    const response = await fetch(`${url}?${params.toString()}`);
    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(`Torn API request failed (${response.status})`);
    }
    if (isRecord(data) && isRecord(data.error)) {
      const message = data.error.error;
      throw new TornApiError(
        typeof message === "string" ? message : "Torn API returned an error",
        typeof data.error.code === "number" ? data.error.code : undefined,
      );
    }
    if (!isRecord(data) || !Array.isArray(data.attacks)) {
      throw new Error("Torn API returned incomplete attack data");
    }

    return (data.attacks as FactionAttack[])
      .filter(
        (attack) => typeof attack.chain === "number" && attack.chain > 0 && !attack.is_interrupted,
      )
      .slice(0, 10);
  };

  if (!keysWithoutFactionAttackAccess.has(key)) {
    try {
      return { attacks: await fetchAttacks("faction"), scope: "faction" };
    } catch (error) {
      if (!(error instanceof TornApiError) || (error.code !== 7 && error.code !== 16)) {
        throw error;
      }
      keysWithoutFactionAttackAccess.add(key);
    }
  }

  return { attacks: [], scope: "monitor" };
};

// A range ending at 0 is a war still in progress. Its attacks stay in memory instead of the
// browser cache, and each refresh only asks Torn for attacks since the last one seen.
const LIVE_WAR_OVERLAP_SECONDS = 5 * 60;
const liveWarAttacks = new Map<string, FactionAttack[]>();

export const getFactionAttackHistory = async (
  key: string,
  ranges: WarAttackRange[],
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<FactionAttackHistory> => {
  const attacks = {
    outgoing: new Map<number, FactionAttack>(),
    incoming: new Map<number, FactionAttack>(),
  };
  const cacheScope = await attackCacheScope(key);
  let hasRequested = false;

  for (const range of ranges) {
    for (const direction of ["outgoing", "incoming"] as const) {
      if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      const isLive = range.to === 0;
      const liveKey = `${cacheScope ?? key}:${direction}:${range.id}:${range.from}`;
      const cached =
        forceRefresh || isLive ? null : await readCachedWar(cacheScope, range, direction);
      if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (cached !== null) {
        for (const attack of cached) attacks[direction].set(attack.id, attack);
        continue;
      }

      let nextUrl: string | null = null;
      let rateLimitRetries = 0;
      const completedUrls = new Set<string>();
      const warAttacks = new Map<number, FactionAttack>();
      let from = range.from;
      if (isLive && !forceRefresh) {
        for (const attack of liveWarAttacks.get(liveKey) ?? []) {
          warAttacks.set(attack.id, attack);
          // Overlap the last fetch so attacks that were still running then are picked up.
          from = Math.max(from, attack.ended - LIVE_WAR_OVERLAP_SECONDS);
        }
      }

      do {
        if (hasRequested) await waitFor(1_000, signal);
        hasRequested = true;

        const url = new URL(nextUrl ?? "https://api.torn.com/v2/faction/attacks");
        if (!nextUrl) {
          url.searchParams.set("filters", direction);
          url.searchParams.set("from", from.toString());
          url.searchParams.set("limit", "100");
          url.searchParams.set("sort", "ASC");
        }
        // Torn's pagination links omit the original upper bound.
        if (!isLive) url.searchParams.set("to", range.to.toString());
        const requestUrl = url.toString();
        if (completedUrls.has(requestUrl)) {
          break;
        }

        const response = await fetch(url, {
          headers: { Authorization: `ApiKey ${key}` },
          signal: signal ?? null,
        });
        const data: unknown = await response.json();
        const apiError = isRecord(data) && isRecord(data.error) ? data.error : null;
        const message = apiError?.error;
        const code = typeof apiError?.code === "number" ? apiError.code : undefined;

        if ((response.status === 429 || code === 5) && rateLimitRetries < 3) {
          rateLimitRetries += 1;
          await waitFor(65_000, signal);
          continue;
        }
        if (!response.ok) {
          throw new Error(`Torn API request failed (${response.status})`);
        }
        if (apiError) {
          throw new TornApiError(
            typeof message === "string" ? message : "Torn API returned an error",
            code,
          );
        }
        if (!isRecord(data) || !Array.isArray(data.attacks)) {
          throw new Error("Torn API returned incomplete attack data");
        }

        rateLimitRetries = 0;
        completedUrls.add(requestUrl);
        for (const attack of data.attacks as FactionAttack[]) {
          if (attack.is_ranked_war) warAttacks.set(attack.id, attack);
        }

        const metadata = isRecord(data._metadata) ? data._metadata : null;
        const links = metadata && isRecord(metadata.links) ? metadata.links : null;
        nextUrl = links && typeof links.next === "string" ? links.next : null;
      } while (nextUrl);
      if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      const completedAttacks = [...warAttacks.values()];
      for (const attack of completedAttacks) attacks[direction].set(attack.id, attack);
      if (isLive) liveWarAttacks.set(liveKey, completedAttacks);
      else await writeCachedWar(cacheScope, range, completedAttacks, direction);
    }
  }

  const byTime = (a: FactionAttack, b: FactionAttack) => a.ended - b.ended;
  return {
    attacks: [...attacks.outgoing.values()].sort(byTime),
    incoming: [...attacks.incoming.values()].sort(byTime),
  };
};

// Counts Xanax taken from the faction armory during the given wars, and in the hours before
// each one started, per member.
export const getFactionArmoryXanax = async (
  key: string,
  ranges: WarAttackRange[],
  signal?: AbortSignal,
): Promise<Map<number, XanaxUse>> => {
  const news = new Map<string, ArmoryNews & { beforeWar: boolean }>();
  let hasRequested = false;

  for (const range of ranges) {
    let nextUrl: string | null = null;
    let rateLimitRetries = 0;
    const completedUrls = new Set<string>();
    const to = range.to === 0 ? Math.floor(Date.now() / 1000) : range.to;

    do {
      if (hasRequested) await waitFor(1_000, signal);
      hasRequested = true;

      const url = new URL(nextUrl ?? "https://api.torn.com/v2/faction/news");
      if (!nextUrl) {
        url.searchParams.set("cat", "armoryAction");
        url.searchParams.set("striptags", "false");
        url.searchParams.set("from", (range.from - PRE_WAR_XANAX_SECONDS).toString());
        url.searchParams.set("limit", "100");
        url.searchParams.set("sort", "ASC");
      }
      url.searchParams.set("to", to.toString());
      const requestUrl = url.toString();
      if (completedUrls.has(requestUrl)) break;

      const response = await fetch(url, {
        headers: { Authorization: `ApiKey ${key}` },
        signal: signal ?? null,
      });
      const data: unknown = await response.json();
      const apiError = isRecord(data) && isRecord(data.error) ? data.error : null;
      const code = typeof apiError?.code === "number" ? apiError.code : undefined;

      if ((response.status === 429 || code === 5) && rateLimitRetries < 3) {
        rateLimitRetries += 1;
        await waitFor(65_000, signal);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Torn API request failed (${response.status})`);
      }
      if (apiError) {
        throw new TornApiError(
          typeof apiError.error === "string" ? apiError.error : "Torn API returned an error",
          code,
        );
      }
      if (!isRecord(data) || !Array.isArray(data.news)) {
        throw new Error("Torn API returned incomplete faction news");
      }

      rateLimitRetries = 0;
      completedUrls.add(requestUrl);
      for (const item of data.news as ArmoryNews[]) {
        // Use from inside another selected war counts as during that war.
        const seenBeforeWar = news.get(item.id)?.beforeWar ?? true;
        news.set(item.id, { ...item, beforeWar: seenBeforeWar && item.timestamp < range.from });
      }

      const metadata = isRecord(data._metadata) ? data._metadata : null;
      const links = metadata && isRecord(metadata.links) ? metadata.links : null;
      nextUrl = links && typeof links.next === "string" ? links.next : null;
    } while (nextUrl);
  }

  return countArmoryXanax([...news.values()]);
};

export const rankedWarsFromCache = (cachedWars: CachedWarData[]): FactionRankedWar[] => {
  const wars = new Map<number, FactionRankedWar>();

  for (const { range, attacks } of cachedWars) {
    const factions = new Map<number, { id: number; name: string; score: number; chain: number }>();
    for (const attack of attacks) {
      for (const faction of [attack.attacker?.faction, attack.defender.faction]) {
        if (faction && !factions.has(faction.id)) {
          factions.set(faction.id, { ...faction, score: 0, chain: 0 });
        }
      }
    }
    wars.set(range.id, {
      id: range.id,
      start: range.from,
      end: range.to - 1,
      target: 0,
      winner: null,
      factions: [...factions.values()],
    });
  }

  return [...wars.values()].sort((a, b) => b.end - a.end);
};

const fetchFactionRankedWars = async (key: string): Promise<FactionRankedWar[]> => {
  const url = new URL("https://api.torn.com/v2/faction/rankedwars");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: { Authorization: `ApiKey ${key}` },
  });
  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`Torn API request failed (${response.status})`);
  }
  if (isRecord(data) && isRecord(data.error)) {
    const message = data.error.error;
    throw new TornApiError(
      typeof message === "string" ? message : "Torn API returned an error",
      typeof data.error.code === "number" ? data.error.code : undefined,
    );
  }
  if (!isRecord(data) || !Array.isArray(data.rankedwars)) {
    throw new Error("Torn API returned incomplete ranked war data");
  }

  return data.rankedwars as FactionRankedWar[];
};

// Torn is asked first so newly finished wars show up. The cache stands in when the request
// fails, and keeps wars that have fallen off the end of Torn's list.
export const getFactionRankedWars = async (key: string): Promise<RankedWarsResult> => {
  const cachedWars = rankedWarsFromCache(await readCachedWars(await attackCacheScope(key)));
  let networkWars: FactionRankedWar[];
  try {
    networkWars = await fetchFactionRankedWars(key);
  } catch (error) {
    if (cachedWars.length === 0) throw error;
    return { wars: cachedWars, source: "cache" };
  }

  const networkIds = new Set(networkWars.map((war) => war.id));
  const now = Date.now() / 1000;
  // A war in progress has an end of 0. It sorts first; one that has not started yet is left out.
  const sortEnd = (war: FactionRankedWar) => (war.end === 0 ? Infinity : war.end);
  return {
    wars: [...networkWars, ...cachedWars.filter((war) => !networkIds.has(war.id))]
      .filter((war) => war.end > 0 || war.start <= now)
      .sort((a, b) => sortEnd(b) - sortEnd(a)),
    source: "network",
  };
};

export const getFactionChainReport = async (key: string): Promise<FactionChainReport> => {
  const url = "https://api.torn.com/v2/faction/chainreport";
  const params = new URLSearchParams();
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Torn API request failed (${response.status})`);
  }
  if (isRecord(data) && isRecord(data.error)) {
    const message = data.error.error;
    throw new Error(typeof message === "string" ? message : "Torn API returned an error");
  }
  if (!isRecord(data) || !isRecord(data.chainreport)) {
    throw new Error("Torn API returned incomplete chain report data");
  }

  return data.chainreport as FactionChainReport;
};

export const getUserFactionData = async (key: string) => {
  const url = "https://api.torn.com/faction/";
  const params = new URLSearchParams();
  // Ranked wars ride along so the war room scoreboard needs no request of its own.
  params.set("selections", "basic,rankedwars");

  const response = await fetch(`${url}?${params.toString()}`, {
    headers: { Authorization: `ApiKey ${key}` },
  });
  const data = (await response.json()) as Faction;
  if (response.ok) await observeFactionResponse(data);
  return data;
};

export const getEnemyFactionData = async (enemyFactionId: number, key: string) => {
  if (enemyFactionId === 0) {
    return null;
  }

  const url = `https://api.torn.com/faction/${enemyFactionId}`;

  const params = new URLSearchParams();
  params.set("selections", "basic");
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  const data = (await response.json()) as Faction;
  if (response.ok) await observeFactionResponse(data, enemyFactionId);
  return data;
};

export const getEnemyFactionChain = async (enemyFactionId: number, key: string) => {
  const url = `https://api.torn.com/v2/faction/${enemyFactionId}/chain`;

  const params = new URLSearchParams();
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  return response.json() as Promise<{ chain: FactionChain }>;
};

/** The faction we are at war with, read from the first of our ranked wars. */
export const enemyFactionIdOf = (faction: Faction): number | undefined => {
  const factions = Object.values(faction.ranked_wars ?? {})[0]?.factions ?? {};
  const enemyId = Object.keys(factions).find((id) => parseInt(id, 10) !== faction.ID);
  return enemyId === undefined ? undefined : parseInt(enemyId, 10);
};

export type RankedWarsResult = {
  wars: FactionRankedWar[];
  source: "cache" | "network";
};
