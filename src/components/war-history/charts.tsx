import { useState } from "react";
import type { DayRow, HourOfDay } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { formatHour, formatRespect, formatSigned } from "./format";

function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function Swatch({ className }: { className: string }) {
  return <span className={cn("inline-block size-2.5 rounded-[2px]", className)} aria-hidden />;
}

export function NetRespectByHour({ hours }: { hours: HourOfDay[] }) {
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
          <h2 className="font-medium">Where the war score moves</h2>
          <p className="mt-1 text-xs text-muted-foreground">
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
