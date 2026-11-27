import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ScrollText, Search } from "lucide";
import { Opaque } from "@/domain/schema";
import type { FactionAttack } from "@/lib/faction";
import { resultGroup } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { Button, Card, CardContent, CardHeader, CardTitle, inputClass } from "../ui/primitives";
import { Segmented } from "./charts";
import { formatDateTime, formatRespect } from "./format";

// The log is rarely read, so it opens short.
const INITIAL_ROWS = 10;
const PAGE_SIZE = 50;

const Direction = Schema.Literals(["outgoing", "incoming"]);
type Direction = typeof Direction.Type;
const ResultFilter = Schema.Literals(["all", "hit", "failed", "assist"]);
type ResultFilter = typeof ResultFilter.Type;

const RESULT_FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All results" },
  { value: "hit", label: "Scored" },
  { value: "failed", label: "Wasted" },
  { value: "assist", label: "Assists" },
];

const AttackLogMessage = UiSchema.TaggedEnum({
  PickedDirection: { direction: Direction },
  ChangedResultFilter: { value: Schema.String },
  UpdatedSearch: { value: Schema.String },
  ClickedShowMore: {},
});

/** Every ranked-war attack, newest first, filtered by side, result and name. */
export const AttackLog = Html.component({
  name: "AttackLog",
  props: Schema.Struct({
    outgoing: Opaque<ReadonlyArray<FactionAttack>>(),
    incoming: Opaque<ReadonlyArray<FactionAttack>>(),
    timeZone: Schema.String,
  }),
  model: Schema.Struct({
    direction: Direction,
    resultFilter: ResultFilter,
    search: Schema.String,
    visible: Schema.Number,
  }),
  message: AttackLogMessage,
}).make({
  init: () => ({
    direction: "outgoing" as Direction,
    resultFilter: "all" as ResultFilter,
    search: "",
    visible: INITIAL_ROWS,
  }),
  update: {
    PickedDirection: ($, { direction }) => $.evolve({ direction, visible: INITIAL_ROWS }),
    ChangedResultFilter: ($, { value }) => {
      const filter = RESULT_FILTERS.find((option) => option.value === value)?.value;
      return filter ? $.evolve({ resultFilter: filter, visible: INITIAL_ROWS }) : $.model;
    },
    UpdatedSearch: ($, { value }) => $.evolve({ search: value, visible: INITIAL_ROWS }),
    ClickedShowMore: ($) => $.evolve({ visible: (visible) => visible + PAGE_SIZE }),
  },
  view: (h, model) => {
    const { timeZone } = h.props;
    const query = model.search.trim().toLowerCase();
    const rows = (model.direction === "outgoing" ? h.props.outgoing : h.props.incoming)
      .filter(
        (attack) => model.resultFilter === "all" || resultGroup(attack) === model.resultFilter,
      )
      .filter(
        (attack) =>
          !query ||
          attack.defender.name.toLowerCase().includes(query) ||
          (attack.attacker?.name.toLowerCase().includes(query) ?? false),
      )
      .reverse();

    return Card(h).children(
      CardHeader(h).children(
        h.div.class("flex flex-col justify-between gap-3 lg:flex-row lg:items-end").children(
          h.div.children(
            CardTitle(h, { class: "flex items-center gap-2" }).children(
              Icon(h, ScrollText, { class: "size-4 text-primary" }),
              " Attack log",
            ),
            h.p
              .class("mt-1 text-xs text-muted-foreground")
              .children(`${rows.length.toLocaleString()} matching attacks, newest first`),
          ),
          h.div.class("flex flex-wrap items-center gap-2").children(
            Segmented(h, {
              label: "Whose attacks",
              value: model.direction,
              items: [
                { value: "outgoing", label: "Ours" },
                { value: "incoming", label: "Theirs" },
              ],
              onPick: (direction) => AttackLogMessage.PickedDirection({ direction }),
            }),
            h.select
              .attr("aria-label", "Result")
              .class(
                "h-8 rounded-md border bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )
              .on("change", ({ value }) => AttackLogMessage.ChangedResultFilter({ value }))
              .children(
                RESULT_FILTERS.map((filter) =>
                  h.option
                    .key(filter.value)
                    .attr("value", filter.value)
                    .selected(filter.value === model.resultFilter)
                    .children(filter.label),
                ),
              ),
            h.label.class("relative block").children(
              Icon(h, Search, {
                class:
                  "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
              }),
              h.input
                .attrs({
                  placeholder: "Attacker or defender",
                  "aria-label": "Attacker or defender",
                })
                .class(inputClass("h-8 w-full pl-8 sm:w-52"))
                .value(model.search)
                .on("input", ({ value }) => AttackLogMessage.UpdatedSearch({ value })),
            ),
          ),
        ),
      ),
      CardContent(h, { class: "overflow-x-auto px-0" }).children(
        h.table.class("w-full min-w-[760px] text-sm").children(
          h.thead
            .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
            .children(
              h.tr.children(
                h.th.class("px-4 py-2 font-medium").children("Time"),
                h.th.class("px-3 py-2 font-medium").children("Attacker"),
                h.th.class("px-3 py-2 font-medium").children("Defender"),
                h.th.class("px-3 py-2 font-medium").children("Result"),
                h.th.class("px-3 py-2 text-right font-medium").children("Chain"),
                h.th.class("px-4 py-2 text-right font-medium").children("Respect"),
              ),
            ),
          h.tbody.class("divide-y").children(
            rows.slice(0, model.visible).map((attack) => {
              const group = resultGroup(attack);
              return h.tr
                .key(String(attack.id))
                .class("hover:bg-muted/25")
                .children(
                  h.td
                    .class("whitespace-nowrap px-4 py-2 font-mono text-xs")
                    .children(formatDateTime(attack.ended, timeZone)),
                  h.td.class("px-3 py-2").children(attack.attacker?.name ?? "Stealthed"),
                  h.td.class("px-3 py-2").children(attack.defender.name),
                  h.td
                    .class("px-3 py-2")
                    .children(
                      h.span
                        .class("flex items-center gap-2")
                        .children(
                          h.span
                            .class(
                              cn(
                                "size-2 rounded-full",
                                group === "hit"
                                  ? "bg-primary"
                                  : group === "failed"
                                    ? "bg-destructive"
                                    : "bg-muted-foreground/45",
                              ),
                            )
                            .attr("aria-hidden", "true"),
                          attack.result,
                        ),
                    ),
                  h.td
                    .class(
                      "px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground",
                    )
                    .children(attack.chain === null ? "–" : String(attack.chain)),
                  h.td
                    .class("px-4 py-2 text-right font-mono tabular-nums")
                    .children(formatRespect(attack.respect_gain)),
                );
            }),
          ),
        ),
        rows.length === 0 &&
          h.p
            .class("px-4 py-8 text-center text-sm text-muted-foreground")
            .children("No attacks match these filters."),
        rows.length > model.visible &&
          h.div.class("flex justify-center pt-3").children(
            Button(h, { variant: "outline", size: "sm" })
              .on("click", AttackLogMessage.ClickedShowMore())
              .children(`Show ${Math.min(PAGE_SIZE, rows.length - model.visible)} more`),
          ),
      ),
    );
  },
});
