import type { FFScouterData } from "@/hooks/use-ffscouter";
import { attackCacheScope } from "@/lib/attack-history-cache";
import { withTimeout } from "@/lib/utils";

export const FFSCOUTER_STATS_TTL = 24 * 60 * 60_000;
const STORAGE_PREFIX = "tornops:ffscouter-stats:v1:";
type Entry = { fetchedAt: number; data: FFScouterData | null };
type Cache = Map<number, Entry>;
type Session = {
  cache: Cache;
  storageKey?: string;
  ready: Promise<void>;
  pending: Promise<unknown>;
  retryAt: number;
};
const sessions = new Map<string, Session>();

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Entry;
  return (
    Number.isFinite(entry.fetchedAt) &&
    (entry.data === null ||
      (typeof entry.data === "object" &&
        Number.isSafeInteger(entry.data.player_id) &&
        typeof entry.data.fair_fight === "number" &&
        typeof entry.data.bs_estimate === "number"))
  );
}

function getSession(key: string): Session {
  const existing = sessions.get(key);
  if (existing) return existing;
  const session: Session = {
    cache: new Map(),
    ready: Promise.resolve(),
    pending: Promise.resolve(),
    retryAt: 0,
  };
  session.ready = attackCacheScope(key).then((scope) => {
    if (!scope) return;
    session.storageKey = STORAGE_PREFIX + scope;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(session.storageKey) ?? "[]");
      if (!Array.isArray(stored)) return;
      for (const row of stored) {
        if (
          Array.isArray(row) &&
          Number.isSafeInteger(row[0]) &&
          isEntry(row[1]) &&
          Date.now() - row[1].fetchedAt < FFSCOUTER_STATS_TTL
        ) {
          session.cache.set(row[0], row[1]);
        }
      }
    } catch {
      // Storage can be unavailable; the in-memory cache still works.
    }
  });
  sessions.set(key, session);
  return session;
}

export function getCachedFFScouterData(key: string, targets: number[]): Promise<FFScouterData[]> {
  if (!key || targets.length === 0) return Promise.resolve([]);
  const session = getSession(key);
  // Serialize batches so overlapping rosters reuse the first batch's results.
  const request = session.pending.then(async () => {
    await session.ready;
    const ids = [...new Set(targets)].sort((a, b) => a - b);
    const missing = ids.filter((id) => {
      const entry = session.cache.get(id);
      return !entry || Date.now() - entry.fetchedAt >= FFSCOUTER_STATS_TTL;
    });
    if (missing.length > 0) {
      if (Date.now() < session.retryAt) {
        throw new Error("FFScouter rate limit reached. Please try again later.");
      }
      const params = new URLSearchParams({ key, targets: missing.join(",") });
      const response = await withTimeout(fetch(`https://ffscouter.com/api/v1/get-stats?${params}`));
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter ? Number(retryAfter) : NaN;
        const retryAt = Number.isFinite(seconds)
          ? Date.now() + seconds * 1000
          : Date.parse(retryAfter ?? "");
        session.retryAt = Math.max(Date.now() + 60_000, retryAt || 0);
      }
      if (!response.ok) {
        throw new Error(`FFScouter request failed with status ${response.status}`);
      }
      const data: unknown = await withTimeout(response.json());
      if (
        !Array.isArray(data) ||
        !data.every((item) => isEntry({ fetchedAt: Date.now(), data: item }) && item !== null)
      ) {
        throw new Error("FFScouter returned an invalid response");
      }
      const fetchedAt = Date.now();
      // Remember missing estimates too, so unknown players don't trigger repeated calls.
      for (const id of missing) session.cache.set(id, { fetchedAt, data: null });
      for (const item of data as FFScouterData[]) {
        if (missing.includes(item.player_id)) {
          session.cache.set(item.player_id, { fetchedAt, data: item });
        }
      }
      for (const [id, entry] of session.cache) {
        if (fetchedAt - entry.fetchedAt >= FFSCOUTER_STATS_TTL) session.cache.delete(id);
      }
      try {
        if (session.storageKey) {
          localStorage.setItem(session.storageKey, JSON.stringify([...session.cache]));
        }
      } catch {
        // A full or disabled storage must not discard the fetched stats.
      }
    }
    return ids.flatMap((id) => {
      const data = session.cache.get(id)?.data;
      return data ? [data] : [];
    });
  });
  session.pending = request.catch(() => undefined);
  return request;
}
