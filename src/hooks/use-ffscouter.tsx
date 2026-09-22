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

export type FFScouterActivityBucket = {
  ts: number;
  activity_score: number;
  active_players?: number;
  active_ratio?: number;
};

export type FFScouterActivityMeta = {
  subject_type: "player" | "faction";
  subject_id: number;
  start: number;
  end: number;
  bucket_seconds: number;
  bucket_count: number;
  truncated: boolean;
  member_count?: number;
};

export type FFScouterActivityResponse = {
  code: number;
  meta: FFScouterActivityMeta;
  buckets: FFScouterActivityBucket[];
};

export type FFScouterMemberActivity = {
  playerId: number;
  buckets: FFScouterActivityBucket[];
};

export type FFScouterMemberActivityBatch = {
  members: FFScouterMemberActivity[];
  failedPlayerIds: number[];
  omittedPlayerIds: number[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getActivity = async (
  key: string,
  subject: { factionId: number } | { playerId: number },
  start: number,
  end: number,
): Promise<FFScouterActivityResponse> => {
  const isFaction = "factionId" in subject;
  const url = new URL(`https://ffscouter.com/api/v1/activity/${isFaction ? "faction" : "player"}`);
  url.searchParams.set("key", key);
  url.searchParams.set(
    isFaction ? "faction_id" : "target",
    String(isFaction ? subject.factionId : subject.playerId),
  );
  url.searchParams.set("start", start.toString());
  url.searchParams.set("end", end.toString());
  url.searchParams.set("bucket", "3600");

  const response = await fetch(url);
  const data: unknown = await response.json();
  if (!response.ok || (isRecord(data) && typeof data.error === "string")) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `FFScouter request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (!isRecord(data) || !isRecord(data.meta) || !Array.isArray(data.buckets)) {
    throw new Error("FFScouter returned incomplete activity data");
  }

  return data as FFScouterActivityResponse;
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

export const useFFScouterFactionActivity = (
  factionId: number | undefined,
  start: number,
  end: number,
) => {
  const key = useCredentialsStore((state) => state.ffscouterKey ?? "");
  return useQuery({
    queryKey: ["ffscouter-faction-activity", factionId, start, end, key],
    queryFn: () => getActivity(key, { factionId: factionId ?? 0 }, start, end),
    enabled: Boolean(key && factionId && start < end),
    staleTime: 5 * 60_000,
    retry: false,
  });
};

export const useFFScouterMemberActivity = (
  playerIds: number[],
  start: number,
  end: number,
  enabled: boolean,
) => {
  const key = useCredentialsStore((state) => state.ffscouterKey ?? "");
  const ids = playerIds.slice(0, 55);

  return useQuery({
    queryKey: ["ffscouter-member-activity", ids, start, end, key],
    queryFn: async (): Promise<FFScouterMemberActivityBatch> => {
      const members: FFScouterMemberActivity[] = [];
      const failedPlayerIds: number[] = [];
      const concurrency = 6;
      let cursor = 0;

      const worker = async () => {
        while (cursor < ids.length) {
          const playerId = ids[cursor];
          cursor += 1;
          try {
            const result = await getActivity(key, { playerId }, start, end);
            members.push({ playerId, buckets: result.buckets });
          } catch {
            failedPlayerIds.push(playerId);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));

      return {
        members,
        failedPlayerIds,
        omittedPlayerIds: playerIds.slice(55),
      };
    },
    enabled: Boolean(enabled && key && ids.length && start < end),
    staleTime: 5 * 60_000,
    retry: false,
  });
};
