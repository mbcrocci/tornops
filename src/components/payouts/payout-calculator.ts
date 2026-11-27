import { Mount, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ChartArea, Coins, Search, Swords, Users } from "lucide";
import { Opaque } from "@/domain/schema";
import type { FactionAttack } from "@/lib/faction";
import { playerProfileLink } from "@/lib/links";
import { parseMoney, type PayoutMember, summarizePayouts } from "@/lib/payouts";
import { cn } from "@/lib/utils";
import { CHECKBOX_CLASS } from "../settings";
import { Icon } from "../ui/icon";
import { TrackPointer } from "../ui/pointer";
import { Card, CardContent, CardHeader, CardTitle, inputClass, Label } from "../ui/primitives";
import { niceCeiling } from "../war-history/charts";
import { formatPercent, formatRespect } from "../war-history/format";

const formatMoney = (amount: number) => `$${Math.floor(amount).toLocaleString()}`;
const formatRate = (amount: number) =>
  `$${amount.toLocaleString(undefined, { maximumFractionDigits: amount < 100 ? 2 : 0 })}`;
const compactMoney = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const formatCompactMoney = (amount: number) => `$${compactMoney.format(amount)}`;

const PayType = Schema.Literals(["respect", "hit"]);
type PayType = typeof PayType.Type;
const BonusMode = Schema.Literals(["average", "fixed"]);
type BonusMode = typeof BonusMode.Type;

const PayoutCalculatorMessage = UiSchema.TaggedEnum({
  UpdatedPayout: { value: Schema.String },
  ChangedPayType: { value: Schema.String },
  ToggledIncludeBonus: { checked: Schema.Boolean },
  ChangedBonusMode: { value: Schema.String },
  UpdatedBonusRespect: { value: Schema.String },
  UpdatedSearch: { value: Schema.String },
  MovedSpreadPointer: { index: Schema.NullOr(Schema.Number) },
});
type PayoutCalculatorMessage = typeof PayoutCalculatorMessage.Type;
type H = Html.H<PayoutCalculatorMessage>;

const SELECT_CLASS =
  "h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
const NUM = "px-3 py-2.5 text-right font-mono tabular-nums";

const Metric = (h: H, label: string, value: string, detail: string) =>
  h.div
    .class("border-l-2 border-primary/60 pl-3")
    .children(
      h.div.class("mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground").children(label),
      h.div.class("font-mono text-2xl font-semibold").children(value),
      h.div.class("mt-1 text-xs text-muted-foreground").children(detail),
    );

