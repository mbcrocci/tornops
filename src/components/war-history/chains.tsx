import { ChevronRight, Link2 } from "lucide-react";
import { Fragment, type PointerEvent, useMemo, useState } from "react";
import type { FactionAttack } from "@/lib/faction";
import { type ChainSummary, summarizeChains } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { formatDateTime, formatDuration, formatRespect } from "./format";

type Side = "ours" | "theirs";

// Gaps past four minutes left less than a minute on the chain timer.
const CLOSE_CALL_SECONDS = 4 * 60;
const CHAIN_TIMEOUT = 5 * 60;
// Chains that never reached the first bonus are listed only on request.
const SHORT_CHAIN = 10;

export function Chains({
  outgoing,
  incoming,
  timeZone,
}: {
  outgoing: FactionAttack[];
  incoming: FactionAttack[];
  timeZone: string;
}) {
  const [side, setSide] = useState<Side>("ours");
  const [showShort, setShowShort] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const ours = useMemo(() => summarizeChains(outgoing), [outgoing]);
  const theirs = useMemo(() => summarizeChains(incoming), [incoming]);
  const chains = side === "ours" ? ours : theirs;
  const longest = Math.max(0, ...chains.map((chain) => chain.length));
  const shortChains = chains.filter((chain) => chain.length < SHORT_CHAIN).length;
  const rows = showShort ? chains : chains.filter((chain) => chain.length >= SHORT_CHAIN);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" /> Chains
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {chains.length} {chains.length === 1 ? "chain" : "chains"}
              {chains.length > 0 && `, longest ${longest.toLocaleString()} hits`}. Only war hits are
              loaded, so gaps may hide hits on other targets.
            </p>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={side}
            onValueChange={(value) => {
              if (!value) return;
              setSide(value as Side);
              setShowShort(false);
              setOpen(null);
            }}
          >
            <ToggleGroupItem value="ours">Ours</ToggleGroupItem>
            <ToggleGroupItem value="theirs">Theirs</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {chains.length === 0
              ? "No chain hits in the war."
              : `No chain reached ${SHORT_CHAIN} hits.`}
          </p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-3 py-2 text-right font-medium">Length</th>
                <th className="px-3 py-2 text-right font-medium">Duration</th>
                <th className="px-3 py-2 text-right font-medium">War hits</th>
                <th className="px-3 py-2 text-right font-medium">Respect</th>
                <th className="px-3 py-2 text-right font-medium">Longest gap</th>
                <th className="px-3 py-2 font-medium">Bonus hits</th>
                <th className="px-4 py-2 font-medium">Top hitters</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((chain) => (
                <Fragment key={chain.started}>
                  <tr
                    className={cn(
                      "cursor-pointer hover:bg-muted/25",
                      open === chain.started && "bg-muted/25",
                    )}
                    onClick={() => setOpen(open === chain.started ? null : chain.started)}
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                      <button
                        type="button"
                        className="flex items-center gap-1.5"
                        aria-expanded={open === chain.started}
                      >
                        <ChevronRight
                          className={cn(
                            "size-3.5 text-muted-foreground transition-transform",
                            open === chain.started && "rotate-90",
                          )}
                        />
                        {formatDateTime(chain.started, timeZone)}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium tabular-nums">
                      {chain.length.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDuration(chain.ended - chain.started)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {chain.warHits.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatRespect(chain.respect)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono text-xs tabular-nums",
                        chain.longestGap >= CLOSE_CALL_SECONDS && chain.longestGap < CHAIN_TIMEOUT
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                      title={
                        chain.longestGap >= CHAIN_TIMEOUT
                          ? "Hits outside the war kept the chain alive in between"
                          : undefined
                      }
                    >
                      {chain.warHits < 2
                        ? "–"
                        : chain.longestGap >= CHAIN_TIMEOUT
                          ? "5m+"
                          : formatDuration(chain.longestGap)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {chain.bonusHits.length === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        chain.bonusHits.map((bonus) => (
                          <div key={bonus.chain} className="whitespace-nowrap">
                            <span className="font-mono tabular-nums">
                              {bonus.chain.toLocaleString()}
                            </span>{" "}
                            {bonus.name}{" "}
                            <span className="font-mono text-muted-foreground">
                              {formatRespect(bonus.respect)}
                            </span>
                          </div>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {chain.hitters
                        .slice(0, 3)
                        .map((hitter) => `${hitter.name} ${hitter.hits}`)
                        .join(" · ")}
                      {chain.hitters.length > 3 && ` · +${chain.hitters.length - 3}`}
                    </td>
                  </tr>
                  {open === chain.started && (
                    <tr>
                      <td colSpan={8} className="bg-muted/15 px-4 py-4">
                        <ChainDetail chain={chain} timeZone={timeZone} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {shortChains > 0 && (
          <div className="flex justify-center pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowShort(!showShort)}>
              {showShort
                ? `Hide chains under ${SHORT_CHAIN} hits`
                : `Show ${shortChains} ${shortChains === 1 ? "chain" : "chains"} under ${SHORT_CHAIN} hits`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Time left on the chain timer when the hit landed.
const CLOSE_CALLS = [
  { key: "under60", label: "Under 1 min left" },
  { key: "under45", label: "Under 45s left" },
  { key: "under30", label: "Under 30s left" },
] as const;

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

function ChainDetail({ chain, timeZone }: { chain: ChainSummary; timeZone: string }) {
  const [active, setActive] = useState<number | null>(null);
  const timed = chain.warHits - 1;
  const duration = Math.max(chain.ended - chain.started, 1);
  const x = (ended: number) => ((ended - chain.started) / duration) * 1000;
  // Chain count across the top panel, time between hits in the bottom one.
  const countY = (count: number) => 100 - (count / chain.length) * 100;
  const gapY = (gap: number) => 100 - (Math.min(gap, CHAIN_TIMEOUT) / CHAIN_TIMEOUT) * 100;
  const hovered = active === null ? null : chain.hits[active];
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = chain.started + ((event.clientX - bounds.left) / bounds.width) * duration;
    let nearest = 0;
    chain.hits.forEach((hit, index) => {
      if (Math.abs(hit.ended - pointer) < Math.abs(chain.hits[nearest].ended - pointer)) {
        nearest = index;
      }
    });
    setActive(nearest);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CLOSE_CALLS.map((closeCall) => (
          <div key={closeCall.key} className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs text-muted-foreground">{closeCall.label}</div>
            <div
              className={cn(
                "font-mono text-lg font-medium tabular-nums",
                chain.closeCalls[closeCall.key] > 0 && "text-destructive",
              )}
            >
              {chain.closeCalls[closeCall.key].toLocaleString()}
            </div>
          </div>
        ))}
        <div className="rounded-md border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Average pace</div>
          <div className="font-mono text-lg font-medium tabular-nums">
            {timed > 0 ? formatDuration((chain.ended - chain.started) / timed) : "–"}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Hits that landed with little time left on the 5 minute chain timer, counted from the
        previous war hit across {timed.toLocaleString()} {timed === 1 ? "gap" : "gaps"}. Hits on
        other targets aren't loaded, so some of these may have been safer than they look.
      </p>

      {chain.hits.length > 1 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-primary" aria-hidden /> Chain count
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-primary/60" aria-hidden /> 1 min+ left
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-destructive/35" aria-hidden /> Under 1 min
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-destructive/65" aria-hidden /> Under 45s
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-destructive" aria-hidden /> Under 30s
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-muted-foreground/20" aria-hidden /> Over 5
              min, kept going by other hits
            </span>
          </div>
          <div className="grid grid-cols-[3.25rem_1fr] gap-2">
            <div className="flex h-56 flex-col text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              <div className="flex h-32 flex-col justify-between">
                <span>{chain.length.toLocaleString()}</span>
                <span>0</span>
              </div>
              <div className="mt-4 flex h-20 flex-col justify-between">
                <span>5m+</span>
                <span>0</span>
              </div>
            </div>
            <div
              className="relative h-56 touch-none"
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={() => setActive(null)}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 border-b" />
              <svg
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                className="absolute inset-x-0 top-0 h-32 w-full overflow-visible"
                role="img"
                aria-label={`Chain count over ${formatDuration(duration)}, reaching ${chain.length}`}
              >
                <polyline
                  points={chain.hits.map((hit) => `${x(hit.ended)},${countY(hit.chain)}`).join(" ")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-primary"
                />
              </svg>
              {chain.hits
                .filter((hit) => hit.bonus)
                .map((hit) => (
                  <span
                    key={hit.chain}
                    className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                    style={{
                      left: `${x(hit.ended) / 10}%`,
                      top: `${(countY(hit.chain) / 100) * 8}rem`,
                    }}
                  />
                ))}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 border-b" />
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-destructive/40"
                style={{ bottom: `${(CLOSE_CALL_SECONDS / CHAIN_TIMEOUT) * 5}rem` }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
                style={{ bottom: `${(60 / CHAIN_TIMEOUT) * 5}rem` }}
              />
              <svg
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                className="absolute inset-x-0 bottom-0 h-20 w-full overflow-visible"
                role="img"
                aria-label={`Time between war hits: ${chain.closeCalls.under60} landed with under a minute left`}
              >
                {chain.hits.map((hit) =>
                  hit.gap === null ? null : (
                    <line
                      key={hit.ended + hit.chain}
                      x1={x(hit.ended)}
                      x2={x(hit.ended)}
                      y1={100}
                      y2={Math.min(gapY(hit.gap), 98)}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      className={gapColor(hit.gap)}
                    />
                  ),
                )}
              </svg>
              {hovered && (
                <>
                  <div
                    className="pointer-events-none absolute inset-y-0 border-l border-foreground/30"
                    style={{ left: `${x(hovered.ended) / 10}%` }}
                  />
                  <div
                    className={cn(
                      "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                      x(hovered.ended) > 500 ? "-translate-x-full -ml-2" : "ml-2",
                    )}
                    style={{ left: `${x(hovered.ended) / 10}%` }}
                  >
                    <div className="font-mono font-medium">
                      {formatDateTime(hovered.ended, timeZone)}
                    </div>
                    <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums">
                      <span className="text-muted-foreground">Hit</span>
                      <span className="text-right">
                        {hovered.chain.toLocaleString()}
                        {hovered.bonus && " bonus"}
                      </span>
                      <span className="text-muted-foreground">By</span>
                      <span className="text-right font-sans">{hovered.name}</span>
                      <span className="text-muted-foreground">Gap</span>
                      <span className="text-right">
                        {hovered.gap === null ? "First" : formatDuration(hovered.gap)}
                      </span>
                      {hovered.gap !== null && hovered.gap < CHAIN_TIMEOUT && (
                        <>
                          <span className="text-muted-foreground">Timer left</span>
                          <span className="text-right">
                            {formatDuration(CHAIN_TIMEOUT - hovered.gap)}
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground">Respect</span>
                      <span className="text-right">{formatRespect(hovered.respect)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <span />
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>0</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
