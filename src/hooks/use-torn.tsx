import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type {
	Faction,
	FactionAttack,
	FactionAttackHistory,
	FactionChain,
	FactionChainReport,
} from "@/lib/faction";
import {
	type EnemyMember,
	useCredentialsStore,
	useGlobalStore,
} from "@/lib/stores";
import type { User } from "@/lib/user";
import { useFFScouterData } from "./use-ffscouter";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const getUserData = async (key: string): Promise<User> => {
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
			typeof apiError === "string"
				? apiError
				: "Torn API returned incomplete user data";
		throw new Error(message);
	}

	return data as User;
};

const getUserFaction = async (key: string) => {
	const url = "https://api.torn.com/faction/";
	const params = new URLSearchParams();
	params.set("selections", "basic,rankedwars");
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<Faction>;
};

const getUserFactionChain = async (key: string) => {
	const url = "https://api.torn.com/v2/faction/chain";
	const params = new URLSearchParams();
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<{ chain: FactionChain }>;
};

class TornApiError extends Error {
	constructor(
		message: string,
		readonly code: number | undefined,
	) {
		super(message);
	}
}

const keysWithoutFactionAttackAccess = new Set<string>();

const getChainAttacks = async (
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
				(attack) =>
					typeof attack.chain === "number" &&
					attack.chain > 0 &&
					!attack.is_interrupted,
			)
			.slice(0, 10);
	};

	if (!keysWithoutFactionAttackAccess.has(key)) {
		try {
			return { attacks: await fetchAttacks("faction"), scope: "faction" };
		} catch (error) {
			if (
				!(error instanceof TornApiError) ||
				(error.code !== 7 && error.code !== 16)
			) {
				throw error;
			}
			keysWithoutFactionAttackAccess.add(key);
		}
	}

	return { attacks: [], scope: "monitor" };
};

const getFactionAttackHistory = async (
	key: string,
	from: number,
	to: number,
): Promise<FactionAttackHistory> => {
	const attacks = new Map<number, FactionAttack>();
	let nextUrl: string | null = null;
	let page = 0;

	do {
		const url = new URL(nextUrl ?? "https://api.torn.com/v2/faction/attacks");
		if (!nextUrl) {
			url.searchParams.set("filters", "outgoing");
			url.searchParams.set("from", from.toString());
			url.searchParams.set("limit", "100");
			url.searchParams.set("sort", "ASC");
		}
		// Torn's pagination links omit the original upper bound.
		url.searchParams.set("to", to.toString());

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
		if (!isRecord(data) || !Array.isArray(data.attacks)) {
			throw new Error("Torn API returned incomplete attack data");
		}

		for (const attack of data.attacks as FactionAttack[]) {
			attacks.set(attack.id, attack);
		}

		const metadata = isRecord(data._metadata) ? data._metadata : null;
		const links = metadata && isRecord(metadata.links) ? metadata.links : null;
		nextUrl = links && typeof links.next === "string" ? links.next : null;
		page += 1;
	} while (nextUrl && page < 50);

	return {
		attacks: [...attacks.values()].sort((a, b) => a.ended - b.ended),
		truncated: Boolean(nextUrl),
	};
};

const getFactionChainReport = async (key: string): Promise<FactionChainReport> => {
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
		throw new Error(
			typeof message === "string" ? message : "Torn API returned an error",
		);
	}
	if (!isRecord(data) || !isRecord(data.chainreport)) {
		throw new Error("Torn API returned incomplete chain report data");
	}

	return data.chainreport as FactionChainReport;
};

const getUserFactionData = async (key: string) => {
	const url = "https://api.torn.com/faction/";
	const params = new URLSearchParams();
	params.set("selections", "basic");
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<Faction>;
};

const getEnemyFactionData = async (enemyFactionId: number, key: string) => {
	if (enemyFactionId === 0) {
		return null;
	}

	const url = `https://api.torn.com/faction/${enemyFactionId}`;

	const params = new URLSearchParams();
	params.set("selections", "basic");
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<Faction>;
};

