import { Subscription, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema, Stream } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
  Crosshair,
  ExternalLink,
  HeartPulse,
  Radio,
  ShieldCheck,
  Swords,
  TriangleAlert,
} from "lucide";
import { Icon } from "@/components/ui/icon";
import {
  ButtonLink,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { chainRemaining } from "@/components/war-room/panels";
import { membersOf } from "@/components/war-room/roster";
import { type ObservedChainActivity, Settings } from "@/domain/Settings";
import {
  CHAIN_WATCHER_REFETCH_INTERVAL,
  type ChainUrgency,
  formatAttackTime,
  formatDuration,
  getChainUrgency,
  isStoredAttackActivityValid,
  prioritizeTargets,
} from "@/lib/chain";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { dataOf, errorOf, updatedAt } from "@/lib/result";
import { cn } from "@/lib/utils";
import { GetFFScouterStats, playerIds, statsById } from "@/queries/ffscouter";
import {
  GetChainAttacks,
  GetChainReport,
  GetEnemyFaction,
  GetOurChain,
  GetOurFaction,
  GetUser,
} from "@/queries/torn";
import { pollAt } from "@/queries/polling";
import { AppRoute } from "@/routes";

const ACTIVITY_STYLES = {
  Online: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  Idle: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  Offline: { dot: "bg-slate-400", text: "text-muted-foreground" },
} as const;

const URGENCY_STYLES: Record<
  ChainUrgency,
  { card: string; bar: string; text: string; label: string }
> = {
  normal: {
    card: "border-primary/25",
    bar: "bg-primary",
    text: "text-primary",
    label: "Live chain",
  },
  warning: {
    card: "border-amber-500/70 bg-amber-500/[0.07] shadow-sm shadow-amber-500/10",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    label: "Chain warning",
  },
  danger: {
    card: "border-red-500/80 bg-red-500/[0.09] shadow-sm shadow-red-500/15",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    label: "Chain danger",
  },
  critical: {
    card: "chain-critical-flash border-red-500",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    label: "Critical — hit now",
  },
};

export const ChainWatcherPageMessage = UiSchema.TaggedEnum({
  Ticked: { now: Schema.Number },
  ChangedChainReport: {},
  ChangedOurChain: {},
});
type ChainWatcherPageMessage = typeof ChainWatcherPageMessage.Type;

export const ChainWatcherPageEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const PreviousReport = Schema.Struct({
  chainId: Schema.Number,
  totals: Schema.Record(Schema.String, Schema.Number),
});

const polled = (settings: Settings) => ({ key: settings.publicKey ?? "" });

const ChainWatcherPageDef = Html.component({
  name: "ChainWatcherPage",
  props: Schema.Struct({ settings: Settings }),
  model: Schema.Struct({
    now: Schema.Number,
    /** Each attacker's hits in the last chain report, to find who hit since. */
    previousReport: Schema.NullOr(PreviousReport),
  }),
  message: ChainWatcherPageMessage,
  events: ChainWatcherPageEvents,
  queries: {
    chain: {
      query: GetOurChain,
      args: ({ props }) => polled(props.settings),
      onChange: () => ChainWatcherPageMessage.ChangedOurChain(),
    },
    user: { query: GetUser, args: ({ props }) => polled(props.settings) },
    ourFaction: {
      query: GetOurFaction,
      args: ({ props }) => ({
        key: props.settings.publicKey ?? "",
      }),
    },
    enemyFaction: {
      query: GetEnemyFaction,
      args: ({ props }) =>
        props.settings.enemyFactionId
          ? { ...polled(props.settings), factionId: props.settings.enemyFactionId }
          : undefined,
    },
    enemyStats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) => {
        const ids = playerIds(
          Object.keys(dataOf(queries.enemyFaction)?.faction.members ?? {}).map(Number),
        );
        return props.settings.ffscouterKey && ids.length
          ? { key: props.settings.ffscouterKey, ids }
          : undefined;
      },
    },
    attacks: {
      query: GetChainAttacks,
      args: ({ props, queries }) => {
        const chain = dataOf(queries.chain)?.chain;
        return chain?.current && chain.start
          ? { ...polled(props.settings), chainStart: chain.start }
          : undefined;
      },
    },
    chainReport: {
      query: GetChainReport,
      // Keys without faction attack access watch the chain report for new hitters instead.
      args: ({ props, queries }) => {
        const chain = dataOf(queries.chain)?.chain;
        const active = Boolean(chain?.current && chain.start);
        return active && dataOf(queries.attacks)?.scope === "monitor"
          ? polled(props.settings)
          : undefined;
      },
      onChange: () => ChainWatcherPageMessage.ChangedChainReport(),
    },
  },
});

