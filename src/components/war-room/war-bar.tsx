import { useUserFactionData } from "@/hooks/use-torn";
import { useNowSeconds } from "@/hooks/use-now";
import type { Faction, FactionValue, War } from "@/lib/faction";
import { formatSpan } from "@/lib/status";
import { cn } from "@/lib/utils";

type Side = FactionValue & { id: number };
type CurrentWar = { war: War; us: Side; them: Side };

const numberFormat = new Intl.NumberFormat("en-US");

/** The most recent ranked war in the faction response, with our side first. */
export function getCurrentWar(faction: Faction | undefined): CurrentWar | undefined {
  if (!faction?.ranked_wars) return undefined;
  const latest = Object.values(faction.ranked_wars).sort((a, b) => b.war.start - a.war.start)[0];
  if (!latest) return undefined;
  const sides = Object.entries(latest.factions).map(([id, value]) => ({
    ...value,
    id: Number(id),
  }));
  const us = sides.find((side) => side.id === faction.ID);
  const them = sides.find((side) => side.id !== faction.ID);
  if (!us || !them) return undefined;
  return { war: latest.war, us, them };
}

function FactionScore({ side, align, tag }: { side: Side; align: "start" | "end"; tag: string }) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <div
        className={cn(
          "flex items-center gap-1.5 text-sm text-muted-foreground",
          align === "end" && "justify-end",
        )}
      >
        <span className="hidden shrink-0 rounded bg-muted px-1.5 text-[11px] font-medium text-foreground sm:inline">
          {tag}
        </span>
        <span className="truncate" title={side.name}>
          {side.name}
        </span>
      </div>
      <div className="font-sans text-2xl font-semibold leading-none tabular-nums tracking-tight">
        {numberFormat.format(side.score)}
      </div>
    </div>
  );
}

export function WarBar() {
  const { data: faction } = useUserFactionData();
  const now = useNowSeconds();
  const current = getCurrentWar(faction);

  // Between wars there is nothing to act on, so the bar disappears.
  if (!current) return null;
  const { war, us, them } = current;
  if (war.end > 0 && war.end <= now) return null;

  if (war.start > now) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2.5 text-sm">
        <span className="min-w-0 truncate">
          Ranked war against <span className="font-medium">{them.name}</span> starts in{" "}
          <span className="font-semibold tabular-nums">{formatSpan(war.start - now)}</span>
        </span>
        <span className="text-muted-foreground">Target {numberFormat.format(war.target)}</span>
      </div>
    );
  }

  const lead = us.score - them.score;
  const progress = war.target > 0 ? Math.min(1, Math.abs(lead) / war.target) : 0;
  const leadLabel =
    lead === 0
      ? "Scores level"
      : `${lead > 0 ? "Ahead" : "Behind"} by ${numberFormat.format(Math.abs(lead))}`;

  return (
    <section
      aria-label="Ranked war score"
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
    >
      <div className="grid min-w-0 flex-1 grid-cols-2 items-end gap-x-6 gap-y-3 md:grid-cols-[fit-content(14rem)_minmax(0,1fr)_fit-content(14rem)] md:items-center md:gap-x-8">
        <FactionScore side={us} align="start" tag="Us" />
        <div className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "text-xl font-semibold leading-none tabular-nums tracking-tight sm:text-2xl",
                lead > 0 && "text-emerald-600 dark:text-emerald-400",
                lead < 0 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {leadLabel}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {lead >= 0
                ? `${numberFormat.format(Math.max(0, war.target - lead))} more lead to win`
                : `they need ${numberFormat.format(Math.max(0, war.target + lead))} more`}
            </span>
          </div>
          {/* Whoever leads fills the bar; it is full when their lead reaches the target. */}
          <div
            className="h-3 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Lead towards the war target"
            aria-valuemin={0}
            aria-valuemax={war.target}
            aria-valuenow={Math.abs(lead)}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                lead >= 0 ? "bg-emerald-500" : "bg-rose-500",
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            {/* The bar's end is the target, so it reads as lead towards a goal, not a score share. */}
            <span>War time {formatSpan(now - war.start)}</span>
            <span>Target {numberFormat.format(war.target)}</span>
          </div>
        </div>
        <FactionScore side={them} align="end" tag="Enemy" />
      </div>
    </section>
  );
}