const getEnemyFactionChain = async (enemyFactionId: number, key: string) => {
	const url = `https://api.torn.com/v2/faction/${enemyFactionId}/chain`;

	const params = new URLSearchParams();
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<{ chain: FactionChain }>;
};

export const useUserData = (refetchIntervalOverride?: number) => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["user-data", key],
		queryFn: () => getUserData(key),
		refetchInterval: refetchIntervalOverride ?? refetchInterval,
	});
};

export const useUserFaction = () => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);
	const setEnemyFactionId = useGlobalStore((state) => state.setEnemyFactionId);

	return useQuery({
		queryKey: ["user-faction", key],
		queryFn: async () => {
			const data = await getUserFaction(key);

			const factions = Object.values(data.ranked_wars)[0]?.factions ?? [];
			Object.keys(factions).forEach((key) => {
				if (key !== data.ID.toString()) {
					setEnemyFactionId(parseInt(key, 10));
				}
			});

			return data;
		},
		refetchInterval: refetchInterval,
	});
};

export const useCheckWarsForEnemyFaction = () => {
	const publicKey = useCredentialsStore((state) => state.publicKey ?? "");
	const setEnemyFactionId = useGlobalStore((state) => state.setEnemyFactionId);

	return useMutation({
		mutationFn: async (): Promise<{ enemySet: boolean }> => {
			if (!publicKey) {
				throw new Error("No API key provided");
			}
			const data = await getUserFaction(publicKey);
			const firstWar = Object.values(data.ranked_wars)[0];
			const factions = firstWar?.factions ?? {};
			const enemyId = Object.keys(factions).find(
				(id) => parseInt(id, 10) !== data.ID,
			);
			if (enemyId) {
				setEnemyFactionId(parseInt(enemyId, 10));
				return { enemySet: true };
			}
			return { enemySet: false };
		},
	});
};

export const useEnemyFactionData = (refetchIntervalOverride?: number) => {
	const publicKey = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);
	const enemyFactionId = useGlobalStore((state) => state.enemyFactionId ?? 0);

	return useQuery({
		queryKey: ["enemy-faction-data", enemyFactionId],
		queryFn: () => getEnemyFactionData(enemyFactionId, publicKey),
		refetchInterval: refetchIntervalOverride ?? refetchInterval,
	});
};

export const useUserFactionChain = (refetchIntervalOverride?: number) => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["user-faction-chain", key],
		queryFn: () => getUserFactionChain(key),
		refetchInterval: refetchIntervalOverride ?? refetchInterval,
	});
};

export const useFactionChainReport = (
	enabled: boolean,
	refetchIntervalOverride?: number,
) => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["faction-chain-report", key],
		queryFn: () => getFactionChainReport(key),
		enabled: Boolean(key && enabled),
		refetchInterval: refetchIntervalOverride ?? refetchInterval,
	});
};

export const useFactionChainAttacks = (
	chainStart: number | undefined,
	refetchIntervalOverride?: number,
) => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["faction-chain-attacks", chainStart, key],
		queryFn: () => getChainAttacks(key, chainStart ?? 0),
		enabled: Boolean(key && chainStart),
		refetchInterval: refetchIntervalOverride ?? refetchInterval,
	});
};

export const useFactionAttackHistory = (from: number, to: number) => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");

	return useQuery({
		queryKey: ["faction-attack-history", from, to, key],
		queryFn: () => getFactionAttackHistory(key, from, to),
		enabled: Boolean(key && from && to && from < to),
		staleTime: 60_000,
		retry: false,
	});
};

export const useEnemyFactionChain = () => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const enemyFactionId = useGlobalStore((state) => state.enemyFactionId ?? 0);
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["enemy-faction-chain", enemyFactionId],
		queryFn: () => getEnemyFactionChain(enemyFactionId, key),
		refetchInterval: refetchInterval,
	});
};