const change = (settings: Settings) => ChainWatcherPageEvents.RequestedSettingsChange({ settings });

const SectionHeader = (
  h: Html.H<ChainWatcherPageMessage>,
  icon: typeof Swords,
  eyebrow: string,
  title: string,
  aside: string | null,
) =>
  CardHeader(h, { class: "border-b pb-3" }).children(
    h.div
      .class("flex flex-wrap items-end justify-between gap-2")
      .children(
        h.div.children(
          h.div
            .class(
              "mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary",
            )
            .children(Icon(h, icon, { class: "size-3.5" }), eyebrow),
          CardTitle(h, { class: "text-xl" }).children(title),
        ),
        aside && h.p.class("text-xs text-muted-foreground").children(aside),
      ),
  );

const EmptyNote = (h: Html.H<ChainWatcherPageMessage>, text: string) =>
  h.p.class("px-5 py-8 text-center text-sm text-muted-foreground").children(text);

const ChainRow = (h: Html.H<ChainWatcherPageMessage>, key: string, chainNumber: number | null) =>
  h.li
    .key(key)
    .class(
      "grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:px-5",
    )
    .children(
      h.div.children(
        h.div
          .class("font-mono text-sm font-bold tabular-nums text-primary")
          .children(`#${chainNumber?.toLocaleString() ?? ""}`),
        h.div.class("text-[10px] uppercase tracking-wider text-muted-foreground").children("Chain"),
      ),
    );

const PlayerLink = (h: Html.H<ChainWatcherPageMessage>, id: number, name: string) =>
  h.a
    .attrs({ href: playerProfileLink(id), target: "_blank", rel: "noreferrer" })
    .class("truncate font-semibold hover:text-primary")
    .children(name);

