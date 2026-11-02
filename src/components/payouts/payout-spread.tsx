import { type PointerEvent, useState } from "react";
import type { PayoutMember } from "@/lib/payouts";
import { cn } from "@/lib/utils";
import { niceCeiling } from "../war-history/charts";

const compactMoney = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const formatCompactMoney = (amount: number) => `$${compactMoney.format(amount)}`;
const formatMoney = (amount: number) => `$${Math.floor(amount).toLocaleString()}`;

function median(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Every member's payout, lowest first, so the shape shows how evenly the pool is spread.
 * `members` comes in table order, highest first.
 */
export function PayoutSpread({ members, payout }: { members: PayoutMember[]; payout: number }) {
  const [active, setActive] = useState<number | null>(null);
  if (payout <= 0 || members.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Set a payout to see how it is spread.
      </p>
    );
  }

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
  const hovered = active === null ? null : ordered[active];

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    setActive(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        Lowest {formatMoney(amounts[0])} · median {formatMoney(middle)} · highest{" "}
        {formatMoney(highest)}. The top {topCount} {topCount === 1 ? "member gets" : "members get"}{" "}
        {Math.round(topShare * 100)}% of the payout.
      </p>

      <div className="grid grid-cols-[3.25rem_1fr] gap-2">
        <div className="flex h-48 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{formatCompactMoney(scale)}</span>
          <span>{formatCompactMoney(scale / 2)}</span>
          <span>$0</span>
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
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dotted border-foreground/40"
            style={{ top: `${y(middle)}%` }}
          >
            <span className="absolute -top-4 left-1 font-mono text-[9px] text-muted-foreground">
              median
            </span>
          </div>
          <svg
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={`Payouts for ${count} members, from ${formatMoney(amounts[0])} to ${formatMoney(highest)}, median ${formatMoney(middle)}`}
          >
            <path d={area} className="fill-primary/10" />
            <polyline
              points={line}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-primary"
            />
          </svg>
          {hovered && active !== null && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 border-l border-foreground/30"
                style={{ left: `${x(active) / 10}%` }}
              />
              <span
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                style={{ left: `${x(active) / 10}%`, top: `${y(hovered.payout)}%` }}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                  x(active) > 500 ? "-translate-x-full -ml-2" : "ml-2",
                )}
                style={{ left: `${x(active) / 10}%` }}
              >
                <div className="font-medium">{hovered.name}</div>
                <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 font-mono tabular-nums">
                  <span className="text-muted-foreground">Position</span>
                  <span className="text-right">
                    #{position(active)} of {count}
                  </span>
                  <span className="text-muted-foreground">Payout</span>
                  <span className="text-right">{formatMoney(hovered.payout)}</span>
                  <span className="text-muted-foreground">Share</span>
                  <span className="text-right">{(hovered.share * 100).toFixed(2)}%</span>
                  <span className="text-muted-foreground">Hits</span>
                  <span className="text-right">{hovered.hits.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
        <span />
        <div className="relative h-3 font-mono text-[10px] text-muted-foreground">
          {ticks.map((index) => (
            <span
              key={index}
              className={cn(
                "absolute whitespace-nowrap",
                index === 0
                  ? undefined
                  : index === count - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${x(index) / 10}%` }}
            >
              #{position(index)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-right text-[10px] text-muted-foreground">
        Table position, lowest paid on the left
      </p>
    </div>
  );
}