/**
 * Hook that fetches enemy faction data, enriches members with FFScouter data,
 * and stores them in the global store.
 */
export const useEnemyMembers = (refetchIntervalOverride?: number) => {
	const { data: enemyFactionData, dataUpdatedAt } = useEnemyFactionData(
		refetchIntervalOverride,
	);
	const setEnemyMembers = useGlobalStore((state) => state.setEnemyMembers);
	const setEnemyFaction = useGlobalStore((state) => state.setEnemyFaction);
	const setLastRefreshTime = useGlobalStore(
		(state) => state.setLastRefreshTime,
	);

	// Convert members object to array with IDs
	const members = useMemo(() => {
		if (!enemyFactionData?.members) return [];
		return Object.entries(enemyFactionData.members).map(([id, member]) => ({
			...member,
			id: parseInt(id, 10),
		}));
	}, [enemyFactionData?.members]);

	// Get FF scouter data for all members
	const memberIds = useMemo(
		() => members.map((member) => member.id),
		[members],
	);
	const { data: ffScouterData } = useFFScouterData(memberIds);

	useEffect(() => {
		if (enemyFactionData) {
			setEnemyFaction({
				id: enemyFactionData.ID,
				name: enemyFactionData.name,
				tag: enemyFactionData.tag,
				capacity: enemyFactionData.capacity,
			});
			// Update refresh time when data is fetched
			setLastRefreshTime(dataUpdatedAt);
		}
	}, [enemyFactionData, dataUpdatedAt, setEnemyFaction, setLastRefreshTime]);

	// Enrich members with FF scouter data and store in global store
	useEffect(() => {
		if (members.length > 0 && ffScouterData) {
			const enrichedMembers: EnemyMember[] = members.map((member) => {
				const ffs = ffScouterData.find((f) => f.player_id === member.id);
				return { ...member, ffs };
			});
			setEnemyMembers(enrichedMembers);
		} else {
			setEnemyMembers(members);
		}
	}, [members, ffScouterData, setEnemyMembers]);
};

export const useUserFactionData = () => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["user-faction-data", key],
		queryFn: () => getUserFactionData(key),
		refetchInterval: refetchInterval,
	});
};

/**
 * Hook that fetches user faction data, enriches members with FFScouter data,
 * and stores them in the global store.
 */
export const useUserMembers = () => {
	const { data: userFactionData, dataUpdatedAt } = useUserFactionData();
	const setUserMembers = useGlobalStore((state) => state.setUserMembers);
	const setUserFaction = useGlobalStore((state) => state.setUserFaction);
	const setLastRefreshTime = useGlobalStore(
		(state) => state.setLastRefreshTime,
	);

	// Convert members object to array with IDs
	const members = useMemo(() => {
		if (!userFactionData?.members) return [];
		return Object.entries(userFactionData.members).map(([id, member]) => ({
			...member,
			id: parseInt(id, 10),
		}));
	}, [userFactionData?.members]);

	// Get FF scouter data for all members
	const memberIds = useMemo(
		() => members.map((member) => member.id),
		[members],
	);
	const { data: ffScouterData } = useFFScouterData(memberIds);

	useEffect(() => {
		if (userFactionData) {
			setUserFaction({
				id: userFactionData.ID,
				name: userFactionData.name,
				tag: userFactionData.tag,
				capacity: userFactionData.capacity,
			});
			// Update refresh time when data is fetched
			setLastRefreshTime(dataUpdatedAt);
		}
	}, [userFactionData, dataUpdatedAt, setUserFaction, setLastRefreshTime]);

	// Enrich members with FF scouter data and store in global store
	useEffect(() => {
		if (members.length > 0 && ffScouterData) {
			const enrichedMembers: EnemyMember[] = members.map((member) => {
				const ffs = ffScouterData.find((f) => f.player_id === member.id);
				return { ...member, ffs };
			});
			setUserMembers(enrichedMembers);
		} else {
			setUserMembers(members);
		}
	}, [members, ffScouterData, setUserMembers]);
};
