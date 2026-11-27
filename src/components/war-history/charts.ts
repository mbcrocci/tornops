import { Mount, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { Opaque } from "@/domain/schema";
import type { BonusMark, DayRow, HourOfDay, RespectPoint } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { TrackPointer } from "../ui/pointer";
import { formatDateTime, formatDuration, formatHour, formatRespect, formatSigned } from "./format";

export function niceCeiling(value: number, steps = [1, 2, 2.5, 5, 10]) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of steps) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

const Swatch = <M>(h: Html.H<M>, className: string) =>
  h.span.class(cn("inline-block size-2.5 rounded-[2px]", className)).attr("aria-hidden", "true");

/** Two or more buttons, one pressed: a choice between views of the same data. */
export const Segmented = <M, V extends string>(
  h: Html.H<M>,
  options: {
    readonly label: string;
    readonly value: V;
    readonly items: ReadonlyArray<{ readonly value: V; readonly label: string }>;
    readonly onPick: (value: V) => M;
  },
) =>
  h.div
    .attrs({ role: "group", "aria-label": options.label })
    .class("flex w-fit items-center rounded-md shadow-xs")
    .children(
      options.items.map((item) =>
        h.button
          .key(item.value)
          .attrs({
            type: "button",
            "aria-pressed": item.value === options.value ? "true" : "false",
          })
          .on("click", options.onPick(item.value))
          .class(
            "inline-flex h-8 cursor-pointer items-center justify-center border border-input bg-transparent px-3 text-sm font-medium whitespace-nowrap first:rounded-l-md last:rounded-r-md not-first:border-l-0 hover:bg-muted hover:text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )
          .children(item.label),
      ),
    );

const HOUR = 3600;

function elapsedTicks(duration: number) {
  const step = [1, 2, 3, 6, 12, 24, 48].find((hours) => duration / (hours * HOUR) <= 8) ?? 48;
  return Array.from(
    { length: Math.floor(duration / (step * HOUR)) + 1 },
    (_, index) => index * step * HOUR,
  );
}

// The last point at or before the given elapsed time.
function pointAt(points: ReadonlyArray<RespectPoint>, elapsed: number) {
  let found = points[0];
  for (const point of points) {
    if (point.elapsed > elapsed) break;
    found = point;
  }
  return found;
}

// Pointer distance, in pixels, within which hovering snaps to a chain bonus line.
const BONUS_SNAP_PIXELS = 6;
// Only the big bonuses get a label on the chart; the rest show in the tooltip.
const LABELED_BONUS = 100;

const ScoreView = Schema.Literals(["growth", "hour"]);
type ScoreView = typeof ScoreView.Type;

const WarScoreMovesMessage = UiSchema.TaggedEnum({
  PickedScoreView: { view: ScoreView },
  MovedChartPointer: { fraction: Schema.NullOr(Schema.Number), width: Schema.Number },
});
type WarScoreMovesMessage = typeof WarScoreMovesMessage.Type;
type H = Html.H<WarScoreMovesMessage>;

const nearestPoint = (
  points: ReadonlyArray<RespectPoint>,
  bonuses: ReadonlyArray<BonusMark>,
  fraction: number,
  width: number,
) => {
  const duration = points[points.length - 1].elapsed;
  const pointer = fraction * duration;
  const snap = bonuses.find(
    (bonus) => (Math.abs(bonus.elapsed - pointer) / duration) * width <= BONUS_SNAP_PIXELS,
  );
  const elapsed = snap?.elapsed ?? pointer;
  let nearest = 0;
  points.forEach((point, index) => {
    if (Math.abs(point.elapsed - elapsed) < Math.abs(points[nearest].elapsed - elapsed))
      nearest = index;
  });
  return nearest;
};

const RespectGrowth = (
  h: H,
  props: {
    readonly timeline: ReadonlyArray<RespectPoint>;
    readonly bonuses: ReadonlyArray<BonusMark>;
    readonly warStart: number | null;
    readonly timeZone: string;
  },
  active: number | null,
) => {
  const { timeline: points, bonuses, warStart, timeZone } = props;
  if (points.length < 2)
    return h.p.class("py-8 text-center text-sm text-muted-foreground").children("No war time yet.");
  const last = points[points.length - 1];
  const duration = last.elapsed;
  // Even steps keep the halfway label a round number.
  const scale = niceCeiling(Math.max(last.gained, last.lost), [1, 2, 3, 4, 5, 6, 8, 10]);
  const x = (elapsed: number) => (elapsed / duration) * 1000;
  const y = (value: number) => 100 - (value / scale) * 100;
  const path = (key: "gained" | "lost") =>
    points.map((point) => `${x(point.elapsed)},${y(point[key])}`).join(" ");
  const ticks = elapsedTicks(duration);
  const hovered = active === null ? null : points[active];
  const lead = last.gained - last.lost;
  const label = (elapsed: number) =>
    warStart === null
      ? `${formatDuration(elapsed)} in`
      : `${formatDateTime(warStart + elapsed, timeZone)} · ${formatDuration(elapsed)} in`;
  // Bonuses closer to the hovered point than to its neighbours.
  const step = points[1].elapsed - points[0].elapsed;
  const hoveredBonuses = hovered
    ? bonuses.filter((bonus) => Math.abs(bonus.elapsed - hovered.elapsed) <= step / 2)
    : [];
  const at = (elapsed: number) => `${x(elapsed) / 10}%`;

  return h.div.children(
    h.div
      .class("mb-4 flex flex-wrap items-end justify-between gap-3")
      .children(
        h.p
          .class("text-xs text-muted-foreground")
          .children(
            `Respect scored by each side since the war started${
              warStart === null ? ", with the selected wars lined up by elapsed time" : ""
            }. ${lead === 0 ? "Level" : lead > 0 ? `We lead by ${formatRespect(lead)}` : `We trail by ${formatRespect(-lead)}`} after ${formatDuration(duration)}.`,
          ),
        h.div
          .class("flex items-center gap-4 text-xs text-muted-foreground")
          .children(
            h.span
              .class("flex items-center gap-1.5")
              .children(Swatch(h, "bg-primary"), " Our respect"),
            h.span
              .class("flex items-center gap-1.5")
              .children(Swatch(h, "bg-destructive"), " Their respect"),
            bonuses.length > 0 &&
              h.span
                .class("flex items-center gap-1.5")
                .children(
                  h.span
                    .class("h-3 border-l-2 border-dotted border-primary")
                    .attr("aria-hidden", "true"),
                  " Chain bonus",
                ),
          ),
      ),
    h.div.class("grid grid-cols-[3.25rem_1fr] gap-2").children(
      h.div
        .class(
          "flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground",
        )
        .children(
          h.span(scale.toLocaleString()),
          h.span((scale / 2).toLocaleString()),
          h.span("0"),
        ),
      h.div
        .class("relative h-48 touch-none")
        .onMount(
          TrackPointer().pipe(
            Mount.map(({ fraction, width }) =>
              WarScoreMovesMessage.MovedChartPointer({ fraction, width }),
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
          bonuses.map((bonus) =>
            h.div
              .key(`${bonus.elapsed}-${bonus.chain}`)
              .class(
                "pointer-events-none absolute inset-y-0 border-l-2 border-dotted border-primary/45",
              )
              .style({ left: at(bonus.elapsed) })
              .children(
                bonus.chain >= LABELED_BONUS &&
                  h.span
                    .class(
                      "absolute -top-4 -translate-x-1/2 font-mono text-[9px] text-muted-foreground",
                    )
                    .children(bonus.chain.toLocaleString()),
              ),
          ),
          h.svg
            .attrs({
              viewBox: "0 0 1000 100",
              preserveAspectRatio: "none",
              role: "img",
              "aria-label": `Respect over the war: ours ${formatRespect(last.gained)}, theirs ${formatRespect(last.lost)}, ${bonuses.length} chain bonuses`,
            })
            .class("absolute inset-0 size-full overflow-visible")
            .children(
              (["lost", "gained"] as const).map((key) =>
                h.polyline
                  .key(key)
                  .attrs({
                    points: path(key),
                    fill: "none",
                    "stroke-width": "2",
                    "stroke-linejoin": "round",
                    "vector-effect": "non-scaling-stroke",
                  })
                  .class(key === "gained" ? "stroke-primary" : "stroke-destructive"),
              ),
            ),
          hovered &&
            h.div.class("contents").children(
              h.div
                .class("pointer-events-none absolute inset-y-0 border-l border-foreground/30")
                .style({ left: at(hovered.elapsed) }),
              (["gained", "lost"] as const).map((key) =>
                h.span
                  .key(key)
                  .class(
                    cn(
                      "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                      key === "gained" ? "bg-primary" : "bg-destructive",
                    ),
                  )
                  .style({ left: at(hovered.elapsed), top: `${y(hovered[key])}%` }),
              ),
              h.div
                .class(
                  cn(
                    "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                    hovered.elapsed > duration / 2 ? "-translate-x-full -ml-2" : "ml-2",
                  ),
                )
                .style({ left: at(hovered.elapsed) })
                .children(
                  h.div.class("font-mono font-medium").children(label(hovered.elapsed)),
                  h.div
                    .class("mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums")
                    .children(
                      h.span.class("text-muted-foreground").children("Ours"),
                      h.span.class("text-right").children(formatRespect(hovered.gained)),
                      h.span.class("text-muted-foreground").children("Theirs"),
                      h.span.class("text-right").children(formatRespect(hovered.lost)),
                      h.span.class("text-muted-foreground").children("Lead"),
                      h.span
                        .class("text-right")
                        .children(formatSigned(hovered.gained - hovered.lost)),
                    ),
                  hoveredBonuses.length > 0 &&
                    h.div.class("mt-1.5 border-t pt-1.5").children(
                      hoveredBonuses.map((bonus) =>
                        h.div
                          .key(`${bonus.elapsed}-${bonus.chain}`)
                          .class("flex gap-2")
                          .children(
                            h.span
                              .class("font-mono tabular-nums")
                              .children(`Chain ${bonus.chain.toLocaleString()}`),
                            h.span.children(bonus.name),
                            h.span
                              .class("ml-auto font-mono tabular-nums text-muted-foreground")
                              .children(`+${formatRespect(bonus.respect)}`),
                          ),
                      ),
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
                "absolute",
                tick === 0
                  ? undefined
                  : tick === duration
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              ),
            )
            .style({ left: at(tick) })
            .children(`${tick / HOUR}h`),
        ),
      ),
    ),
    h.details.class("mt-4 text-xs").children(
      h.summary
        .class("cursor-pointer text-muted-foreground hover:text-foreground")
        .children("View as table"),
      h.div.class("mt-2 overflow-x-auto").children(
        h.table.class("w-full min-w-[420px] font-mono tabular-nums").children(
          h.thead
            .class("border-y bg-muted/35 text-left text-muted-foreground")
            .children(
              h.tr.children(
                h.th.class("px-3 py-1.5 font-medium").children("Into the war"),
                h.th.class("px-3 py-1.5 text-right font-medium").children("Ours"),
                h.th.class("px-3 py-1.5 text-right font-medium").children("Theirs"),
                h.th.class("px-3 py-1.5 text-right font-medium").children("Lead"),
              ),
            ),
          h.tbody.class("divide-y").children(
            [...ticks.filter((tick) => tick < duration), duration].map((tick) => {
              const point = pointAt(points, tick);
              return h.tr
                .key(String(tick))
                .children(
                  h.td.class("px-3 py-1").children(label(tick)),
                  h.td.class("px-3 py-1 text-right").children(formatRespect(point.gained)),
                  h.td.class("px-3 py-1 text-right").children(formatRespect(point.lost)),
                  h.td
                    .class("px-3 py-1 text-right")
                    .children(formatSigned(point.gained - point.lost)),
                );
            }),
          ),
        ),
      ),
    ),
  );
};

const NetRespectByHour = (h: H, hours: ReadonlyArray<HourOfDay>) => {
  const rows = hours.map((bucket) => {
    const gained = bucket.liveHours ? bucket.respectGained / bucket.liveHours : 0;
    const lost = bucket.liveHours ? bucket.respectLost / bucket.liveHours : 0;
    return { ...bucket, gained, lost, net: gained - lost };
  });
  const scale = niceCeiling(Math.max(...rows.flatMap((row) => [row.gained, row.lost])));
  const sampled = rows.filter((row) => row.liveHours > 0);
  const best = sampled.reduce<(typeof rows)[number] | undefined>(
    (top, row) => (!top || row.net > top.net ? row : top),
    undefined,
  );
  const worst = sampled.reduce<(typeof rows)[number] | undefined>(
    (bottom, row) => (!bottom || row.net < bottom.net ? row : bottom),
    undefined,
  );
  return h.div.children(
    h.div
      .class("mb-4 flex flex-wrap items-end justify-between gap-3")
      .children(
        h.p
          .class("text-xs text-muted-foreground")
          .children(
            `Average respect per war hour, by hour of the day.${
              best && worst
                ? ` Best hour ${formatHour(best.hour)} (${formatSigned(best.net)}), worst ${formatHour(worst.hour)} (${formatSigned(worst.net)}).`
                : ""
            }`,
          ),
        h.div
          .class("flex items-center gap-4 text-xs text-muted-foreground")
          .children(
            h.span
              .class("flex items-center gap-1.5")
              .children(Swatch(h, "bg-primary"), " Respect gained"),
            h.span
              .class("flex items-center gap-1.5")
              .children(Swatch(h, "bg-destructive"), " Respect lost"),
          ),
      ),
    h.div.class("grid grid-cols-[2.75rem_1fr] gap-2").children(
      h.div
        .class(
          "flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground",
        )
        .children(h.span(`+${scale}`), h.span("0"), h.span(`−${scale}`)),
      h.div.class("relative grid h-48 grid-cols-24 gap-0.5").children(
        h.div.class("pointer-events-none absolute inset-x-0 top-1/2 border-t"),
        rows.map((row) =>
          h.div
            .key(String(row.hour))
            .attrs({
              tabindex: "0",
              "aria-label": row.liveHours
                ? `${formatHour(row.hour)}: ${formatRespect(row.gained)} gained, ${formatRespect(row.lost)} lost per war hour`
                : `${formatHour(row.hour)}: never at war`,
            })
            .class("group relative flex h-full flex-col items-center outline-none")
            .children(
              h.div
                .class("flex h-1/2 w-full items-end justify-center")
                .children(
                  h.div
                    .class(
                      "w-full max-w-6 rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary group-focus-visible:bg-primary",
                    )
                    .style({ height: `${(row.gained / scale) * 100}%` }),
                ),
              h.div
                .class("flex h-1/2 w-full items-start justify-center")
                .children(
                  row.liveHours === 0
                    ? h.span.class("mt-1 size-1 rounded-full bg-muted-foreground/40")
                    : h.div
                        .class(
                          "w-full max-w-6 rounded-b-[4px] bg-destructive/75 transition-colors group-hover:bg-destructive group-focus-visible:bg-destructive",
                        )
                        .style({ height: `${(row.lost / scale) * 100}%` }),
                ),
              h.div
                .class(
                  "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block",
                )
                .children(
                  h.div.class("font-mono font-medium").children(formatHour(row.hour)),
                  row.liveHours === 0
                    ? h.div.class("text-muted-foreground").children("Never at war at this hour")
                    : h.div
                        .class("mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums")
                        .children(
                          h.span.class("text-muted-foreground").children("Gained"),
                          h.span.class("text-right").children(formatRespect(row.gained)),
                          h.span.class("text-muted-foreground").children("Lost"),
                          h.span.class("text-right").children(formatRespect(row.lost)),
                          h.span.class("text-muted-foreground").children("Net"),
                          h.span.class("text-right").children(formatSigned(row.net)),
                          h.span.class("text-muted-foreground").children("Hits / taken"),
                          h.span.class("text-right").children(`${row.hits} / ${row.hitsTaken}`),
                          h.span.class("text-muted-foreground").children("War hours"),
                          h.span.class("text-right").children(String(row.liveHours)),
                        ),
                ),
            ),
        ),
      ),
      h.span,
      h.div
        .class("grid grid-cols-8 font-mono text-[10px] text-muted-foreground")
        .children(
          Array.from({ length: 8 }, (_, index) =>
            h.span.key(String(index)).children(formatHour(index * 3)),
          ),
        ),
    ),
    h.details
      .class("mt-4 text-xs")
      .children(
        h.summary
          .class("cursor-pointer text-muted-foreground hover:text-foreground")
          .children("View as table"),
        h.div
          .class("mt-2 overflow-x-auto")
          .children(
            h.table
              .class("w-full min-w-[560px] font-mono tabular-nums")
              .children(
                h.thead
                  .class("border-y bg-muted/35 text-left text-muted-foreground")
                  .children(
                    h.tr.children(
                      h.th.class("px-3 py-1.5 font-medium").children("Hour"),
                      ...[
                        "War hours",
                        "Gained / h",
                        "Lost / h",
                        "Net / h",
                        "Hits",
                        "Hits taken",
                      ].map((label) =>
                        h.th.class("px-3 py-1.5 text-right font-medium").children(label),
                      ),
                    ),
                  ),
                h.tbody
                  .class("divide-y")
                  .children(
                    rows.map((row) =>
                      h.tr
                        .key(String(row.hour))
                        .children(
                          h.td.class("px-3 py-1").children(formatHour(row.hour)),
                          h.td.class("px-3 py-1 text-right").children(String(row.liveHours)),
                          h.td.class("px-3 py-1 text-right").children(formatRespect(row.gained)),
                          h.td.class("px-3 py-1 text-right").children(formatRespect(row.lost)),
                          h.td.class("px-3 py-1 text-right").children(formatSigned(row.net)),
                          h.td.class("px-3 py-1 text-right").children(String(row.hits)),
                          h.td.class("px-3 py-1 text-right").children(String(row.hitsTaken)),
                        ),
                    ),
                  ),
              ),
          ),
      ),
  );
};

/** How the war score moved: over the war, or by hour of the day. */
export const WarScoreMoves = Html.component({
  name: "WarScoreMoves",
  props: Schema.Struct({
    hours: Opaque<ReadonlyArray<HourOfDay>>(),
    timeline: Opaque<ReadonlyArray<RespectPoint>>(),
    bonuses: Opaque<ReadonlyArray<BonusMark>>(),
    // Set when a single war is selected, so the timeline can show clock times.
    warStart: Schema.NullOr(Schema.Number),
    timeZone: Schema.String,
  }),
  model: Schema.Struct({ view: ScoreView, active: Schema.NullOr(Schema.Number) }),
  message: WarScoreMovesMessage,
  restore: (model) => ({ ...model, active: null }),
}).make({
  init: () => ({ view: "growth" as ScoreView, active: null }),
  update: {
    PickedScoreView: ($, { view }) => $.evolve({ view, active: null }),
    MovedChartPointer: ($, { fraction, width }) =>
      $.evolve({
        active:
          fraction === null || $.props.timeline.length < 2
            ? null
            : nearestPoint($.props.timeline, $.props.bonuses, fraction, width),
      }),
  },
  view: (h, model) =>
    h.div.children(
      h.div.class("mb-2 flex flex-wrap items-center justify-between gap-3").children(
        h.h2.class("font-medium").children("Where the war score moves"),
        Segmented(h, {
          label: "Score view",
          value: model.view,
          items: [
            { value: "growth", label: "Over the war" },
            { value: "hour", label: "By hour of day" },
          ],
          onPick: (view) => WarScoreMovesMessage.PickedScoreView({ view }),
        }),
      ),
      model.view === "growth"
        ? RespectGrowth(h, h.props, model.active)
        : NetRespectByHour(h, h.props.hours),
    ),
});

const HeatmapMetric = Schema.Literals(["attacks", "hitsTaken"]);
type HeatmapMetric = typeof HeatmapMetric.Type;

const DayHeatmapMessage = UiSchema.TaggedEnum({ PickedHeatmapMetric: { metric: HeatmapMetric } });

/** Every war hour as a cell, one row per day. */
export const DayHeatmap = Html.component({
  name: "DayHeatmap",
  props: Schema.Struct({ days: Opaque<ReadonlyArray<DayRow>>() }),
  model: Schema.Struct({ metric: HeatmapMetric }),
  message: DayHeatmapMessage,
}).make({
  init: () => ({ metric: "attacks" as HeatmapMetric }),
  update: { PickedHeatmapMetric: ($, { metric }) => $.evolve({ metric }) },
  view: (h, { metric }) => {
    const { days } = h.props;
    const max = Math.max(1, ...days.flatMap((row) => row.hours.map((cell) => cell[metric])));
    const fill = metric === "attacks" ? "bg-primary" : "bg-destructive";
    return h.div.children(
      h.div.class("mb-3 flex flex-wrap items-center justify-between gap-3").children(
        Segmented(h, {
          label: "Heatmap metric",
          value: metric,
          items: [
            { value: "attacks", label: "Our attacks" },
            { value: "hitsTaken", label: "Hits taken" },
          ],
          onPick: (metric) => DayHeatmapMessage.PickedHeatmapMetric({ metric }),
        }),
        h.div.class("flex items-center gap-3 text-[10px] text-muted-foreground").children(
          h.span
            .class("flex items-center gap-1.5")
            .children(
              h.span
                .class("grid size-2.5 place-items-center")
                .children(h.span.class("size-1 rounded-full bg-muted-foreground/40")),
              "Outside war",
            ),
          h.span
            .class("flex items-center gap-1.5")
            .children(h.span.class("size-2.5 rounded-[2px] bg-muted"), " None"),
          h.span.class("flex items-center gap-1.5").children(
            "1",
            h.span.class("flex gap-px").children(
              [0.2, 0.4, 0.6, 0.8, 1].map((opacity) =>
                h.span
                  .key(String(opacity))
                  .class(cn("size-2.5 rounded-[2px]", fill))
                  .style({ opacity: String(opacity) }),
              ),
            ),
            String(max),
          ),
        ),
      ),
      h.div.class("overflow-x-auto").children(
        h.div.class("min-w-[680px]").children(
          h.div
            .class(
              "mb-2 grid grid-cols-[3.5rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[9px] text-muted-foreground",
            )
            .children(
              h.span,
              Array.from({ length: 24 }, (_, hour) =>
                h.span
                  .key(String(hour))
                  .class(cn("text-center", hour % 3 !== 0 && "opacity-0"))
                  .children(hour.toString().padStart(2, "0")),
              ),
            ),
          h.div.class("space-y-0.5").children(
            days.map(({ day, hours }) =>
              h.div
                .key(day)
                .class("grid grid-cols-[3.5rem_repeat(24,minmax(0,1fr))] gap-0.5")
                .children(
                  h.span
                    .class("truncate pr-2 font-mono text-[10px] text-muted-foreground")
                    .children(day.slice(5)),
                  hours.map((cell, hour) => {
                    const value = cell[metric];
                    const outside = !cell.live && value === 0;
                    return h.div
                      .key(String(hour))
                      .attr(
                        "title",
                        outside
                          ? `${day} ${formatHour(hour)}: outside the war`
                          : `${day} ${formatHour(hour)}: ${cell.attacks} attacks, ${cell.hitsTaken} hits taken`,
                      )
                      .class(
                        cn(
                          "grid aspect-square min-h-3 place-items-center rounded-[2px]",
                          outside ? undefined : value === 0 ? "bg-muted" : fill,
                        ),
                      )
                      .style({ opacity: value > 0 && String(0.2 + (value / max) * 0.8) })
                      .children(
                        outside && h.span.class("size-1 rounded-full bg-muted-foreground/40"),
                      );
                  }),
                ),
            ),
          ),
        ),
      ),
    );
  },
});
