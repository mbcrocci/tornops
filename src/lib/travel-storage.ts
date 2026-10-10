import { openDatabase, TRAVEL_STORE as STORE_NAME } from "./db";
import type { TravelObservation } from "./travel";

const RETENTION_MS = 30 * 86_400_000;

// Latest observation per member. `observedAt` is the last read, so a restored record
// tells the estimator how long we were not watching.
export type StoredTravelObservation = TravelObservation & {
  id: number;
  factionId: number;
};

async function readWhere(
  query: (store: IDBObjectStore) => IDBRequest<StoredTravelObservation[]>,
): Promise<StoredTravelObservation[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = query(db.transaction(STORE_NAME).objectStore(STORE_NAME));
      request.onsuccess = () =>
        resolve(request.result.filter((row) => row.observedAt >= Date.now() - RETENTION_MS));
      request.onerror = () => reject(new Error("Saved travel could not be loaded."));
    });
  } finally {
    db.close();
  }
}

export function readTravelObservations(): Promise<StoredTravelObservation[]> {
  return readWhere((store) => store.getAll());
}

export function readFactionTravelObservations(
  factionId: number,
): Promise<StoredTravelObservation[]> {
  return readWhere((store) => store.index("factionId").getAll(factionId));
}

export async function saveTravelObservations(rows: StoredTravelObservation[]): Promise<void> {
  if (typeof indexedDB === "undefined" || !rows.length) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const row of rows) store.put(row);
      const expired = store
        .index("observedAt")
        .openCursor(IDBKeyRange.upperBound(Date.now() - RETENTION_MS));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(new Error("Travel could not be saved. Check browser storage space."));
    });
  } finally {
    db.close();
  }
}
