import { ATTACK_HISTORY_STORE as STORE_NAME, openDatabase, requestResult } from "@/lib/db";
import type { FactionAttack } from "@/lib/faction";

export type WarAttackRange = { id: number; from: number; to: number };

export type AttackDirection = "outgoing" | "incoming";

type CachedWar = {
  id: string;
  attacks: FactionAttack[];
};

export type CachedWarData = {
  range: WarAttackRange;
  attacks: FactionAttack[];
};

export async function attackCacheScope(apiKey: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(apiKey);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return null;
  }
}

// Outgoing records keep their original key so wars cached before incoming attacks were
// stored still load. Incoming records sit beside them under an "in:" prefix.
function cacheId(scope: string, range: WarAttackRange, direction: AttackDirection) {
  const prefix = direction === "incoming" ? `${scope}:in` : scope;
  return `${prefix}:${range.id}:${range.from}:${range.to}`;
}

export async function readCachedWar(
  scope: string | null,
  range: WarAttackRange,
  direction: AttackDirection = "outgoing",
): Promise<FactionAttack[] | null> {
  if (!scope || typeof indexedDB === "undefined") return null;
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const record = await requestResult<CachedWar | undefined>(
        transaction.objectStore(STORE_NAME).get(cacheId(scope, range, direction)),
      );
      return Array.isArray(record?.attacks) ? record.attacks : null;
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

export async function readCachedWars(scope: string | null): Promise<CachedWarData[]> {
  if (!scope || typeof indexedDB === "undefined") return [];
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const records = await requestResult<CachedWar[]>(
        transaction.objectStore(STORE_NAME).getAll(),
      );
      const prefix = `${scope}:`;
      return records.flatMap((record) => {
        if (
          !record.id.startsWith(prefix) ||
          record.id.startsWith(`${prefix}in:`) ||
          !Array.isArray(record.attacks)
        ) {
          return [];
        }
        const [id, from, to] = record.id.slice(prefix.length).split(":").map(Number);
        if (![id, from, to].every(Number.isSafeInteger)) return [];
        return [{ range: { id, from, to }, attacks: record.attacks }];
      });
    } finally {
      database.close();
    }
  } catch {
    return [];
  }
}

export async function writeCachedWar(
  scope: string | null,
  range: WarAttackRange,
  attacks: FactionAttack[],
  direction: AttackDirection = "outgoing",
): Promise<void> {
  if (!scope || typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const committed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
      transaction.objectStore(STORE_NAME).put({
        id: cacheId(scope, range, direction),
        attacks,
      } satisfies CachedWar);
      await committed;
    } finally {
      database.close();
    }
  } catch {
    // Browser storage may be disabled or full. The fetched result still works.
  }
}
