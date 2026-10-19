import { type PointerEvent, useState } from "react";
import type { BonusMark, DayRow, HourOfDay, RespectPoint } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { formatDateTime, formatDuration, formatHour, formatRespect, formatSigned } from "./format";

function niceCeiling(value: number, steps = [1, 2, 2.5, 5, 10]) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of steps) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function Swatch({ className }: { className: string }) {
  return <span className={cn("inline-block size-2.5 rounded-[2px]", className)} aria-hidden />;
}

type ScoreView = "growth" | "hour";

export function WarScoreMoves({
  hours,
  timeline,
  bonuses,
  warStart,
  timeZone,
}: {
  hours: HourOfDay[];
  timeline: RespectPoint[];
  bonuses: BonusMark[];
  // Set when a single war is selected, so the timeline can show clock times.
  warStart: number | null;
  timeZone: string;
}) {
  const [view, setView] = useState<ScoreView>("growth");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Where the war score moves</h2>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(value) => value && setView(value as ScoreView)}
        >
          <ToggleGroupItem value="growth">Over the war</ToggleGroupItem>
          <ToggleGroupItem value="hour">By hour of day</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "growth" ? (
        <RespectGrowth
          points={timeline}
          bonuses={bonuses}
          warStart={warStart}
          timeZone={timeZone}
        />
      ) : (
        <NetRespectByHour hours={hours} />
      )}
    </div>
  );
}

const HOUR = 3600;

function elapsedTicks(duration: number) {
  const step = [1, 2, 3, 6, 12, 24, 48].find((hours) => duration / (hours * HOUR) <= 8) ?? 48;
  return Array.from(
    { length: Math.floor(duration / (step * HOUR)) + 1 },
    (_, index) => index * step * HOUR,
  );
}

