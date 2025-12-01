import { useQuery } from "@tanstack/react-query";
import type { Faction, FactionChain } from "@/lib/faction";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";
import type { User } from "@/lib/user";

export const TEST_KEY = "LLHrCIqC3Tfp0yJc";
export const TEST_ENEMY_FACTION_ID = 46144;

const getUserData = async (key: string) => {
  if (!key) {
    throw new Error("No key provided");
  }

  const url = "https://api.torn.com/user/";
  const params = new URLSearchParams();
  params.set("selections", "profile,cooldowns");
  params.set("key", key);

  const response = await fetch(`${url}?${params.toString()}`);
  return response.json() as Promise<User>;
};

const getUserFaction = async (key: string) => {
  const url = "https://api.torn.com/faction/";
  const params = new URLSearchParams();
  params.set("selections", "basic");
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
