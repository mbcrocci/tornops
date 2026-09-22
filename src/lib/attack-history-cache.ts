import type { FactionAttack } from "@/lib/faction";

const DATABASE_NAME = "tornops-attack-history";
const STORE_NAME = "completed-wars";
const DATABASE_VERSION = 1;

export type WarAttackRange = { id: number; from: number; to: number };

type CachedWar = {
	id: string;
	attacks: FactionAttack[];
};

export type CachedWarData = {
	range: WarAttackRange;
	attacks: FactionAttack[];
};

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function attackCacheScope(apiKey: string): Promise<string | null> {
	try {
		const bytes = new TextEncoder().encode(apiKey);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
	} catch {
		return null;
	}
}

function cacheId(scope: string, range: WarAttackRange) {
	return `${scope}:${range.id}:${range.from}:${range.to}`;
}

export async function readCachedWar(
	scope: string | null,
	range: WarAttackRange,
): Promise<FactionAttack[] | null> {
	if (!scope || typeof indexedDB === "undefined") return null;
	try {
		const database = await openDatabase();
		try {
			const transaction = database.transaction(STORE_NAME, "readonly");
			const record = await requestResult<CachedWar | undefined>(
				transaction.objectStore(STORE_NAME).get(cacheId(scope, range)),
			);
			return Array.isArray(record?.attacks) ? record.attacks : null;
		} finally {
			database.close();
		}
	} catch {
		return null;
	}
}

export async function readCachedWars(
	scope: string | null,
): Promise<CachedWarData[]> {
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
				if (!record.id.startsWith(prefix) || !Array.isArray(record.attacks)) {
					return [];
				}
				const [id, from, to] = record.id
					.slice(prefix.length)
					.split(":")
					.map(Number);
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
					id: cacheId(scope, range),
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
