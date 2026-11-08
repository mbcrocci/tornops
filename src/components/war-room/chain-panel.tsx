import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { useEnemyFactionChain, useUserFactionChain } from "@/hooks/use-torn";
import { useNowSeconds } from "@/hooks/use-now";
import type { FactionChain } from "@/lib/faction";
import { formatClock, formatSpan } from "@/lib/status";
import { cn } from "@/lib/utils";
import { getChainUrgency } from "../chain-watcher";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Panel } from "./panel";

const numberFormat = new Intl.NumberFormat("en-US");

const urgencyText = {
  normal: "text-foreground",
  // The chain alarm stays in the red family, so it never reads as the theme's accent colour.
  warning: "text-rose-500 dark:text-rose-300",
  danger: "text-rose-600 dark:text-rose-400",
  critical: "text-rose-600 dark:text-rose-400",
} as const;

const urgencyFill = {
  normal: "bg-muted-foreground/60",
  warning: "bg-rose-400",
  danger: "bg-rose-500",
  critical: "bg-rose-500",
} as const;

type ChainResponse = { chain?: FactionChain; error?: { error?: string } } | undefined;

function ChainBody({
  response,
  fetchedAt,
  ours,
}: {
  response: ChainResponse;
  fetchedAt: number;
  ours: boolean;
}) {
  const now = useNowSeconds();
  const chain = response?.chain;
  if (!response) return <div className="h-14" aria-busy />;
  if (!chain) {
    return (
      <p className="flex flex-1 items-center text-sm text-muted-foreground">
        Chain unavailable: {response.error?.error ?? "Torn returned no chain data"}.
      </p>
    );
  }

  // The timeout counts down from the moment the response arrived.
  const remaining = chain.timeout > 0 ? chain.timeout - (now - Math.floor(fetchedAt / 1000)) : 0;
  const isRunning = chain.current > 0 && remaining > 0;

  if (!isRunning) {
    return (
      <div className="flex flex-1 flex-col justify-center text-sm text-muted-foreground">
        <span>No chain running.</span>
        {chain.cooldown > 0 && (
          <span className="text-xs">Cooldown {formatSpan(chain.cooldown)}</span>
        )}
      </div>
    );
  }

  // Our chain is ours to save. Theirs about to drop is an opening, not a threat.
  const urgency = ours ? getChainUrgency(remaining) : "normal";
  const theirsDropping = !ours && remaining < 60;
  const percent = chain.max > 0 ? Math.min(100, (chain.current / chain.max) * 100) : 0;
  const toNext = chain.max - chain.current;

  return (
    <>
      {/* Narrow cards (phones) stack the count over the timer so the two never touch. */}
      <div className="flex flex-col gap-1.5 @[13rem]:flex-row @[13rem]:items-end @[13rem]:justify-between @[13rem]:gap-3">
        <div className="font-sans leading-none tabular-nums">
          {/* The timer is what you act on, so the hit count stays a step smaller. */}
          <span className="text-lg font-semibold tracking-tight @[15rem]:text-2xl">
            {numberFormat.format(chain.current)}
          </span>
          <span className="text-xs text-muted-foreground @[15rem]:text-sm">
            {" "}
            / {numberFormat.format(chain.max)}
          </span>
        </div>
        <div className="@[13rem]:text-right">
          <div
            className={cn(
              // Their timer is one weight lighter: worth seeing, but ours is the one to act on.
              "font-sans leading-none tabular-nums tracking-tight",
              // Same size for both; colour and weight carry which one needs you.
              "text-2xl @[15rem]:text-4xl",
              ours ? "font-semibold" : "font-medium",
              theirsDropping
                ? "text-emerald-600/90 dark:text-emerald-400/85"
                : urgencyText[urgency],
            )}
            aria-label={`Chain times out in ${formatSpan(remaining)}`}
          >
            {formatClock(remaining)}
          </div>
        </div>
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              urgencyFill[urgency],
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground tabular-nums">
          <span className={cn(theirsDropping && "text-emerald-600 dark:text-emerald-400")}>
            {theirsDropping
              ? "About to drop"
              : toNext > 0
                ? `${numberFormat.format(toNext)} ${toNext === 1 ? "hit" : "hits"} to ${numberFormat.format(chain.max)}`
                : ""}
          </span>
          {chain.modifier > 0 && <span>Respect ×{chain.modifier}</span>}
        </div>
      </div>
    </>
  );
}

export function OurChainPanel() {
  const { data, dataUpdatedAt } = useUserFactionChain();
  const now = useNowSeconds();
  const chain = data?.chain;
  const remaining =
    chain && chain.timeout > 0 ? chain.timeout - (now - Math.floor(dataUpdatedAt / 1000)) : 0;
  const urgency = chain && chain.current > 0 ? getChainUrgency(remaining) : "normal";

  return (
    <Panel
      aria-label="Our chain"
      className={cn(
        urgency === "warning" && "border-rose-400/60 bg-rose-500/[0.05]",
        urgency === "danger" && "border-rose-500/70",
        urgency === "critical" && "chain-critical-flash border-rose-500",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Our chain</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="-my-1.5 -mr-1.5 text-muted-foreground"
            >
              <Link to="/chain-watcher" aria-label="Open chain watcher">
                <Radio />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open chain watcher</TooltipContent>
        </Tooltip>
      </div>
      <ChainBody response={data as ChainResponse} fetchedAt={dataUpdatedAt} ours />
    </Panel>
  );
}

export function EnemyChainPanel() {
  const { data, dataUpdatedAt } = useEnemyFactionChain();
  return (
    <Panel aria-label="Enemy chain">
      <h2 className="text-sm font-semibold">Their chain</h2>
      <ChainBody response={data as ChainResponse} fetchedAt={dataUpdatedAt} ours={false} />
    </Panel>
  );
}
