import { Mount, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ChevronRight, Link2 } from "lucide";
import { Opaque } from "@/domain/schema";
import type { FactionAttack } from "@/lib/faction";
import { type ChainSummary, summarizeChains } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { TrackPointer } from "../ui/pointer";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../ui/primitives";
import { Segmented } from "./charts";
import { formatDateTime, formatDuration, formatRespect } from "./format";

const Side = Schema.Literals(["ours", "theirs"]);
type Side = typeof Side.Type;

// Gaps past four minutes left less than a minute on the chain timer.
const CLOSE_CALL_SECONDS = 4 * 60;
const CHAIN_TIMEOUT = 5 * 60;
// Chains that never reached the first bonus are listed only on request.
const SHORT_CHAIN = 10;

// Time left on the chain timer when the hit landed.
const CLOSE_CALLS = [
  { key: "under60", label: "Under 1 min left" },
  { key: "under45", label: "Under 45s left" },
  { key: "under30", label: "Under 30s left" },
] as const;

const ChainsMessage = UiSchema.TaggedEnum({
  PickedChainSide: { side: Side },
  ClickedShortChains: {},
  ClickedChain: { started: Schema.Number },
  MovedChainPointer: { fraction: Schema.NullOr(Schema.Number) },
});
type ChainsMessage = typeof ChainsMessage.Type;
type H = Html.H<ChainsMessage>;

function gapColor(gap: number | null) {
  if (gap === null) return "stroke-muted-foreground/40";
  // Past the timeout, hits on other targets kept the chain going.
  if (gap >= CHAIN_TIMEOUT) return "stroke-muted-foreground/20";
  const left = CHAIN_TIMEOUT - gap;
  if (left < 30) return "stroke-destructive";
  if (left < 45) return "stroke-destructive/65";
  if (left < 60) return "stroke-destructive/35";
  return "stroke-primary/60";
}

const nearestHit = (chain: ChainSummary, fraction: number) => {
  const duration = Math.max(chain.ended - chain.started, 1);
  const pointer = chain.started + fraction * duration;
  let nearest = 0;
  chain.hits.forEach((hit, index) => {
    if (Math.abs(hit.ended - pointer) < Math.abs(chain.hits[nearest].ended - pointer))
      nearest = index;
  });
  return nearest;
};

const Legend = (h: H, swatch: string, label: string, line = false) =>
  h.span
    .class("flex items-center gap-1.5")
    .children(
      h.span
        .class(line ? cn("h-0.5 w-3", swatch) : cn("size-2.5 rounded-[2px]", swatch))
        .attr("aria-hidden", "true"),
      ` ${label}`,
    );

