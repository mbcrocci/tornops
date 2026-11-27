import { Route } from "@effect/ui";
import { Schema } from "effect";

export const AppRoute = Route.union(
  {
    WarRoom: Route.make("/"),
    ChainWatcher: Route.make("/chain-watcher"),
    WarPlanning: Route.make("/war-planning"),
    WarReport: Route.make("/war-report"),
    // The war report links here with the wars it has selected.
    WarPayout: Route.make("/war-payout", {
      search: {
        // Absent picks the most recent war.
        wars: Schema.optional(Schema.Array(Schema.Int)),
      },
    }),
    Bounties: Route.make("/bounties"),
    NotFound: Route.make("/*"),
  },
  // The war report was called the attack history. Old bookmarks still land on it.
  Route.redirect("/attack-history", () => ({ _tag: "WarReport" })),
);
export type AppRoute = typeof AppRoute.Type;
