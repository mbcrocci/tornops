import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Faction, FactionChain } from "@/lib/faction";
import {
	type EnemyMember,
	useCredentialsStore,
	useGlobalStore,
} from "@/lib/stores";
import type { User } from "@/lib/user";
import { useFFScouterData } from "./use-ffscouter";

const getUserData = async (key: string) => {
	if (!key) {
		throw new Error("No key provided");
	}

	const url = "https://api.torn.com/user/";
	const params = new URLSearchParams();
	params.set("selections", "profile,cooldowns,bars");
	params.set("key", key);

	const response = await fetch(`${url}?${params.toString()}`);
	return response.json() as Promise<User>;
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

export const useUserData = () => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["user-data", key],
		queryFn: () => getUserData(key),
		refetchInterval: refetchInterval,
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

export const useEnemyFactionData = () => {
	const publicKey = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);
	const enemyFactionId = useGlobalStore((state) => state.enemyFactionId ?? 0);

	return useQuery({
		queryKey: ["enemy-faction-data", enemyFactionId],
		queryFn: () => getEnemyFactionData(enemyFactionId, publicKey),
		refetchInterval: refetchInterval,
	});
};

export const useUserFactionChain = () => {
	const key = useCredentialsStore((state) => state.publicKey ?? "");
	const refetchInterval = useGlobalStore((state) => state.refetchInterval);

	return useQuery({
		queryKey: ["user-faction-chain", key],
		queryFn: () => getUserFactionChain(key),
		refetchInterval: refetchInterval,
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
export const useEnemyMembers = () => {
	const { data: enemyFactionData, dataUpdatedAt } = useEnemyFactionData();
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