const ChainDetail = (h: H, chain: ChainSummary, timeZone: string, active: number | null) => {
  const timed = chain.warHits - 1;
  const duration = Math.max(chain.ended - chain.started, 1);
  const x = (ended: number) => ((ended - chain.started) / duration) * 1000;
  // Chain count across the top panel, time between hits in the bottom one.
  const countY = (count: number) => 100 - (count / chain.length) * 100;
  const gapY = (gap: number) => 100 - (Math.min(gap, CHAIN_TIMEOUT) / CHAIN_TIMEOUT) * 100;
  const hovered = active === null ? null : chain.hits[active];

  return h.div.class("space-y-4").children(
    h.div.class("grid grid-cols-2 gap-2 sm:grid-cols-4").children(
      CLOSE_CALLS.map((closeCall) =>
        h.div
          .key(closeCall.key)
          .class("rounded-md border bg-card px-3 py-2")
          .children(
            h.div.class("text-xs text-muted-foreground").children(closeCall.label),
            h.div
              .class(
                cn(
                  "font-mono text-lg font-medium tabular-nums",
                  chain.closeCalls[closeCall.key] > 0 && "text-destructive",
                ),
              )
              .children(chain.closeCalls[closeCall.key].toLocaleString()),
          ),
      ),
      h.div
        .class("rounded-md border bg-card px-3 py-2")
        .children(
          h.div.class("text-xs text-muted-foreground").children("Average pace"),
          h.div
            .class("font-mono text-lg font-medium tabular-nums")
            .children(timed > 0 ? formatDuration((chain.ended - chain.started) / timed) : "–"),
        ),
    ),
    h.p
      .class("text-xs text-muted-foreground")
      .children(
        `Hits that landed with little time left on the 5 minute chain timer, counted from the previous war hit across ${timed.toLocaleString()} ${timed === 1 ? "gap" : "gaps"}. Hits on other targets aren't loaded, so some of these may have been safer than they look.`,
      ),
    chain.hits.length > 1 &&
      h.div.children(
        h.div
          .class("mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground")
          .children(
            Legend(h, "bg-primary", "Chain count", true),
            Legend(h, "bg-primary/60", "1 min+ left"),
            Legend(h, "bg-destructive/35", "Under 1 min"),
            Legend(h, "bg-destructive/65", "Under 45s"),
            Legend(h, "bg-destructive", "Under 30s"),
            Legend(h, "bg-muted-foreground/20", "Over 5 min, kept going by other hits"),
          ),
        h.div.class("grid grid-cols-[3.25rem_1fr] gap-2").children(
          h.div
            .class(
              "flex h-56 flex-col text-right font-mono text-[10px] tabular-nums text-muted-foreground",
            )
            .children(
              h.div
                .class("flex h-32 flex-col justify-between")
                .children(h.span(chain.length.toLocaleString()), h.span("0")),
              h.div
                .class("mt-4 flex h-20 flex-col justify-between")
                .children(h.span("5m+"), h.span("0")),
            ),
          h.div
            .class("relative h-56 touch-none")
            .onMount(
              TrackPointer().pipe(
                Mount.map(({ fraction }) => ChainsMessage.MovedChainPointer({ fraction })),
              ),
            )
            .children(
              h.div.class("pointer-events-none absolute inset-x-0 top-0 h-32 border-b"),
              h.svg
                .attrs({
                  viewBox: "0 0 1000 100",
                  preserveAspectRatio: "none",
                  role: "img",
                  "aria-label": `Chain count over ${formatDuration(duration)}, reaching ${chain.length}`,
                })
                .class("absolute inset-x-0 top-0 h-32 w-full overflow-visible")
                .children(
                  h.polyline
                    .attrs({
                      points: chain.hits
                        .map((hit) => `${x(hit.ended)},${countY(hit.chain)}`)
                        .join(" "),
                      fill: "none",
                      "stroke-width": "2",
                      "stroke-linejoin": "round",
                      "vector-effect": "non-scaling-stroke",
                    })
                    .class("stroke-primary"),
                ),
              chain.hits
                .filter((hit) => hit.bonus)
                .map((hit) =>
                  h.span
                    .key(String(hit.chain))
                    .class(
                      "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card",
                    )
                    .style({
                      left: `${x(hit.ended) / 10}%`,
                      top: `${(countY(hit.chain) / 100) * 8}rem`,
                    }),
                ),
              h.div.class("pointer-events-none absolute inset-x-0 bottom-0 h-20 border-b"),
              h.div
                .class(
                  "pointer-events-none absolute inset-x-0 border-t border-dashed border-destructive/40",
                )
                .style({ bottom: `${(CLOSE_CALL_SECONDS / CHAIN_TIMEOUT) * 5}rem` }),
              h.div
                .class(
                  "pointer-events-none absolute inset-x-0 border-t border-dashed border-border",
                )
                .style({ bottom: `${(60 / CHAIN_TIMEOUT) * 5}rem` }),
              h.svg
                .attrs({
                  viewBox: "0 0 1000 100",
                  preserveAspectRatio: "none",
                  role: "img",
                  "aria-label": `Time between war hits: ${chain.closeCalls.under60} landed with under a minute left`,
                })
                .class("absolute inset-x-0 bottom-0 h-20 w-full overflow-visible")
                .children(
                  chain.hits.map((hit) =>
                    hit.gap === null
                      ? null
                      : h.line
                          .key(`${hit.ended}-${hit.chain}`)
                          .attrs({
                            x1: String(x(hit.ended)),
                            x2: String(x(hit.ended)),
                            y1: "100",
                            y2: String(Math.min(gapY(hit.gap), 98)),
                            "stroke-width": "2",
                            "vector-effect": "non-scaling-stroke",
                          })
                          .class(gapColor(hit.gap)),
                  ),
                ),
              hovered &&
                h.div.class("contents").children(
                  h.div
                    .class("pointer-events-none absolute inset-y-0 border-l border-foreground/30")
                    .style({ left: `${x(hovered.ended) / 10}%` }),
                  h.div
                    .class(
                      cn(
                        "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                        x(hovered.ended) > 500 ? "-translate-x-full -ml-2" : "ml-2",
                      ),
                    )
                    .style({ left: `${x(hovered.ended) / 10}%` })
                    .children(
                      h.div
                        .class("font-mono font-medium")
                        .children(formatDateTime(hovered.ended, timeZone)),
                      h.div
                        .class("mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums")
                        .children(
                          h.span.class("text-muted-foreground").children("Hit"),
                          h.span
                            .class("text-right")
                            .children(
                              `${hovered.chain.toLocaleString()}${hovered.bonus ? " bonus" : ""}`,
                            ),
                          h.span.class("text-muted-foreground").children("By"),
                          h.span.class("text-right font-sans").children(hovered.name),
                          h.span.class("text-muted-foreground").children("Gap"),
                          h.span
                            .class("text-right")
                            .children(hovered.gap === null ? "First" : formatDuration(hovered.gap)),
                          ...(hovered.gap !== null && hovered.gap < CHAIN_TIMEOUT
                            ? [
                                h.span.class("text-muted-foreground").children("Timer left"),
                                h.span
                                  .class("text-right")
                                  .children(formatDuration(CHAIN_TIMEOUT - hovered.gap)),
                              ]
                            : []),
                          h.span.class("text-muted-foreground").children("Respect"),
                          h.span.class("text-right").children(formatRespect(hovered.respect)),
                        ),
                    ),
                ),
            ),
          h.span,
          h.div
            .class("flex justify-between font-mono text-[10px] text-muted-foreground")
            .children(h.span("0"), h.span(formatDuration(duration))),
        ),
      ),
  );
};

