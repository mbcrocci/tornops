import { Query } from "@effect/ui";
import { Effect, Schema } from "effect";
import { Opaque } from "@/domain/schema";
import type { XanaxUse } from "@/lib/armory";
import type {
  Faction,
  FactionAttack,
  FactionAttackHistory,
  FactionChain,
  FactionChainReport,
} from "@/lib/faction";
import { observeFactionResponse } from "@/lib/faction-presence";
import {
  getChainAttacks,
  getEnemyFactionChain,
  getEnemyFactionData,
  getFactionArmoryXanax,
  getFactionAttackHistory,
  getFactionChainReport,
  getFactionRankedWars,
  getUserData,
  getUserFactionChain,
  type RankedWarsResult,
} from "@/lib/torn-api";
import type { TravelObservation } from "@/lib/travel";
import { observeFactionTravel } from "@/lib/travel-observations";
import type { User } from "@/lib/user";
import { withTimeout } from "@/lib/utils";
import { type PolledQuery, pollRate } from "@/queries/polling";

/** Why a request failed, as the message to show. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const attempt = <A>(run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: errorMessage });

// Faction requests double as presence recording, so a hidden tab still polls them, once a
// minute: presence is saved at most once per minute anyway.
const BACKGROUND_REFETCH_INTERVAL = 60_000;
const poll = (query: PolledQuery) => () =>
  typeof document !== "undefined" && document.hidden
    ? Math.max(pollRate(query), BACKGROUND_REFETCH_INTERVAL)
    : pollRate(query);

// The poll rate stays out of the args, the cache key: see `@/queries/polling`.
const Polled = { key: Schema.String };

export class GetUser extends Query.Service<GetUser>()("torn/GetUser", {
  args: Polled,
  success: Opaque<User>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetUser"),
}) {
  static readonly layer = this.toLayer(({ key }) => attempt(() => withTimeout(getUserData(key))));
}

/** A live read of a faction, with what was learned from it as it arrived. */
export type FactionSnapshot = {
  readonly faction: Faction;
  readonly fetchedAt: number;
  /** Each member's latest travel observation, by player id. */
  readonly travel: Readonly<Record<number, TravelObservation>>;
  /** Why the faction's activity history couldn't be saved, if it couldn't. */
  readonly presenceError: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const snapshotOf = async (data: unknown, expectedId?: number): Promise<FactionSnapshot> => {
  if (!isRecord(data) || isRecord(data.error) || !isRecord(data.members)) {
    const apiError = isRecord(data) && isRecord(data.error) ? data.error.error : undefined;
    throw new Error(
      typeof apiError === "string" ? apiError : "Torn API returned incomplete faction data",
    );
  }
  const faction = data as Faction;
  const fetchedAt = Date.now();
  const presenceError = (await observeFactionResponse(faction, expectedId)) ?? null;
  const travel = await observeFactionTravel(faction.ID, faction.members, fetchedAt);
  return { faction, fetchedAt, travel, presenceError };
};

const fetchOurFaction = async (key: string) => {
  const url = "https://api.torn.com/faction/";
  const params = new URLSearchParams();
  // Ranked wars ride along so the war room scoreboard needs no request of its own.
  params.set("selections", "basic,rankedwars");
  const response = await fetch(`${url}?${params.toString()}`, {
    headers: { Authorization: `ApiKey ${key}` },
  });
  if (!response.ok) throw new Error(`Torn API request failed (${response.status})`);
  return snapshotOf(await response.json());
};

/** Our faction: its members and its ranked wars. */
export class GetOurFaction extends Query.Service<GetOurFaction>()("torn/GetOurFaction", {
  args: Polled,
  success: Opaque<FactionSnapshot>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetOurFaction"),
}) {
  static readonly layer = this.toLayer(({ key }) =>
    attempt(() => withTimeout(fetchOurFaction(key))),
  );
}

export class GetEnemyFaction extends Query.Service<GetEnemyFaction>()("torn/GetEnemyFaction", {
  args: { ...Polled, factionId: Schema.Number },
  success: Opaque<FactionSnapshot>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetEnemyFaction"),
}) {
  static readonly layer = this.toLayer(({ key, factionId }) =>
    attempt(async () => {
      const response = await withTimeout(getEnemyFactionData(factionId, key));
      return snapshotOf(response, factionId);
    }),
  );
}

export class GetOurChain extends Query.Service<GetOurChain>()("torn/GetOurChain", {
  args: Polled,
  success: Opaque<{ chain: FactionChain }>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetOurChain"),
}) {
  static readonly layer = this.toLayer(({ key }) =>
    attempt(() => withTimeout(getUserFactionChain(key))),
  );
}

export class GetEnemyChain extends Query.Service<GetEnemyChain>()("torn/GetEnemyChain", {
  args: { ...Polled, factionId: Schema.Number },
  success: Opaque<{ chain: FactionChain }>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetEnemyChain"),
}) {
  static readonly layer = this.toLayer(({ key, factionId }) =>
    attempt(() => withTimeout(getEnemyFactionChain(factionId, key))),
  );
}

export class GetChainReport extends Query.Service<GetChainReport>()("torn/GetChainReport", {
  args: Polled,
  success: Opaque<FactionChainReport>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetChainReport"),
}) {
  static readonly layer = this.toLayer(({ key }) =>
    attempt(() => withTimeout(getFactionChainReport(key))),
  );
}

export class GetChainAttacks extends Query.Service<GetChainAttacks>()("torn/GetChainAttacks", {
  args: { ...Polled, chainStart: Schema.Number },
  success: Opaque<{ attacks: FactionAttack[]; scope: "faction" | "monitor" }>(),
  error: Schema.String,
  staleTime: 0,
  refetchInterval: poll("torn/GetChainAttacks"),
}) {
  static readonly layer = this.toLayer(({ key, chainStart }) =>
    attempt(() => withTimeout(getChainAttacks(key, chainStart))),
  );
}

export const WarRange = Schema.Struct({
  id: Schema.Number,
  from: Schema.Number,
  to: Schema.Number,
});

/**
 * Attacks of the given wars. Finished wars come from the browser cache unless `refresh` is
 * above zero: a new `refresh` is a new entry, fetched fresh from Torn.
 */
export class GetAttackHistory extends Query.Service<GetAttackHistory>()("torn/GetAttackHistory", {
  args: { key: Schema.String, ranges: Schema.Array(WarRange), refresh: Schema.Number },
  success: Opaque<FactionAttackHistory>(),
  error: Schema.String,
  staleTime: "1 minute",
}) {
  static readonly layer = this.toLayer(({ key, ranges, refresh }) =>
    attempt((signal) => getFactionAttackHistory(key, [...ranges], signal, refresh > 0)),
  );
}

export class GetRankedWars extends Query.Service<GetRankedWars>()("torn/GetRankedWars", {
  args: { key: Schema.String },
  success: Opaque<RankedWarsResult>(),
  error: Schema.String,
  staleTime: "5 minutes",
}) {
  static readonly layer = this.toLayer(({ key }) => attempt(() => getFactionRankedWars(key)));
}

/** Xanax taken from the armory during the wars and the hours before each, by player id. */
export class GetArmoryXanax extends Query.Service<GetArmoryXanax>()("torn/GetArmoryXanax", {
  args: { key: Schema.String, ranges: Schema.Array(WarRange) },
  success: Opaque<Record<number, XanaxUse>>(),
  error: Schema.String,
  staleTime: "1 minute",
}) {
  static readonly layer = this.toLayer(({ key, ranges }) =>
    attempt(async (signal) =>
      Object.fromEntries(await getFactionArmoryXanax(key, [...ranges], signal)),
    ),
  );
}
