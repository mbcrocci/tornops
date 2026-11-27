import { Command, Router, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, Coins, RefreshCw, ShieldAlert } from "lucide";
import { PayoutCalculator } from "@/components/payouts/payout-calculator";
import { Icon } from "@/components/ui/icon";
import { Button, ButtonLink, Card, CardContent } from "@/components/ui/primitives";
import { isWarOngoing } from "@/components/war-history/format";
import { WarPicker } from "@/components/war-history/war-picker";
import { Settings } from "@/domain/Settings";
import type { FactionAttack, FactionRankedWar } from "@/lib/faction";
import { memoizeLast } from "@/lib/memo";
import { dataOf, errorOf, isFetching } from "@/lib/result";
import { cn } from "@/lib/utils";
import { RefreshWarReport } from "@/queries/refresh";
import { GetAttackHistory, GetOurFaction, GetRankedWars } from "@/queries/torn";
import { AppRoute } from "@/routes";

const PayoutRoute = AppRoute.cases.WarPayout;

export const WarPayoutPageMessage = UiSchema.TaggedEnum({
  RequestedWarSelection: { warIds: Schema.Array(Schema.Number) },
  ClickedRefresh: {},
});
type WarPayoutPageMessage = typeof WarPayoutPageMessage.Type;
type H = Html.H<WarPayoutPageMessage>;

// No war in the URL picks the most recent one.
const selectedWarsOf = (
  wars: ReadonlyArray<FactionRankedWar>,
  selected: ReadonlyArray<number> | undefined,
) => {
  if (selected === undefined) return wars.slice(0, 1);
  const ids = new Set(selected);
  return wars.filter((war) => ids.has(war.id));
};

const rangesOf = (wars: ReadonlyArray<FactionRankedWar>) =>
  wars.map((war) => ({ id: war.id, from: war.start, to: isWarOngoing(war) ? 0 : war.end + 1 }));

const rankedOnly = memoizeLast((attacks: ReadonlyArray<FactionAttack> | undefined) =>
  (attacks ?? []).filter((attack) => attack.is_ranked_war),
);

const Notice = (h: H, title: string, text: string) =>
  Card(h).children(
    CardContent(h, { class: "py-5" }).children(
      h.p.class("font-medium").children(title),
      h.p.class("mt-1 text-sm text-muted-foreground").children(text),
    ),
  );

