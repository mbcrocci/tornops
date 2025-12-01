import { useQuery } from "@tanstack/react-query";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";

export const FFSCOUTER_API_KEY = "CJJfNJkBgoyMFouX";

export type FFScouterData = {
  player_id: number;
  fair_fight: number;
  bs_estimate: number;
  bs_estimate_human: string;
  bss_public: number;
  last_updated: number;
};
const getFFScouterData = async (key: string, targets: number[]) => {
  const url = "https://ffscouter.com/api/v1/get-stats";
  const params = new URLSearchParams();
  params.set("key", key);
  params.set("targets", targets.join(","));

  const response = await fetch(`${url}?${params.toString()}`);
  return response.json() as Promise<FFScouterData[]>;
};

export const useFFScouterData = (targets: number[]) => {
  const refetchInterval = useGlobalStore((state) => state.refetchInterval);
  const ffScouterKey = useCredentialsStore((state) => state.ffscouterKey ?? "");
  return useQuery({
    queryKey: ["ffscouter-data", ffScouterKey, targets],
    queryFn: () => {
      if (!ffScouterKey) return [];

      return getFFScouterData(ffScouterKey, targets);
    },
    refetchInterval: refetchInterval,
  });
};
