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

export const getActivity = async (
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

/** Activity for each player, fetched a few at a time. Stops early when nothing succeeds. */
export const getMemberActivity = async (
  key: string,
  playerIds: number[],
  start: number,
  end: number,
  limit = 55,
): Promise<FFScouterMemberActivityBatch> => {
  const ids = playerIds.slice(0, limit);
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
    ...(firstError === undefined ? {} : { firstError }),
  };
};
