import { useQuery } from "@tanstack/react-query";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";

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
  if (!response.ok) {
    throw new Error(`FFScouter request failed with status ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("FFScouter returned an invalid response");
  }

  return data as FFScouterData[];
};

export const useFFScouterData = (targets: number[]) => {
  const refetchInterval = useGlobalStore((state) => state.refetchInterval);
  const ffScouterKey = useCredentialsStore((state) => state.ffscouterKey ?? "");
  return useQuery({
    queryKey: ["ffscouter-data", ffScouterKey, targets],
    queryFn: () => {
      if (!ffScouterKey || targets.length === 0) return [];

      return getFFScouterData(ffScouterKey, targets);
    },
    enabled: Boolean(ffScouterKey) && targets.length > 0,
    refetchInterval: refetchInterval,
  });
};
