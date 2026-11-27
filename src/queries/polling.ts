import { Subscription } from "@effect/ui";
import { Effect, Stream } from "effect";
import { DEFAULT_REFETCH_INTERVAL } from "@/domain/Settings";

// How often the live Torn queries poll. The rate isn't part of a query's args, which are its
// cache key: pages that poll at different rates still share one entry, so a page that opens
// shows what another page fetched a moment ago. Each mounted page asks for a rate while it's
// up, and every query it names polls at the fastest rate asked for.

/** The queries that poll, by name. */
export type PolledQuery =
  | "torn/GetUser"
  | "torn/GetOurFaction"
  | "torn/GetEnemyFaction"
  | "torn/GetOurChain"
  | "torn/GetEnemyChain"
  | "torn/GetChainReport"
  | "torn/GetChainAttacks";

type Lease = { readonly ms: number; readonly queries: ReadonlySet<PolledQuery> | "all" };

const leases = new Set<Lease>();

/** The interval a polled query refetches at: the fastest rate any mounted page asks of it. */
export const pollRate = (query: PolledQuery): number => {
  let rate = Number.POSITIVE_INFINITY;
  for (const lease of leases) {
    if (lease.ms < rate && (lease.queries === "all" || lease.queries.has(query))) rate = lease.ms;
  }
  return Number.isFinite(rate) ? rate : DEFAULT_REFETCH_INTERVAL;
};

/**
 * A Subscription that asks for `ms` polling of the named queries (every polled query when
 * omitted) while it runs. Queries pick a new rate when their next fetch settles, so `refresh`
 * runs once the lease is held, to fetch at once what should poll faster from now on.
 */
export const pollAt = <R = never>(
  name: string,
  ms: number,
  options: {
    readonly queries?: ReadonlyArray<PolledQuery>;
    readonly refresh?: Effect.Effect<void, never, R>;
  } = {},
) =>
  Subscription.make(name, [ms], ([rate]) =>
    Stream.unwrap(
      Effect.acquireRelease(
        Effect.sync(() => {
          const lease: Lease = {
            ms: Number(rate),
            queries: options.queries ? new Set(options.queries) : "all",
          };
          leases.add(lease);
          return lease;
        }),
        (lease) => Effect.sync(() => leases.delete(lease)),
      ).pipe(Effect.andThen(options.refresh ?? Effect.void), Effect.as(Stream.never)),
    ),
  );
