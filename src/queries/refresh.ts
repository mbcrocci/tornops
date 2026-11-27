import { Command } from "@effect/ui";
import { Effect } from "effect";
import { GetBounties } from "./bounties";
import { GetArmoryXanax, GetEnemyFaction, GetOurFaction, GetRankedWars } from "./torn";

/** Refetches both factions now, without waiting for the next poll. */
export class RefreshFactions extends Command.Service<RefreshFactions>()("torn/RefreshFactions", {
  invalidates: () => [GetOurFaction, GetEnemyFaction],
}) {
  static readonly layer = this.toLayer(() => Effect.void);
}

/** Refetches the war list and armory use. Attacks refresh through their own `refresh` arg. */
export class RefreshWarReport extends Command.Service<RefreshWarReport>()("torn/RefreshWarReport", {
  invalidates: () => [GetRankedWars, GetArmoryXanax],
}) {
  static readonly layer = this.toLayer(() => Effect.void);
}

/** Refetches the bounty list now. */
export class RefreshBounties extends Command.Service<RefreshBounties>()("torn/RefreshBounties", {
  invalidates: () => [GetBounties],
}) {
  static readonly layer = this.toLayer(() => Effect.void);
}