export const ChainWatcherPage = ChainWatcherPageDef.make({
  init: () => ({ now: Math.floor(Date.now() / 1000), previousReport: null }),
  update: {
    Ticked: ($, { now }) => $.evolve({ now }),
    // Stored activity from an earlier chain no longer applies once a new chain is counted.
    ChangedOurChain: ($) => {
      const chain = dataOf($.queries.chain)?.chain;
      const { settings } = $.props;
      return chain && !isStoredAttackActivityValid(settings.chainAttackActivity, chain.current)
        ? $.emit(change({ ...settings, chainAttackActivity: [] }))
        : $.model;
    },
    ChangedChainReport: ($) => {
      const reportResult = $.queries.chainReport;
      const chain = dataOf($.queries.chain)?.chain;
      if (!AsyncResult.isSuccess(reportResult) || !chain) return $.model;
      const report = reportResult.value;
      if (chain.current !== report.details.chain) return $.model;

      const totals = Object.fromEntries(
        report.attackers.map((attacker) => [String(attacker.id), attacker.attacks.total]),
      );
      const previous = $.model.previousReport;
      const next = $.evolve({ previousReport: { chainId: report.id, totals } });
      const { settings } = $.props;
      if (!previous) return next;
      if (previous.chainId !== report.id)
        return next.emit(change({ ...settings, chainAttackActivity: [] }));

      // A Torn chain expires five minutes after its latest hit, so `end - 300` is the
      // timestamp of the attack rather than the time we observed the report.
      const attackAt = chain.end - 300;
      const changes: ObservedChainActivity[] = report.attackers.flatMap((attacker) => {
        const hits = attacker.attacks.total - (previous.totals[String(attacker.id)] ?? 0);
        return hits > 0
          ? [
              {
                id: `${reportResult.timestamp}-${attacker.id}`,
                attackerId: attacker.id,
                hits,
                chainNumber: report.details.chain,
                attackAt,
              },
            ]
          : [];
      });
      return changes.length
        ? next.emit(
            change({
              ...settings,
              chainAttackActivity: [...changes, ...settings.chainAttackActivity].slice(0, 10),
            }),
          )
        : next;
    },
  },
  subscriptions: ({ props }) => [
    Subscription.make(
      "clock",
      Stream.tick("1 second").pipe(
        Stream.map(() => ChainWatcherPageMessage.Ticked({ now: Math.floor(Date.now() / 1000) })),
      ),
    ),
    // The chain moves fast: poll it, and what the queue and feed read, faster while watched.
    // The header keeps the user polled, so fetch it now rather than at its next slower poll.
    pollAt("chainWatcherPolling", CHAIN_WATCHER_REFETCH_INTERVAL, {
      queries: [
        "torn/GetOurChain",
        "torn/GetUser",
        "torn/GetEnemyFaction",
        "torn/GetChainAttacks",
        "torn/GetChainReport",
      ],
      refresh: GetUser.prefetch(polled(props.settings)),
    }),
  ],
  view: (h, model) => {
    const { now } = model;
    const { settings } = h.props;
    const chainResult = h.queries.chain;
    const chain = dataOf(chainResult)?.chain;
    const remaining = Math.max(0, chainRemaining(chain, updatedAt(chainResult), now));
    const user = dataOf(h.queries.user);
    const enemy = dataOf(h.queries.enemyFaction);
    const ours = dataOf(h.queries.ourFaction);

    // ---- Chain status ----
    const urgency = getChainUrgency(remaining);
    const styles = URGENCY_STYLES[urgency];
    const progress = chain?.max ? (chain.current / chain.max) * 100 : 0;
    const energy = user?.energy?.current;
    const maximumEnergy = user?.energy?.maximum;
    const hitsLeft = energy === undefined ? undefined : Math.floor(energy / 25);
    const statusCard = Card(h, { class: cn("p-0 transition-colors duration-300", styles.card) })
      .attr("data-chain-urgency", urgency)
      .children(
        h.div
          .class("mx-4 mt-3 h-1 overflow-hidden rounded-full bg-muted")
          .children(
            h.div
              .class(
                cn(
                  "h-full rounded-full transition-[width,background-color] duration-500",
                  styles.bar,
                ),
              )
              .style({ width: `${Math.min(progress, 100)}%` }),
          ),
        CardContent(h, {
          class: "grid gap-5 p-5 pt-2 md:grid-cols-[1fr_auto] md:items-end",
        }).children(
          h.div.children(
            h.div
              .class(
                cn(
                  "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
                  styles.text,
                ),
              )
              .children(
                Icon(h, urgency === "normal" ? Radio : TriangleAlert, { class: "size-3.5" }),
                styles.label,
              ),
            AsyncResult.isInitial(chainResult)
              ? h.p.class("text-muted-foreground").children("Loading chain…")
              : !chain
                ? h.p.class("text-destructive").children("Chain data is unavailable.")
                : h.div
                    .class("flex flex-wrap items-baseline gap-x-4 gap-y-1")
                    .children(
                      h.span
                        .class(
                          cn(
                            "font-mono text-4xl font-bold tabular-nums transition-colors sm:text-5xl",
                            urgency !== "normal" && styles.text,
                          ),
                        )
                        .children(formatDuration(remaining)),
                      h.span
                        .class("text-sm text-muted-foreground")
                        .children("until the chain expires"),
                    ),
          ),
          chain &&
            h.div
              .class("grid grid-cols-2 gap-x-8 gap-y-1 border-l-2 border-primary/25 pl-4 text-sm")
              .children(
                h.span.class("text-muted-foreground").children("Hits"),
                h.strong
                  .class("text-right tabular-nums")
                  .children(`${chain.current.toLocaleString()} / ${chain.max.toLocaleString()}`),
                h.span.class("text-muted-foreground").children("Modifier"),
                h.strong.class("text-right tabular-nums").children(`${chain.modifier}x`),
                h.span.class("text-muted-foreground").children("Energy"),
                h.strong
                  .class("text-right tabular-nums")
                  .children(
                    energy === undefined
                      ? "—"
                      : `${energy.toLocaleString()} / ${maximumEnergy?.toLocaleString() ?? "—"}`,
                  ),
                h.span.class("text-muted-foreground").children("Hits left"),
                h.strong
                  .class("text-right tabular-nums")
                  .children(
                    hitsLeft === undefined ? "—" : String(hitsLeft),
                    hitsLeft !== undefined &&
                      h.span.class("ml-1 font-normal text-muted-foreground").children("× 25E"),
                  ),
              ),
        ),
      );

    // ---- Target queue ----
    const enemyMembers = membersOf(enemy?.faction.members, statsById(dataOf(h.queries.enemyStats)));
    const targets = prioritizeTargets(enemyMembers, remaining, now);
    const targetQueue = Card(h).children(
      SectionHeader(
        h,
        Crosshair,
        "Target queue",
        "Next targets",
        enemy ? `${enemy.faction.tag} · ${enemy.faction.name}` : null,
      ),
      CardContent(h, { class: "px-0" }).children(
        targets.length === 0
          ? h.div
              .class("px-5 py-10 text-center")
              .children(
                Icon(h, ShieldCheck, { class: "mx-auto mb-3 size-7 text-muted-foreground" }),
                h.p.class("font-medium").children("No viable targets right now"),
                h.p
                  .class("mt-1 text-sm text-muted-foreground")
                  .children(
                    "Alive enemies and hospital releases with a one-minute safety margin will appear here.",
                  ),
              )
          : h.ol.class("divide-y").children(
              targets.map((target, index) => {
                const activity = ACTIVITY_STYLES[target.last_action.status];
                return h.li
                  .key(String(target.id))
                  .class(
                    "grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:grid-cols-[2.75rem_1fr_auto_auto] sm:px-5",
                  )
                  .children(
                    h.span
                      .class("font-mono text-lg font-bold text-muted-foreground/60")
                      .children(String(index + 1).padStart(2, "0")),
                    h.div.class("min-w-0").children(
                      h.a
                        .attrs({
                          href: playerProfileLink(target.id),
                          target: "_blank",
                          rel: "noreferrer",
                        })
                        .class("block truncate font-semibold hover:text-primary")
                        .children(target.name),
                      h.div
                        .class(
                          "mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
                        )
                        .children(
                          h.span
                            .class(cn("inline-flex items-center gap-1 font-medium", activity.text))
                            .children(
                              h.span
                                .class(cn("size-2 rounded-full", activity.dot))
                                .attr("aria-hidden", "true"),
                              target.last_action.status,
                            ),
                          h.span
                            .class(
                              target.availability === "alive"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400",
                            )
                            .children(
                              ...(target.availability === "alive"
                                ? [Icon(h, HeartPulse, { class: "mr-1 inline size-3" }), "Alive"]
                                : [`Out in ${formatDuration(target.availableIn)}`]),
                            ),
                          h.span.children(`Lv. ${target.level}`),
                        ),
                    ),
                    h.div
                      .class("hidden text-right sm:block")
                      .children(
                        h.div
                          .class("font-mono font-bold tabular-nums")
                          .children(target.ffs?.fair_fight?.toFixed(2) ?? "—"),
                        h.div
                          .class("text-[10px] uppercase tracking-wider text-muted-foreground")
                          .children("FF"),
                      ),
                    h.a
                      .attrs({
                        href: playerAttackLink(target.id),
                        target: "_blank",
                        rel: "noreferrer",
                        "aria-label": `Attack ${target.name}`,
                      })
                      .class(buttonClass({ size: "sm" }))
                      .children("Attack ", Icon(h, ExternalLink, { class: "size-3.5" })),
                  );
              }),
            ),
      ),
    );

    // ---- Attack feed ----
    const hasActiveChain = Boolean(chain?.current && chain.start);
    const attacksResult = h.queries.attacks;
    const attackData = dataOf(attacksResult);
    const isMonitoring = attackData?.scope === "monitor";
    const activity = settings.chainAttackActivity;
    const feedNow = Math.floor(now / 10) * 10;
    const loading =
      AsyncResult.isInitial(chainResult) ||
      (hasActiveChain && AsyncResult.isInitial(attacksResult)) ||
      (isMonitoring && AsyncResult.isInitial(h.queries.chainReport));
    const attackError = errorOf(attacksResult);
    const feed = loading
      ? EmptyNote(h, "Loading attacks…")
      : !hasActiveChain
        ? EmptyNote(h, "Chain attacks will appear here when a chain is active.")
        : attackError && !attackData
          ? h.div
              .class("px-5 py-8 text-center")
              .children(
                h.p.class("font-medium text-destructive").children("Attack data is unavailable."),
                h.p.class("mt-1 text-sm text-muted-foreground").children(attackError),
              )
          : isMonitoring && activity.length === 0
            ? h.div
                .class("px-5 py-8 text-center")
                .children(
                  h.p.class("font-medium").children("Watching for the next faction hit"),
                  h.p
                    .class("mt-1 text-sm text-muted-foreground")
                    .children(
                      "Member-level access can detect new hitters, but not their targets or past order.",
                    ),
                )
            : isMonitoring
              ? h.ol.class("divide-y").children(
                  activity.map((event) => {
                    const member = ours?.faction.members[String(event.attackerId)];
                    return ChainRow(h, event.id, event.chainNumber).children(
                      h.div
                        .class("min-w-0")
                        .children(
                          PlayerLink(
                            h,
                            event.attackerId,
                            member?.name ?? `Player ${event.attackerId}`,
                          ),
                          h.p
                            .class("mt-1 text-xs text-muted-foreground")
                            .children(
                              `Added ${event.hits === 1 ? "a hit" : `${event.hits} hits`} to the chain`,
                            ),
                        ),
                      h.time
                        .class("whitespace-nowrap text-xs tabular-nums text-muted-foreground")
                        .children(formatAttackTime(event.attackAt, feedNow)),
                    );
                  }),
                )
              : !attackData?.attacks.length
                ? EmptyNote(h, "No chain-building attacks have been recorded yet.")
                : h.ol.class("divide-y").children(
                    attackData.attacks.map((attack) =>
                      ChainRow(h, String(attack.id), attack.chain).children(
                        h.div
                          .class("min-w-0")
                          .children(
                            h.div
                              .class("flex min-w-0 items-center gap-1.5 text-sm")
                              .children(
                                attack.attacker
                                  ? PlayerLink(h, attack.attacker.id, attack.attacker.name)
                                  : h.span
                                      .class("truncate font-semibold")
                                      .children("Stealthed attacker"),
                                h.span
                                  .class("shrink-0 text-muted-foreground")
                                  .attr("aria-hidden", "true")
                                  .children("→"),
                                PlayerLink(h, attack.defender.id, attack.defender.name),
                              ),
                            h.div
                              .class("mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground")
                              .children(
                                h.span.children(attack.result),
                                h.span
                                  .class("text-emerald-600 dark:text-emerald-400")
                                  .children(`+${attack.respect_gain.toFixed(2)} respect`),
                              ),
                          ),
                        h.time
                          .attrs({
                            datetime: new Date(attack.ended * 1000).toISOString(),
                            title: new Date(attack.ended * 1000).toLocaleString(),
                          })
                          .class("whitespace-nowrap text-xs tabular-nums text-muted-foreground")
                          .children(formatAttackTime(attack.ended, feedNow)),
                      ),
                    ),
                  );

    const attackFeed = Card(h).children(
      SectionHeader(
        h,
        Swords,
        "Attack feed",
        "Latest chain attacks",
        isMonitoring
          ? "Live faction activity · detected every 5 seconds"
          : "Last 10 faction chain-building hits",
      ),
      CardContent(h, { class: "px-0" }).children(feed),
    );

    return h.main.class("container mx-auto max-w-4xl p-3 sm:p-6").children(
      h.div.class("mb-5 flex items-center justify-between gap-3 pr-11 sm:pr-0").children(
        h.div.children(
          h.p
            .class("text-xs font-semibold uppercase tracking-[0.2em] text-primary")
            .children("Operations"),
          h.h1.class("text-2xl font-bold tracking-tight sm:text-3xl").children("Chain watcher"),
        ),
        ButtonLink(h, AppRoute.print(AppRoute.WarRoom()), {
          variant: "outline",
          size: "sm",
        }).children("Back to dashboard"),
      ),
      h.div.class("space-y-3").children(statusCard, targetQueue, attackFeed),
    );
  },
});
