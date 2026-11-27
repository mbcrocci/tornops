import { Query } from "@effect/ui";
import { Effect, Schema } from "effect";
import { Opaque } from "@/domain/schema";
import {
  type FFScouterActivityResponse,
  type FFScouterData,
  type FFScouterMemberActivityBatch,
  getActivity,
  getMemberActivity,
} from "@/lib/ffscouter";
import { FFSCOUTER_STATS_TTL, getCachedFFScouterData } from "@/lib/ffscouter-cache";
import { errorMessage } from "./torn";

const FFSCOUTER_BATCH_SIZE = 200;

/** One entry per set of players, so pass the ids sorted and without repeats. */
export const playerIds = (ids: Iterable<number>): number[] =>
  [...new Set(ids)].sort((a, b) => a - b);

/** Estimated battle stats for the players, in batches FFScouter accepts. */
export class GetFFScouterStats extends Query.Service<GetFFScouterStats>()(
  "ffscouter/GetFFScouterStats",
  {
    args: { key: Schema.String, ids: Schema.Array(Schema.Number) },
    success: Opaque<FFScouterData[]>(),
    error: Schema.String,
    staleTime: FFSCOUTER_STATS_TTL,
    idleTimeToLive: FFSCOUTER_STATS_TTL,
  },
) {
  static readonly layer = this.toLayer(({ key, ids }) =>
    Effect.tryPromise({
      try: async () => {
        const results: FFScouterData[] = [];
        for (let i = 0; i < ids.length; i += FFSCOUTER_BATCH_SIZE) {
          results.push(
            ...(await getCachedFFScouterData(key, ids.slice(i, i + FFSCOUTER_BATCH_SIZE))),
          );
        }
        return results;
      },
      catch: errorMessage,
    }),
  );
}

/** Stats by player id, from a stats query's result. */
export const statsById = (stats: ReadonlyArray<FFScouterData> | undefined) =>
  new Map((stats ?? []).map((entry) => [entry.player_id, entry]));

export class GetFactionActivity extends Query.Service<GetFactionActivity>()(
  "ffscouter/GetFactionActivity",
  {
    args: {
      key: Schema.String,
      factionId: Schema.Number,
      start: Schema.Number,
      end: Schema.Number,
    },
    success: Opaque<FFScouterActivityResponse>(),
    error: Schema.String,
    staleTime: "5 minutes",
  },
) {
  static readonly layer = this.toLayer(({ key, factionId, start, end }) =>
    Effect.tryPromise({
      try: () => getActivity(key, { factionId }, start, end),
      catch: errorMessage,
    }),
  );
}

export class GetMemberActivity extends Query.Service<GetMemberActivity>()(
  "ffscouter/GetMemberActivity",
  {
    args: {
      key: Schema.String,
      playerIds: Schema.Array(Schema.Number),
      start: Schema.Number,
      end: Schema.Number,
      /** Players past this many are left out, as `omittedPlayerIds`. */
      limit: Schema.Number,
    },
    success: Opaque<FFScouterMemberActivityBatch>(),
    error: Schema.String,
    staleTime: "5 minutes",
  },
) {
  static readonly layer = this.toLayer(({ key, playerIds, start, end, limit }) =>
    Effect.tryPromise({
      try: () => getMemberActivity(key, [...playerIds], start, end, limit),
      catch: errorMessage,
    }),
  );
}
