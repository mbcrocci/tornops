import type { Html } from "@effect/ui/html";
import { Crosshair } from "lucide";
import type { ResultGroup, WarAnalysis } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/primitives";
import { formatPercent, formatRespect } from "./format";

const GROUP_STYLE: Record<ResultGroup, { fill: string; label: string }> = {
  hit: { fill: "bg-primary", label: "Scored" },
  failed: { fill: "bg-destructive", label: "Wasted" },
  assist: { fill: "bg-muted-foreground/45", label: "Assist or other" },
  other: { fill: "bg-muted-foreground/45", label: "Assist or other" },
};

const Figure = <M>(h: Html.H<M>, label: string, value: string, detail: string) =>
  h.div
    .class("border-l-2 border-primary/60 pl-3")
    .children(
      h.div.class("text-xs text-muted-foreground").children(label),
      h.div.class("mt-1 font-mono text-xl font-semibold").children(value),
      h.div.class("mt-0.5 text-xs text-muted-foreground").children(detail),
    );

export const HitQuality = <M>(h: Html.H<M>, analysis: WarAnalysis) => {
  const { totals, results, targets } = analysis;
  const maxCount = Math.max(1, ...results.map((result) => result.count));
  const topTargets = targets.slice(0, 8);
  const topTargetsShare =
    totals.hits > 0
      ? topTargets.slice(0, 5).reduce((sum, target) => sum + target.hits, 0) / totals.hits
      : 0;

  return Card(h).children(
    CardHeader(h).children(
      CardTitle(h, { class: "flex items-center gap-2" }).children(
        Icon(h, Crosshair, { class: "size-4 text-primary" }),
        " How we hit",
      ),
      h.p
        .class("text-xs text-muted-foreground")
        .children("What each attack ended in, and how much respect it earned"),
    ),
    CardContent(h, { class: "grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" }).children(
      h.div.class("space-y-6").children(
        h.div
          .class("grid gap-5 sm:grid-cols-2")
          .children(
            Figure(
              h,
              "Wasted attacks",
              formatPercent(totals.attacks ? totals.failed / totals.attacks : 0),
              `${totals.failed} lost, stalemated, escaped or timed out`,
            ),
            Figure(
              h,
              "Respect per hit",
              formatRespect(totals.respectPerHit),
              totals.bonusHits
                ? `excludes ${totals.bonusHits} chain bonus ${totals.bonusHits === 1 ? "hit" : "hits"} (${formatRespect(totals.bonusRespect)})`
                : "no chain bonus hits in this selection",
            ),
            Figure(
              h,
              "Fair fight",
              totals.fairFight === null ? "–" : `${totals.fairFight.toFixed(2)}×`,
              totals.fairFight === null
                ? "Torn did not report fair fight for these attacks"
                : "average on successful hits, 3.00× is the best possible",
            ),
            Figure(
              h,
              "Top five carry",
              formatPercent(analysis.topFiveShare),
              "of all respect came from five members",
            ),
          ),
        h.div.children(
          h.div.class("mb-3 flex flex-wrap items-center justify-between gap-2").children(
            h.h3.class("text-sm font-medium").children("Attack results"),
            h.div.class("flex items-center gap-3 text-[10px] text-muted-foreground").children(
              (["hit", "failed", "assist"] as const).map((group) =>
                h.span
                  .key(group)
                  .class("flex items-center gap-1.5")
                  .children(
                    h.span.class(cn("size-2.5 rounded-[2px]", GROUP_STYLE[group].fill)),
                    GROUP_STYLE[group].label,
                  ),
              ),
            ),
          ),
          h.div.class("space-y-1.5").children(
            results.map((result) =>
              h.div
                .key(result.result)
                .class("grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-xs")
                .children(
                  h.span.class("truncate").children(result.result),
                  h.div
                    .class("h-3")
                    .children(
                      h.div
                        .class(cn("h-full rounded-r-[4px]", GROUP_STYLE[result.group].fill))
                        .style({ width: `${(result.count / maxCount) * 100}%` }),
                    ),
                  h.span
                    .class("text-right font-mono tabular-nums")
                    .children(
                      String(result.count),
                      h.span
                        .class("ml-1.5 text-muted-foreground")
                        .children(formatPercent(result.count / Math.max(1, totals.attacks))),
                    ),
                ),
            ),
          ),
        ),
      ),
      h.div.children(
        h.div
          .class("mb-3 flex items-baseline justify-between gap-2")
          .children(
            h.h3.class("text-sm font-medium").children("Most-hit enemies"),
            h.span
              .class("text-xs text-muted-foreground")
              .children(
                `${targets.length} targets · top five took ${formatPercent(topTargetsShare)} of hits`,
              ),
          ),
        topTargets.length === 0
          ? h.p.class("text-sm text-muted-foreground").children("No successful hits.")
          : h.table.class("w-full text-sm").children(
              h.thead
                .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
                .children(
                  h.tr.children(
                    h.th.class("px-3 py-1.5 font-medium").children("Enemy"),
                    h.th.class("px-3 py-1.5 text-right font-medium").children("Hits"),
                    h.th.class("px-3 py-1.5 text-right font-medium").children("Respect"),
                  ),
                ),
              h.tbody.class("divide-y").children(
                topTargets.map((target) =>
                  h.tr.key(String(target.id)).children(
                    h.td.class("px-3 py-1.5").children(
                      h.a
                        .attrs({
                          href: `https://www.torn.com/profiles.php?XID=${target.id}`,
                          target: "_blank",
                          rel: "noreferrer",
                        })
                        .class("hover:text-primary hover:underline")
                        .children(target.name),
                    ),
                    h.td
                      .class("px-3 py-1.5 text-right font-mono tabular-nums")
                      .children(String(target.hits)),
                    h.td
                      .class("px-3 py-1.5 text-right font-mono tabular-nums")
                      .children(formatRespect(target.respect)),
                  ),
                ),
              ),
            ),
      ),
    ),
  );
};
