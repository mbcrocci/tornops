import { Query } from "@effect/ui";
import { Effect, Schema } from "effect";
import { Opaque } from "@/domain/schema";
import type { Bounty } from "@/lib/bounties";
import { BOUNTY_LIST_REFRESH_INTERVAL, getBounties } from "@/lib/bounty-statuses";
import { errorMessage } from "./torn";

/** Every listed bounty down to the minimum reward. Paging stops below it. */
export class GetBounties extends Query.Service<GetBounties>()("torn/GetBounties", {
  args: { key: Schema.String, minReward: Schema.NullOr(Schema.Number) },
  success: Opaque<Bounty[]>(),
  error: Schema.String,
  staleTime: BOUNTY_LIST_REFRESH_INTERVAL,
  // The full list costs one request per 100 bounties, so it refreshes far less often than
  // the statuses on screen.
  refetchInterval: BOUNTY_LIST_REFRESH_INTERVAL,
}) {
  static readonly layer = this.toLayer(({ key, minReward }) =>
    Effect.tryPromise({
      try: (signal) => getBounties(key, minReward ?? undefined, signal),
      catch: errorMessage,
    }),
  );
}