const NUM = "px-3 py-2 text-right font-mono tabular-nums";

/** Every chain either side ran during the selected wars, with its close calls. */
export const Chains = Html.component({
  name: "Chains",
  props: Schema.Struct({
    outgoing: Opaque<ReadonlyArray<FactionAttack>>(),
    incoming: Opaque<ReadonlyArray<FactionAttack>>(),
    timeZone: Schema.String,
  }),
  model: Schema.Struct({
    side: Side,
    showShort: Schema.Boolean,
    open: Schema.NullOr(Schema.Number),
    active: Schema.NullOr(Schema.Number),
  }),
  message: ChainsMessage,
  restore: (model) => ({ ...model, active: null }),
}).make({
  init: () => ({ side: "ours" as Side, showShort: false, open: null, active: null }),
  update: {
    PickedChainSide: ($, { side }) =>
      $.evolve({ side, showShort: false, open: null, active: null }),
    ClickedShortChains: ($) => $.evolve({ showShort: (shown) => !shown }),
    ClickedChain: ($, { started }) =>
      $.evolve({ open: $.model.open === started ? null : started, active: null }),
    MovedChainPointer: ($, { fraction }) => {
      const attacks = $.model.side === "ours" ? $.props.outgoing : $.props.incoming;
      const chain = summarizeChains([...attacks]).find(
        (summary) => summary.started === $.model.open,
      );
      return $.evolve({ active: fraction === null || !chain ? null : nearestHit(chain, fraction) });
    },
  },
  view: (h, model) => {
    const { timeZone } = h.props;
    const chains = summarizeChains([
      ...(model.side === "ours" ? h.props.outgoing : h.props.incoming),
    ]);
    const longest = Math.max(0, ...chains.map((chain) => chain.length));
    const shortChains = chains.filter((chain) => chain.length < SHORT_CHAIN).length;
    const rows = model.showShort ? chains : chains.filter((chain) => chain.length >= SHORT_CHAIN);

    return Card(h).children(
      CardHeader(h).children(
        h.div.class("flex flex-col justify-between gap-3 sm:flex-row sm:items-end").children(
          h.div.children(
            CardTitle(h, { class: "flex items-center gap-2" }).children(
              Icon(h, Link2, { class: "size-4 text-primary" }),
              " Chains",
            ),
            h.p
              .class("mt-1 text-xs text-muted-foreground")
              .children(
                `${chains.length} ${chains.length === 1 ? "chain" : "chains"}${
                  chains.length > 0 ? `, longest ${longest.toLocaleString()} hits` : ""
                }. Only war hits are loaded, so gaps may hide hits on other targets.`,
              ),
          ),
          Segmented(h, {
            label: "Whose chains",
            value: model.side,
            items: [
              { value: "ours", label: "Ours" },
              { value: "theirs", label: "Theirs" },
            ],
            onPick: (side) => ChainsMessage.PickedChainSide({ side }),
          }),
        ),
      ),
      CardContent(h, { class: "overflow-x-auto px-0" }).children(
        rows.length === 0
          ? h.p
              .class("px-4 py-8 text-center text-sm text-muted-foreground")
              .children(
                chains.length === 0
                  ? "No chain hits in the war."
                  : `No chain reached ${SHORT_CHAIN} hits.`,
              )
          : h.table.class("w-full min-w-[860px] text-sm").children(
              h.thead
                .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
                .children(
                  h.tr.children(
                    h.th.class("px-4 py-2 font-medium").children("Started"),
                    ...["Length", "Duration", "War hits", "Respect", "Longest gap"].map((label) =>
                      h.th.class("px-3 py-2 text-right font-medium").children(label),
                    ),
                    h.th.class("px-3 py-2 font-medium").children("Bonus hits"),
                    h.th.class("px-4 py-2 font-medium").children("Top hitters"),
                  ),
                ),
              h.tbody.class("divide-y").children(
                rows.flatMap((chain) => {
                  const isOpen = model.open === chain.started;
                  return [
                    h.tr
                      .key(String(chain.started))
                      .class(cn("cursor-pointer hover:bg-muted/25", isOpen && "bg-muted/25"))
                      .on("click", ChainsMessage.ClickedChain({ started: chain.started }))
                      .children(
                        h.td.class("whitespace-nowrap px-4 py-2 font-mono text-xs").children(
                          h.button
                            .attrs({ type: "button", "aria-expanded": isOpen ? "true" : "false" })
                            .class("flex cursor-pointer items-center gap-1.5")
                            .children(
                              Icon(h, ChevronRight, {
                                class: cn(
                                  "size-3.5 text-muted-foreground transition-transform",
                                  isOpen && "rotate-90",
                                ),
                              }),
                              formatDateTime(chain.started, timeZone),
                            ),
                        ),
                        h.td.class(cn(NUM, "font-medium")).children(chain.length.toLocaleString()),
                        h.td
                          .class(cn(NUM, "text-xs text-muted-foreground"))
                          .children(formatDuration(chain.ended - chain.started)),
                        h.td.class(NUM).children(chain.warHits.toLocaleString()),
                        h.td.class(NUM).children(formatRespect(chain.respect)),
                        h.td
                          .class(
                            cn(
                              NUM,
                              "text-xs",
                              chain.longestGap >= CLOSE_CALL_SECONDS &&
                                chain.longestGap < CHAIN_TIMEOUT
                                ? "text-destructive"
                                : "text-muted-foreground",
                            ),
                          )
                          .attr(
                            "title",
                            chain.longestGap >= CHAIN_TIMEOUT
                              ? "Hits outside the war kept the chain alive in between"
                              : undefined,
                          )
                          .children(
                            chain.warHits < 2
                              ? "–"
                              : chain.longestGap >= CHAIN_TIMEOUT
                                ? "5m+"
                                : formatDuration(chain.longestGap),
                          ),
                        h.td.class("px-3 py-2 text-xs").children(
                          chain.bonusHits.length === 0
                            ? h.span.class("text-muted-foreground").children("–")
                            : chain.bonusHits.map((bonus) =>
                                h.div
                                  .key(String(bonus.chain))
                                  .class("whitespace-nowrap")
                                  .children(
                                    h.span
                                      .class("font-mono tabular-nums")
                                      .children(bonus.chain.toLocaleString()),
                                    ` ${bonus.name} `,
                                    h.span
                                      .class("font-mono text-muted-foreground")
                                      .children(formatRespect(bonus.respect)),
                                  ),
                              ),
                        ),
                        h.td.class("px-4 py-2 text-xs text-muted-foreground").children(
                          `${chain.hitters
                            .slice(0, 3)
                            .map((hitter) => `${hitter.name} ${hitter.hits}`)
                            .join(
                              " · ",
                            )}${chain.hitters.length > 3 ? ` · +${chain.hitters.length - 3}` : ""}`,
                        ),
                      ),
                    isOpen
                      ? h.tr.key(`${chain.started}-detail`).children(
                          h.td
                            .attr("colspan", "8")
                            .class("bg-muted/15 px-4 py-4")
                            .children(ChainDetail(h, chain, timeZone, model.active)),
                        )
                      : null,
                  ];
                }),
              ),
            ),
        shortChains > 0 &&
          h.div.class("flex justify-center pt-3").children(
            Button(h, { variant: "outline", size: "sm" })
              .on("click", ChainsMessage.ClickedShortChains())
              .children(
                model.showShort
                  ? `Hide chains under ${SHORT_CHAIN} hits`
                  : `Show ${shortChains} ${shortChains === 1 ? "chain" : "chains"} under ${SHORT_CHAIN} hits`,
              ),
          ),
      ),
    );
  },
});