// The last point at or before the given elapsed time.
function pointAt(points: RespectPoint[], elapsed: number) {
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

function RespectGrowth({
  points,
  bonuses,
  warStart,
  timeZone,
}: {
  points: RespectPoint[];
  bonuses: BonusMark[];
  warStart: number | null;
  timeZone: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No war time yet.</p>;
  }
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
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = ((event.clientX - bounds.left) / bounds.width) * duration;
    const snap = bonuses.find(
      (bonus) => (Math.abs(bonus.elapsed - pointer) / duration) * bounds.width <= BONUS_SNAP_PIXELS,
    );
    const elapsed = snap?.elapsed ?? pointer;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.elapsed - elapsed) < Math.abs(points[nearest].elapsed - elapsed)) {
        nearest = index;
      }
    });
    setActive(nearest);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Respect scored by each side since the war started
          {warStart === null && ", with the selected wars lined up by elapsed time"}.{" "}
          {lead === 0
            ? "Level"
            : lead > 0
              ? `We lead by ${formatRespect(lead)}`
              : `We trail by ${formatRespect(-lead)}`}{" "}
          after {formatDuration(duration)}.
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-primary" /> Our respect
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-destructive" /> Their respect
          </span>
          {bonuses.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 border-l-2 border-dotted border-primary" aria-hidden /> Chain
              bonus
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[3.25rem_1fr] gap-2">
        <div className="flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{scale.toLocaleString()}</span>
          <span>{(scale / 2).toLocaleString()}</span>
          <span>0</span>
        </div>
        <div
          className="relative h-48 touch-none"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
        >
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-border/60" />
            <div className="border-t border-dashed border-border/60" />
            <div className="border-t" />
          </div>
          {bonuses.map((bonus) => (
            <div
              key={`${bonus.elapsed}-${bonus.chain}`}
              className="pointer-events-none absolute inset-y-0 border-l-2 border-dotted border-primary/45"
              style={{ left: `${x(bonus.elapsed) / 10}%` }}
            >
              {bonus.chain >= LABELED_BONUS && (
                <span className="absolute -top-4 -translate-x-1/2 font-mono text-[9px] text-muted-foreground">
                  {bonus.chain.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          <svg
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={`Respect over the war: ours ${formatRespect(last.gained)}, theirs ${formatRespect(last.lost)}, ${bonuses.length} chain bonuses`}
          >
            <polyline
              points={path("lost")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-destructive"
            />
            <polyline
              points={path("gained")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-primary"
            />
          </svg>
          {hovered && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 border-l border-foreground/30"
                style={{ left: `${x(hovered.elapsed) / 10}%` }}
              />
              {(["gained", "lost"] as const).map((key) => (
                <span
                  key={key}
                  className={cn(
                    "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                    key === "gained" ? "bg-primary" : "bg-destructive",
                  )}
                  style={{ left: `${x(hovered.elapsed) / 10}%`, top: `${y(hovered[key])}%` }}
                />
              ))}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                  hovered.elapsed > duration / 2 ? "-translate-x-full -ml-2" : "ml-2",
                )}
                style={{ left: `${x(hovered.elapsed) / 10}%` }}
              >
                <div className="font-mono font-medium">{label(hovered.elapsed)}</div>
                <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums">
                  <span className="text-muted-foreground">Ours</span>
                  <span className="text-right">{formatRespect(hovered.gained)}</span>
                  <span className="text-muted-foreground">Theirs</span>
                  <span className="text-right">{formatRespect(hovered.lost)}</span>
                  <span className="text-muted-foreground">Lead</span>
                  <span className="text-right">{formatSigned(hovered.gained - hovered.lost)}</span>
                </div>
                {hoveredBonuses.length > 0 && (
                  <div className="mt-1.5 border-t pt-1.5">
                    {hoveredBonuses.map((bonus) => (
                      <div key={`${bonus.elapsed}-${bonus.chain}`} className="flex gap-2">
                        <span className="font-mono tabular-nums">
                          Chain {bonus.chain.toLocaleString()}
                        </span>
                        <span>{bonus.name}</span>
                        <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                          +{formatRespect(bonus.respect)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <span />
        <div className="relative h-3 font-mono text-[10px] text-muted-foreground">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={cn(
                "absolute",
                tick === 0
                  ? undefined
                  : tick === duration
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${x(tick) / 10}%` }}
            >
              {tick / HOUR}h
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] font-mono tabular-nums">
            <thead className="border-y bg-muted/35 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Into the war</th>
                <th className="px-3 py-1.5 text-right font-medium">Ours</th>
                <th className="px-3 py-1.5 text-right font-medium">Theirs</th>
                <th className="px-3 py-1.5 text-right font-medium">Lead</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...ticks.filter((tick) => tick < duration), duration].map((tick) => {
                const point = pointAt(points, tick);
                return (
                  <tr key={tick}>
                    <td className="px-3 py-1">{label(tick)}</td>
                    <td className="px-3 py-1 text-right">{formatRespect(point.gained)}</td>
                    <td className="px-3 py-1 text-right">{formatRespect(point.lost)}</td>
                    <td className="px-3 py-1 text-right">
                      {formatSigned(point.gained - point.lost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function NetRespectByHour({ hours }: { hours: HourOfDay[] }) {
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Average respect per war hour, by hour of the day.
            {best && worst && (
              <>
                {" "}
                Best hour {formatHour(best.hour)} ({formatSigned(best.net)}), worst{" "}
                {formatHour(worst.hour)} ({formatSigned(worst.net)}).
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-primary" /> Respect gained
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-destructive" /> Respect lost
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[2.75rem_1fr] gap-2">
        <div className="flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>+{scale}</span>
          <span>0</span>
          <span>−{scale}</span>
        </div>
        <div className="relative grid h-48 grid-cols-24 gap-0.5">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t" />
          {rows.map((row) => (
            <div
              key={row.hour}
              tabIndex={0}
              aria-label={
                row.liveHours
                  ? `${formatHour(row.hour)}: ${formatRespect(row.gained)} gained, ${formatRespect(row.lost)} lost per war hour`
                  : `${formatHour(row.hour)}: never at war`
              }
              className="group relative flex h-full flex-col items-center outline-none"
            >
              <div className="flex h-1/2 w-full items-end justify-center">
                <div
                  className="w-full max-w-6 rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary group-focus-visible:bg-primary"
                  style={{ height: `${(row.gained / scale) * 100}%` }}
                />
              </div>
              <div className="flex h-1/2 w-full items-start justify-center">
                {row.liveHours === 0 ? (
                  <span className="mt-1 size-1 rounded-full bg-muted-foreground/40" />
                ) : (
                  <div
                    className="w-full max-w-6 rounded-b-[4px] bg-destructive/75 transition-colors group-hover:bg-destructive group-focus-visible:bg-destructive"
                    style={{ height: `${(row.lost / scale) * 100}%` }}
                  />
                )}
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block">
                <div className="font-mono font-medium">{formatHour(row.hour)}</div>
                {row.liveHours === 0 ? (
                  <div className="text-muted-foreground">Never at war at this hour</div>
                ) : (
                  <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums">
                    <span className="text-muted-foreground">Gained</span>
                    <span className="text-right">{formatRespect(row.gained)}</span>
                    <span className="text-muted-foreground">Lost</span>
                    <span className="text-right">{formatRespect(row.lost)}</span>
                    <span className="text-muted-foreground">Net</span>
                    <span className="text-right">{formatSigned(row.net)}</span>
                    <span className="text-muted-foreground">Hits / taken</span>
                    <span className="text-right">
                      {row.hits} / {row.hitsTaken}
                    </span>
                    <span className="text-muted-foreground">War hours</span>
                    <span className="text-right">{row.liveHours}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <span />
        <div className="grid grid-cols-8 font-mono text-[10px] text-muted-foreground">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index}>{formatHour(index * 3)}</span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] font-mono tabular-nums">
            <thead className="border-y bg-muted/35 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Hour</th>
                <th className="px-3 py-1.5 text-right font-medium">War hours</th>
                <th className="px-3 py-1.5 text-right font-medium">Gained / h</th>
                <th className="px-3 py-1.5 text-right font-medium">Lost / h</th>
                <th className="px-3 py-1.5 text-right font-medium">Net / h</th>
                <th className="px-3 py-1.5 text-right font-medium">Hits</th>
                <th className="px-3 py-1.5 text-right font-medium">Hits taken</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.hour}>
                  <td className="px-3 py-1">{formatHour(row.hour)}</td>
                  <td className="px-3 py-1 text-right">{row.liveHours}</td>
                  <td className="px-3 py-1 text-right">{formatRespect(row.gained)}</td>
                  <td className="px-3 py-1 text-right">{formatRespect(row.lost)}</td>
                  <td className="px-3 py-1 text-right">{formatSigned(row.net)}</td>
                  <td className="px-3 py-1 text-right">{row.hits}</td>
                  <td className="px-3 py-1 text-right">{row.hitsTaken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

type HeatmapMetric = "attacks" | "hitsTaken";

export function DayHeatmap({ days }: { days: DayRow[] }) {
  const [metric, setMetric] = useState<HeatmapMetric>("attacks");
  const max = Math.max(1, ...days.flatMap((row) => row.hours.map((cell) => cell[metric])));
  const fill = metric === "attacks" ? "bg-primary" : "bg-destructive";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={metric}
          onValueChange={(value) => value && setMetric(value as HeatmapMetric)}
        >
          <ToggleGroupItem value="attacks">Our attacks</ToggleGroupItem>
          <ToggleGroupItem value="hitsTaken">Hits taken</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="grid size-2.5 place-items-center">
              <span className="size-1 rounded-full bg-muted-foreground/40" />
            </span>
            Outside war
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-muted" /> None
          </span>
          <span className="flex items-center gap-1.5">
            1
            <span className="flex gap-px">
              {[0.2, 0.4, 0.6, 0.8, 1].map((opacity) => (
                <span
                  key={opacity}
                  className={cn("size-2.5 rounded-[2px]", fill)}
                  style={{ opacity }}
                />
              ))}
            </span>
            {max}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="mb-2 grid grid-cols-[3.5rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[9px] text-muted-foreground">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className={cn("text-center", hour % 3 !== 0 && "opacity-0")}>
                {hour.toString().padStart(2, "0")}
              </span>
            ))}
          </div>
          <div className="space-y-0.5">
            {days.map(({ day, hours }) => (
              <div key={day} className="grid grid-cols-[3.5rem_repeat(24,minmax(0,1fr))] gap-0.5">
                <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                  {day.slice(5)}
                </span>
                {hours.map((cell, hour) => {
                  const value = cell[metric];
                  const outside = !cell.live && value === 0;
                  return (
                    <div
                      key={hour}
                      title={
                        outside
                          ? `${day} ${formatHour(hour)}: outside the war`
                          : `${day} ${formatHour(hour)}: ${cell.attacks} attacks, ${cell.hitsTaken} hits taken`
                      }
                      className={cn(
                        "grid aspect-square min-h-3 place-items-center rounded-[2px]",
                        outside ? undefined : value === 0 ? "bg-muted" : fill,
                      )}
                      style={value > 0 ? { opacity: 0.2 + (value / max) * 0.8 } : undefined}
                    >
                      {outside && <span className="size-1 rounded-full bg-muted-foreground/40" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