/** Splits a war payout between the members, from the ranked-war hits in the chosen wars. */
export const WarPayoutPage = Html.component({
  name: "WarPayoutPage",
  props: Schema.Struct({ settings: Settings, route: PayoutRoute }),
  model: Schema.Struct({ refresh: Schema.Number }),
  message: WarPayoutPageMessage,
  queries: {
    wars: { query: GetRankedWars, args: ({ props }) => ({ key: props.settings.publicKey ?? "" }) },
    faction: {
      query: GetOurFaction,
      args: ({ props, queries }) =>
        dataOf(queries.wars)?.source === "network"
          ? { key: props.settings.publicKey ?? "" }
          : undefined,
    },
    attacks: {
      query: GetAttackHistory,
      args: ({ props, model, queries }) => {
        const ranges = rangesOf(
          selectedWarsOf(dataOf(queries.wars)?.wars ?? [], props.route.search.wars),
        );
        return ranges.length
          ? { key: props.settings.publicKey ?? "", ranges, refresh: model.refresh }
          : undefined;
      },
    },
  },
}).make({
  init: () => ({ refresh: 0 }),
  update: {
    // The selection lives in the URL, so a link or a reload shows the same wars.
    RequestedWarSelection: ($, { warIds }) =>
      $.run(
        Router.patchSearch(AppRoute, $.props.route, { wars: warIds }, { history: "replace" }).pipe(
          Command.asNoop,
        ),
      ),
    ClickedRefresh: ($) =>
      $.evolve({ refresh: (refresh) => refresh + 1 }).run(RefreshWarReport.make()),
  },
  view: (h) => {
    const q = h.queries;
    const warsResult = dataOf(q.wars);
    const wars = warsResult?.wars ?? [];
    const selectedWars = selectedWarsOf(wars, h.props.route.search.wars);
    const attackData = dataOf(q.attacks);
    const outgoing = rankedOnly(attackData?.attacks);
    const warsPending = AsyncResult.isInitial(q.wars);
    const isPending =
      warsPending || Boolean(selectedWars.length && AsyncResult.isInitial(q.attacks));
    const fetching = isFetching(q.wars) || isFetching(q.attacks);
    const error = (!warsResult && errorOf(q.wars)) || (!attackData && errorOf(q.attacks));

    return h.main.class("mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6").children(
      h.section
        .class("mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end")
        .children(
          h.div.children(
            h.div
              .class(
                "mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary",
              )
              .children(Icon(h, Coins, { class: "size-4" }), "Faction intelligence"),
            h.h1
              .class("font-serif text-3xl font-semibold tracking-tight sm:text-4xl")
              .children("War payout"),
            h.p
              .class("mt-2 max-w-2xl text-sm leading-6 text-muted-foreground")
              .children(
                "Share a payout between the members who hit in one or more ranked wars. Only ranked-war hits that earned respect count.",
              ),
          ),
          h.div
            .class("grid gap-2 sm:grid-cols-[minmax(290px,1fr)_auto_auto] sm:items-end")
            .children(
              WarPicker(h, {
                props: {
                  wars,
                  selectedIds: selectedWars.map((war) => war.id),
                  ownFactionId: dataOf(q.faction)?.faction.ID ?? null,
                  timeZone: "local",
                },
                onEmit: {
                  RequestedSelection: ({ warIds }) =>
                    WarPayoutPageMessage.RequestedWarSelection({ warIds }),
                },
              }),
              Button(h, { variant: "outline" })
                .disabled(fetching)
                .on("click", WarPayoutPageMessage.ClickedRefresh())
                .children(Icon(h, RefreshCw, { class: cn(fetching && "animate-spin") }), "Refresh"),
              ButtonLink(h, AppRoute.print(AppRoute.WarReport()), { variant: "outline" }).children(
                Icon(h, ArrowLeft),
                "War report",
              ),
            ),
        ),
      error
        ? Card(h, { class: "border-destructive/50 bg-destructive/5" }).children(
            CardContent(h, { class: "flex gap-3 py-4" }).children(
              Icon(h, ShieldAlert, { class: "mt-0.5 size-5 shrink-0 text-destructive" }),
              h.div.children(
                h.p.class("font-medium").children("War history is unavailable"),
                h.p
                  .class("mt-1 text-sm text-muted-foreground")
                  .children(
                    `${error} The key needs Limited Access and the faction API Access permission.`,
                  ),
              ),
            ),
          )
        : isPending
          ? h.div
              .class("grid min-h-72 place-items-center text-center text-sm text-muted-foreground")
              .children(
                h.div.children(
                  h.div
                    .class("flex items-center justify-center gap-2")
                    .children(
                      Icon(h, RefreshCw, { class: "size-4 animate-spin" }),
                      warsPending
                        ? "Loading ranked wars…"
                        : `Loading every attack from ${selectedWars.length} ${selectedWars.length === 1 ? "war" : "wars"}…`,
                    ),
                  !warsPending &&
                    h.p
                      .class("mt-2 text-xs")
                      .children(
                        "If Torn applies its request limit, loading pauses for 65 seconds before retrying.",
                      ),
                ),
              )
          : wars.length === 0
            ? Notice(
                h,
                "No ranked wars found",
                "Torn did not return any ranked wars for this faction.",
              )
            : selectedWars.length === 0
              ? Notice(
                  h,
                  "Choose at least one war",
                  "Open the war selector and pick the wars to pay out.",
                )
              : PayoutCalculator(h, {
                  props: {
                    attacks: outgoing,
                    title: "War payout",
                    hitLabel: "War hits",
                    hitDescription:
                      "War hits are ranked-war attacks in the selected wars that earned respect.",
                  },
                }),
    );
  },
});
