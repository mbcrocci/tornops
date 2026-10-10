import type { Faction, StatusEnum } from "./faction";

export const ACTIVITY_RETENTION_DAYS = 30;
export type ActivityMember = { name: string; online: number; idle: number; offline: number };
export type ActivityHour = {
  id: string;
  factionId: number;
  factionName: string;
  hour: number;
  minutes: number[];
  members: Record<string, ActivityMember>;
};

// One observation per minute. Each member's denominator includes only observations
// where that member was on the roster and had a recognized presence status.
export function addObservation(
  previous: ActivityHour | undefined,
  faction: Faction,
  at: number,
): ActivityHour {
  const hour = Math.floor(at / 3_600_000) * 3_600_000;
  const minute = Math.floor(at / 60_000) % 60;
  const row: ActivityHour = previous
    ? structuredClone(previous)
    : {
        id: `${faction.ID}:${hour}`,
        factionId: faction.ID,
        factionName: faction.name,
        hour,
        minutes: [],
        members: {},
      };
  if (row.minutes.includes(minute)) return row;
  row.minutes.push(minute);
  row.factionName = faction.name;
  for (const [id, member] of Object.entries(faction.members)) {
    const status = member.last_action?.status;
    if (!["Online", "Idle", "Offline"].includes(status)) continue;
    const counts = row.members[id] ?? { name: member.name, online: 0, idle: 0, offline: 0 };
    counts.name = member.name;
    counts[status.toLowerCase() as Lowercase<StatusEnum>] += 1;
    row.members[id] = counts;
  }
  return row;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tornops-presence", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("hours", { keyPath: "id" });
      store.createIndex("factionId", "factionId");
      store.createIndex("hour", "hour");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser activity storage could not be opened."));
  });
}

export async function recordObservation(faction: Faction, at: number): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("hours", "readwrite");
      const store = tx.objectStore("hours");
      const hour = Math.floor(at / 3_600_000) * 3_600_000;
      const request = store.get(`${faction.ID}:${hour}`);
      request.onsuccess = () => store.put(addObservation(request.result, faction, at));
      const expired = store
        .index("hour")
        .openCursor(IDBKeyRange.upperBound(at - ACTIVITY_RETENTION_DAYS * 86_400_000));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(new Error("Activity could not be saved. Check browser storage space."));
    });
  } finally {
    db.close();
  }
}

export async function readActivity(factionId: number): Promise<ActivityHour[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("hours")
        .objectStore("hours")
        .index("factionId")
        .getAll(factionId);
      request.onsuccess = () =>
        resolve(
          (request.result as ActivityHour[])
            .filter((row) => row.hour >= Date.now() - ACTIVITY_RETENTION_DAYS * 86_400_000)
            .sort((a, b) => a.hour - b.hour),
        );
      request.onerror = () => reject(new Error("Saved activity could not be loaded."));
    });
  } finally {
    db.close();
  }
}
