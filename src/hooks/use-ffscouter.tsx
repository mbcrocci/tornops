import { useQuery } from "@tanstack/react-query";
import { useCredentialsStore } from "@/lib/stores";
import { FFSCOUTER_STATS_TTL, getCachedFFScouterData } from "@/lib/ffscouter-cache";

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
  firstError?: string;
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

export const useFFScouterData = (targets: number[]) => {
  const ffScouterKey = useCredentialsStore((state) => state.ffscouterKey ?? "");
  const ids = [...new Set(targets)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["ffscouter-data", ffScouterKey, ids],
    queryFn: () => getCachedFFScouterData(ffScouterKey, ids),
    enabled: Boolean(ffScouterKey) && ids.length > 0,
    staleTime: FFSCOUTER_STATS_TTL,
    gcTime: FFSCOUTER_STATS_TTL,
    refetchInterval: false,
    retry: false,
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
  limit = 55,
) => {
  const key = useCredentialsStore((state) => state.ffscouterKey ?? "");
  const ids = playerIds.slice(0, limit);

  return useQuery({
    queryKey: ["ffscouter-member-activity", ids, start, end, key],
    queryFn: async (): Promise<FFScouterMemberActivityBatch> => {
      const members: FFScouterMemberActivity[] = [];
      const failedPlayerIds: number[] = [];
      let firstError: string | undefined;
      const concurrency = 6;
      let cursor = 0;

      // Stop early when nothing has succeeded, e.g. a key without Premium access.
      const giveUp = () => firstError !== undefined && members.length === 0;
      const worker = async () => {
        while (cursor < ids.length && !giveUp()) {
          const playerId = ids[cursor];
          cursor += 1;
          try {
            const result = await getActivity(key, { playerId }, start, end);
            members.push({ playerId, buckets: result.buckets });
          } catch (error) {
            failedPlayerIds.push(playerId);
            firstError ??= error instanceof Error ? error.message : String(error);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
      failedPlayerIds.push(...ids.slice(cursor));

      return {
        members,
        failedPlayerIds,
        omittedPlayerIds: playerIds.slice(limit),
        firstError,
      };
    },
    enabled: Boolean(enabled && key && ids.length && start < end),
    staleTime: 5 * 60_000,
    retry: false,
  });
};
