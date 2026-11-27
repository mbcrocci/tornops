import type { Html } from "@effect/ui/html";
import { Layers3 } from "lucide";
import type { FactionRankedWar } from "@/lib/faction";
import type { AttackTotals } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/primitives";
import {
  formatPercent,
  formatRespect,
  formatSigned,
  formatWarDate,
  warOpponent,
  warOutcome,
} from "./format";

export type WarComparisonRow = { war: FactionRankedWar; totals: AttackTotals };

const NUMBER_CELL = "px-3 py-2.5 text-right font-mono tabular-nums";

export const WarComparison = <M>(
  h: Html.H<M>,
  rows: ReadonlyArray<WarComparisonRow>,
  ownFactionId: number | undefined,
  timeZone: string,
) =>
  Card(h).children(
    CardHeader(h).children(
      CardTitle(h, { class: "flex items-center gap-2" }).children(
        Icon(h, Layers3, { class: "size-4 text-primary" }),
        " War by war",
      ),
      h.p
        .class("text-xs text-muted-foreground")
        .children("Is the faction getting better? Oldest war first."),
    ),
    CardContent(h, { class: "overflow-x-auto px-0" }).children(
      h.table.class("w-full min-w-[900px] text-sm").children(
        h.thead
          .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
          .children(
            h.tr.children(
              h.th.class("px-4 py-2 font-medium").children("War"),
              h.th.class("px-3 py-2 font-medium").children("Result"),
              ...["Attackers", "Hits", "Wasted", "Respect / hit", "Hits taken"].map((label) =>
                h.th.class("px-3 py-2 text-right font-medium").children(label),
              ),
              h.th.class("px-4 py-2 text-right font-medium").children("Net respect"),
            ),
          ),
        h.tbody.class("divide-y").children(
          [...rows]
            .sort((a, b) => a.war.start - b.war.start)
            .map(({ war, totals }) => {
              const opponent = warOpponent(war, ownFactionId);
              const own = war.factions.find((faction) => faction.id === ownFactionId);
              const outcome = warOutcome(war, ownFactionId);
              return h.tr
                .key(String(war.id))
                .class("hover:bg-muted/25")
                .children(
                  h.td
                    .class("px-4 py-2.5")
                    .children(
                      h.div.class("font-medium").children(opponent?.name ?? `War ${war.id}`),
                      h.div
                        .class("font-mono text-[10px] text-muted-foreground")
                        .children(formatWarDate(war.start, timeZone)),
                    ),
                  h.td
                    .class("px-3 py-2.5")
                    .children(
                      war.target > 0
                        ? h.span
                            .class("flex items-baseline gap-2")
                            .children(
                              h.span
                                .class(
                                  cn(
                                    "text-xs font-semibold uppercase",
                                    outcome === "Victory"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : outcome === "Defeat"
                                        ? "text-destructive"
                                        : outcome === "Ongoing"
                                          ? "text-primary"
                                          : "text-muted-foreground",
                                  ),
                                )
                                .children(outcome),
                              h.span
                                .class("font-mono text-xs tabular-nums text-muted-foreground")
                                .children(`${own?.score ?? 0}:${opponent?.score ?? 0}`),
                            )
                        : h.span.class("text-xs text-muted-foreground").children("Not cached"),
                    ),
                  h.td.class(NUMBER_CELL).children(String(totals.attackers)),
                  h.td.class(NUMBER_CELL).children(String(totals.hits)),
                  h.td
                    .class(NUMBER_CELL)
                    .children(formatPercent(totals.attacks ? totals.failed / totals.attacks : 0)),
                  h.td.class(NUMBER_CELL).children(formatRespect(totals.respectPerHit)),
                  h.td.class(NUMBER_CELL).children(String(totals.hitsTaken)),
                  h.td
                    .class("px-4 py-2.5 text-right font-mono tabular-nums")
                    .children(formatSigned(totals.respect - totals.respectLost)),
                );
            }),
        ),
      ),
    ),
  );
