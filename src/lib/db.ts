const DATABASE_NAME = "tornops";
const DATABASE_VERSION = 1;

export const TRAVEL_STORE = "travel";
export const ATTACK_HISTORY_STORE = "attack-history";
export const ACTIVITY_STORE = "activity";

// Each feature used to have its own database. Their rows are copied in once, then the
// old databases are deleted.
const LEGACY_DATABASES = [
  { name: "tornops-travel", from: "observations", to: TRAVEL_STORE },
  { name: "tornops-attack-history", from: "completed-wars", to: ATTACK_HISTORY_STORE },
  { name: "tornops-presence", from: "hours", to: ACTIVITY_STORE },
];

let migration: Promise<void> | undefined;

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const travel = db.createObjectStore(TRAVEL_STORE, { keyPath: "id" });
      travel.createIndex("factionId", "factionId");
      travel.createIndex("observedAt", "observedAt");
      db.createObjectStore(ATTACK_HISTORY_STORE, { keyPath: "id" });
      const activity = db.createObjectStore(ACTIVITY_STORE, { keyPath: "id" });
      activity.createIndex("factionId", "factionId");
      activity.createIndex("hour", "hour");
    };
    request.onsuccess = () => {
      // Let another tab upgrade the schema instead of blocking it.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error("Browser storage could not be opened."));
  });
}

// Resolves null when the database does not exist. Aborting the upgrade keeps the open
// from creating it.
function openLegacy(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function migrateLegacy(db: IDBDatabase): Promise<void> {
  for (const legacy of LEGACY_DATABASES) {
    try {
      const old = await openLegacy(legacy.name);
      if (!old) continue;
      try {
        if (old.objectStoreNames.contains(legacy.from)) {
          const rows = await requestResult(
            old.transaction(legacy.from).objectStore(legacy.from).getAll(),
          );
          const tx = db.transaction(legacy.to, "readwrite");
          const store = tx.objectStore(legacy.to);
          for (const row of rows) store.put(row);
          await transactionDone(tx);
        }
      } finally {
        old.close();
      }
      indexedDB.deleteDatabase(legacy.name);
    } catch {
      // Leave the old database in place and try again on the next load.
    }
  }
}

export async function openDatabase(): Promise<IDBDatabase> {
  const db = await open();
  migration ??= migrateLegacy(db);
  await migration;
  return db;
}
