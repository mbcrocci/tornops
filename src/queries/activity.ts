import { Query } from "@effect/ui";
import { Effect, Schema } from "effect";
import { Opaque } from "@/domain/schema";
import { type ActivityHour, readActivity } from "@/lib/activity-tracking";
import { errorMessage } from "./torn";

/**
 * The presence TornOps recorded for a faction in this browser. Each faction fetch records
 * more, so `recordedAt`, the time of the latest fetch, names the entry that includes it.
 */
export class GetRecordedActivity extends Query.Service<GetRecordedActivity>()(
  "activity/GetRecordedActivity",
  {
    args: { factionId: Schema.Number, recordedAt: Schema.Number },
    success: Opaque<ActivityHour[]>(),
    error: Schema.String,
    staleTime: "Infinity",
    idleTimeToLive: "30 seconds",
  },
) {
  static readonly layer = this.toLayer(({ factionId }) =>
    Effect.tryPromise({ try: () => readActivity(factionId), catch: errorMessage }),
  );
}