function median(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Every member's payout, lowest first, so the shape shows how evenly the pool is spread.
 * `members` comes in table order, highest first.
 */
const PayoutSpread = (
  h: H,
  members: ReadonlyArray<PayoutMember>,
  payout: number,
  active: number | null,
) => {
  if (payout <= 0 || members.length === 0)
    return h.p
      .class("py-8 text-center text-sm text-muted-foreground")
      .children("Set a payout to see how it is spread.");

  const ordered = [...members].reverse();
  const count = ordered.length;
  const amounts = ordered.map((member) => member.payout);
  const highest = amounts[count - 1];
  const middle = median(amounts);
  const scale = niceCeiling(highest, [1, 2, 3, 4, 5, 6, 8, 10]);
  // Table position of the member at chart index `index`.
  const position = (index: number) => count - index;
  const x = (index: number) => (count === 1 ? 500 : (index / (count - 1)) * 1000);
  const y = (amount: number) => 100 - (amount / scale) * 100;
  const line = ordered.map((member, index) => `${x(index)},${y(member.payout)}`).join(" ");
  const area = `M${x(0)},100 L${line.replaceAll(" ", " L")} L${x(count - 1)},100 Z`;
  const topCount = Math.max(1, Math.round(count / 10));
  const topShare =
    amounts.slice(-topCount).reduce((total, amount) => total + amount, 0) /
    amounts.reduce((total, amount) => total + amount, 0);
  const ticks = [...new Set([0, Math.floor((count - 1) / 2), count - 1])];
  const index = active === null ? null : Math.min(count - 1, Math.max(0, active));
  const hovered = index === null ? null : ordered[index];

  return h.div.children(
    h.p
      .class("mb-4 text-xs text-muted-foreground")
      .children(
        `Lowest ${formatMoney(amounts[0])} · median ${formatMoney(middle)} · highest ${formatMoney(highest)}. The top ${topCount} ${
          topCount === 1 ? "member gets" : "members get"
        } ${Math.round(topShare * 100)}% of the payout.`,
      ),
    h.div.class("grid grid-cols-[3.25rem_1fr] gap-2").children(
      h.div
        .class(
          "flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground",
        )
        .children(
          h.span(formatCompactMoney(scale)),
          h.span(formatCompactMoney(scale / 2)),
          h.span("$0"),
        ),
      h.div
        .class("relative h-48 touch-none")
        .onMount(
          TrackPointer().pipe(
            Mount.map(({ fraction }) =>
              PayoutCalculatorMessage.MovedSpreadPointer({
                index: fraction === null ? null : Math.round(fraction * (count - 1)),
              }),
            ),
          ),
        )
        .children(
          h.div
            .class("pointer-events-none absolute inset-0 flex flex-col justify-between")
            .children(
              h.div.class("border-t border-dashed border-border/60"),
              h.div.class("border-t border-dashed border-border/60"),
              h.div.class("border-t"),
            ),
          h.div
            .class(
              "pointer-events-none absolute inset-x-0 border-t border-dotted border-foreground/40",
            )
            .style({ top: `${y(middle)}%` })
            .children(
              h.span
                .class("absolute -top-4 left-1 font-mono text-[9px] text-muted-foreground")
                .children("median"),
            ),
          h.svg
            .attrs({
              viewBox: "0 0 1000 100",
              preserveAspectRatio: "none",
              role: "img",
              "aria-label": `Payouts for ${count} members, from ${formatMoney(amounts[0])} to ${formatMoney(highest)}, median ${formatMoney(middle)}`,
            })
            .class("absolute inset-0 size-full overflow-visible")
            .children(
              h.path.attr("d", area).class("fill-primary/10"),
              h.polyline
                .attrs({
                  points: line,
                  fill: "none",
                  "stroke-width": "2",
                  "stroke-linejoin": "round",
                  "vector-effect": "non-scaling-stroke",
                })
                .class("stroke-primary"),
            ),
          hovered &&
            index !== null &&
            h.div.class("contents").children(
              h.div
                .class("pointer-events-none absolute inset-y-0 border-l border-foreground/30")
                .style({ left: `${x(index) / 10}%` }),
              h.span
                .class(
                  "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card",
                )
                .style({ left: `${x(index) / 10}%`, top: `${y(hovered.payout)}%` }),
              h.div
                .class(
                  cn(
                    "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                    x(index) > 500 ? "-translate-x-full -ml-2" : "ml-2",
                  ),
                )
                .style({ left: `${x(index) / 10}%` })
                .children(
                  h.div.class("font-medium").children(hovered.name),
                  h.div
                    .class("mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums")
                    .children(
                      h.span.class("text-muted-foreground").children("Position"),
                      h.span.class("text-right").children(`#${position(index)} of ${count}`),
                      h.span.class("text-muted-foreground").children("Payout"),
                      h.span.class("text-right").children(formatMoney(hovered.payout)),
                      h.span.class("text-muted-foreground").children("Share"),
                      h.span.class("text-right").children(`${(hovered.share * 100).toFixed(2)}%`),
                      h.span.class("text-muted-foreground").children("Hits"),
                      h.span.class("text-right").children(hovered.hits.toLocaleString()),
                    ),
                ),
            ),
        ),
      h.span,
      h.div.class("relative h-3 font-mono text-[10px] text-muted-foreground").children(
        ticks.map((tick) =>
          h.span
            .key(String(tick))
            .class(
              cn(
                "absolute whitespace-nowrap",
                tick === 0
                  ? undefined
                  : tick === count - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              ),
            )
            .style({ left: `${x(tick) / 10}%` })
            .children(`#${position(tick)}`),
        ),
      ),
    ),
    h.p
      .class("mt-2 text-right text-[10px] text-muted-foreground")
      .children("Table position, lowest paid on the left"),
  );
};

/**
 * Splits a payout between the members who made `attacks`, by respect or by hits, with the
 * spread charted and every member's share in a table.
 */
export const PayoutCalculator = Html.component({
  name: "PayoutCalculator",
  props: Schema.Struct({
    attacks: Opaque<ReadonlyArray<FactionAttack>>(),
    title: Schema.String,
    /** What a counted hit is called, such as "War hits". */
    hitLabel: Schema.String,
    hitDescription: Schema.String,
  }),
  model: Schema.Struct({
    payoutInput: Schema.String,
    payType: PayType,
    includeBonus: Schema.Boolean,
    bonusMode: BonusMode,
    bonusRespectInput: Schema.String,
    search: Schema.String,
    active: Schema.NullOr(Schema.Number),
  }),
  message: PayoutCalculatorMessage,
  restore: (model) => ({ ...model, active: null }),
}).make({
  init: () => ({
    payoutInput: "",
    payType: "respect" as PayType,
    includeBonus: true,
    bonusMode: "average" as BonusMode,
    bonusRespectInput: "10",
    search: "",
    active: null,
  }),
  update: {
    UpdatedPayout: ($, { value }) => $.evolve({ payoutInput: value }),
    ChangedPayType: ($, { value }) =>
      value === "respect" || value === "hit" ? $.evolve({ payType: value }) : $.model,
    ToggledIncludeBonus: ($, { checked }) => $.evolve({ includeBonus: checked }),
    ChangedBonusMode: ($, { value }) =>
      value === "average" || value === "fixed" ? $.evolve({ bonusMode: value }) : $.model,
    UpdatedBonusRespect: ($, { value }) => $.evolve({ bonusRespectInput: value }),
    UpdatedSearch: ($, { value }) => $.evolve({ search: value }),
    MovedSpreadPointer: ($, { index }) => $.evolve({ active: index }),
  },
  view: (h, model) => {
    const { attacks, title, hitLabel, hitDescription } = h.props;
    const payout = parseMoney(model.payoutInput) ?? 0;
    const fixedBonusRespect = Math.max(0, Number.parseFloat(model.bonusRespectInput) || 0);
    const bonusRespect = model.bonusMode === "average" ? ("average" as const) : fixedBonusRespect;
    const perRespect = model.payType === "respect";
    // Paying per hit ignores respect, so the bonus setting only applies per respect. The
    // choice is kept for when the pay type is switched back.
    const countActualBonus = !perRespect || model.includeBonus;
    const summary = summarizePayouts([...attacks], {
      payout,
      payType: model.payType,
      includeBonus: countActualBonus,
      bonusRespect,
    });
    const query = model.search.trim().toLowerCase();
    const rows = summary.members.filter((member) => member.name.toLowerCase().includes(query));
    const payoutInvalid = model.payoutInput.trim() !== "" && parseMoney(model.payoutInput) === null;
    const unit = perRespect ? "respect" : "hit";
    const id = h.id("payout");

    return h.div.class("space-y-4").children(
      Card(h).children(
        CardHeader(h).children(
          CardTitle(h, { class: "flex items-center gap-2" }).children(
            Icon(h, Coins, { class: "size-4 text-primary" }),
            ` ${title}`,
          ),
        ),
        CardContent(h, { class: "flex flex-wrap items-end gap-x-6 gap-y-4" }).children(
          h.div.class("grid gap-1.5").children(
            Label(h, { for: `${id}-payout` }).children("Payout"),
            h.input
              .attrs({
                id: `${id}-payout`,
                inputmode: "decimal",
                placeholder: "e.g. 500m",
                "aria-invalid": payoutInvalid ? "true" : undefined,
              })
              .class(inputClass(cn("w-44 font-mono", payoutInvalid && "border-destructive")))
              .value(model.payoutInput)
              .on("input", ({ value }) => PayoutCalculatorMessage.UpdatedPayout({ value })),
          ),
          h.div.class("grid gap-1.5").children(
            Label(h, { for: `${id}-type` }).children("Type of pay"),
            h.select
              .id(`${id}-type`)
              .class(SELECT_CLASS)
              .on("change", ({ value }) => PayoutCalculatorMessage.ChangedPayType({ value }))
              .children(
                h.option.attr("value", "respect").selected(perRespect).children("Per respect"),
                h.option.attr("value", "hit").selected(!perRespect).children("Per hit"),
              ),
          ),
          perRespect &&
            h.div.class("flex h-9 items-center gap-2").children(
              h.input
                .attrs({ id: `${id}-bonus`, type: "checkbox" })
                .class(cn(CHECKBOX_CLASS, "accent-primary"))
                .checked(model.includeBonus)
                .on("change", ({ checked }) =>
                  PayoutCalculatorMessage.ToggledIncludeBonus({ checked }),
                ),
              Label(h, { for: `${id}-bonus` }).children("Include bonus"),
            ),
          perRespect &&
            !model.includeBonus &&
            h.div.class("grid gap-1.5").children(
              Label(h, { for: `${id}-bonus-mode` }).children("Respect per bonus hit"),
              h.div.class("flex gap-2").children(
                h.select
                  .id(`${id}-bonus-mode`)
                  .class(SELECT_CLASS)
                  .on("change", ({ value }) => PayoutCalculatorMessage.ChangedBonusMode({ value }))
                  .children(
                    h.option
                      .attr("value", "average")
                      .selected(model.bonusMode === "average")
                      .children("Member's average per hit"),
                    h.option
                      .attr("value", "fixed")
                      .selected(model.bonusMode === "fixed")
                      .children("Fixed amount"),
                  ),
                model.bonusMode === "fixed" &&
                  h.input
                    .attrs({
                      id: `${id}-bonus-respect`,
                      "aria-label": "Respect per bonus hit",
                      type: "number",
                      min: "0",
                      step: "0.01",
                    })
                    .class(inputClass("w-28 font-mono"))
                    .value(model.bonusRespectInput)
                    .on("input", ({ value }) =>
                      PayoutCalculatorMessage.UpdatedBonusRespect({ value }),
                    ),
              ),
            ),
          h.p
            .class("basis-full text-xs text-muted-foreground")
            .children(
              perRespect
                ? `The payout is shared out by respect. ${
                    countActualBonus
                      ? "Chain bonus hits count the respect they earned."
                      : model.bonusMode === "average"
                        ? "Each chain bonus hit counts as the member's average respect over their other hits, or the faction's average if they only made bonus hits."
                        : `Each chain bonus hit counts as ${formatRespect(fixedBonusRespect)} respect.`
                  }`
                : `The payout is shared out by ${hitLabel.toLowerCase()}. Chain bonus hits count as one hit like any other.`,
            ),
        ),
      ),
      Card(h, { class: "overflow-hidden p-0" }).children(
        h.div
          .class("grid gap-5 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4")
          .children(
            Metric(
              h,
              hitLabel,
              summary.hits.toLocaleString(),
              `${attacks.length.toLocaleString()} attacks · ${summary.bonusHits} bonus hits`,
            ),
            Metric(h, "Members", summary.members.length.toLocaleString(), "earned respect"),
            Metric(
              h,
              "Respect",
              formatRespect(summary.countedRespect),
              countActualBonus
                ? "earned for the faction"
                : `${formatRespect(summary.respect)} earned, bonus hits replaced`,
            ),
            Metric(
              h,
              `Pay per ${unit}`,
              payout > 0 ? formatRate(summary.rate) : "–",
              payout > 0
                ? `${formatMoney(payout - summary.remainder)} of ${formatMoney(payout)} paid out`
                : "set a payout to split",
            ),
          ),
      ),
      Card(h).children(
        CardHeader(h).children(
          CardTitle(h, { class: "flex items-center gap-2" }).children(
            Icon(h, ChartArea, { class: "size-4 text-primary" }),
            " Payout spread",
          ),
        ),
        CardContent(h).children(PayoutSpread(h, summary.members, payout, model.active)),
      ),
      Card(h).children(
        CardHeader(h).children(
          h.div.class("flex flex-col justify-between gap-3 sm:flex-row sm:items-end").children(
            h.div.children(
              CardTitle(h, { class: "flex items-center gap-2" }).children(
                Icon(h, Users, { class: "size-4 text-primary" }),
                " Members",
              ),
              h.p
                .class("mt-1 text-xs text-muted-foreground")
                .children(`${hitDescription} Payouts are rounded down to the dollar.`),
            ),
            h.label.class("relative block").children(
              Icon(h, Search, {
                class:
                  "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
              }),
              h.input
                .attrs({ placeholder: "Find a member", "aria-label": "Find a member" })
                .class(inputClass("w-full pl-8 sm:w-60"))
                .value(model.search)
                .on("input", ({ value }) => PayoutCalculatorMessage.UpdatedSearch({ value })),
            ),
          ),
        ),
        CardContent(h, { class: "overflow-x-auto px-0" }).children(
          summary.members.length === 0
            ? h.p
                .class("px-6 py-8 text-center text-sm text-muted-foreground")
                .children("No attacks that earned respect.")
            : h.table.class("w-full min-w-[760px] text-sm").children(
                h.thead
                  .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
                  .children(
                    h.tr.children(
                      h.th.class("px-4 py-2 font-medium").children("Member"),
                      h.th
                        .class("px-3 py-2 text-right font-medium")
                        .children(Icon(h, Swords, { class: "mr-1 inline size-3" }), hitLabel),
                      h.th.class("px-3 py-2 text-right font-medium").children("Bonus hits"),
                      h.th.class("px-3 py-2 text-right font-medium").children("Respect earned"),
                      !countActualBonus &&
                        h.th.class("px-3 py-2 text-right font-medium").children("Respect counted"),
                      h.th.class("px-3 py-2 text-right font-medium").children("Share"),
                      h.th
                        .class("px-4 py-2 text-right font-medium")
                        .children(Icon(h, Coins, { class: "mr-1 inline size-3" }), "Payout"),
                    ),
                  ),
                h.tbody.class("divide-y").children(
                  rows.map((member) =>
                    h.tr
                      .key(String(member.id))
                      .class("hover:bg-muted/25")
                      .children(
                        h.td.class("px-4 py-2.5").children(
                          h.a
                            .attrs({
                              href: playerProfileLink(member.id),
                              target: "_blank",
                              rel: "noreferrer",
                            })
                            .class("font-medium hover:text-primary hover:underline")
                            .children(member.name),
                          h.span
                            .class("ml-2 font-mono text-[10px] text-muted-foreground")
                            .children(String(member.id)),
                        ),
                        h.td.class(NUM).children(member.hits.toLocaleString()),
                        h.td
                          .class(cn(NUM, member.bonusHits === 0 && "text-muted-foreground"))
                          .children(String(member.bonusHits)),
                        h.td.class(NUM).children(formatRespect(member.respect)),
                        !countActualBonus &&
                          h.td
                            .class(NUM)
                            .attr(
                              "title",
                              member.bonusHitRespect === null
                                ? undefined
                                : `Each bonus hit counted as ${formatRespect(member.bonusHitRespect)} respect`,
                            )
                            .children(formatRespect(member.countedRespect)),
                        h.td.class(NUM).children(`${(member.share * 100).toFixed(2)}%`),
                        h.td
                          .class("px-4 py-2.5 text-right font-mono font-medium tabular-nums")
                          .children(payout > 0 ? formatMoney(member.payout) : "–"),
                      ),
                  ),
                ),
                h.tfoot
                  .class("border-t bg-muted/35 font-mono text-xs tabular-nums")
                  .children(
                    h.tr.children(
                      h.td.class("px-4 py-2 font-sans font-medium").children("Total"),
                      h.td.class("px-3 py-2 text-right").children(summary.hits.toLocaleString()),
                      h.td.class("px-3 py-2 text-right").children(String(summary.bonusHits)),
                      h.td.class("px-3 py-2 text-right").children(formatRespect(summary.respect)),
                      !countActualBonus &&
                        h.td
                          .class("px-3 py-2 text-right")
                          .children(formatRespect(summary.countedRespect)),
                      h.td.class("px-3 py-2 text-right").children(formatPercent(1)),
                      h.td
                        .class("px-4 py-2 text-right")
                        .children(payout > 0 ? formatMoney(payout - summary.remainder) : "–"),
                    ),
                  ),
              ),
        ),
      ),
    );
  },
});
