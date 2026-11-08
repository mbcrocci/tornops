import type { ReactNode } from "react";
import { useUserData } from "@/hooks/use-torn";
import { useNowSeconds } from "@/hooks/use-now";
import { factionArmoryLink, inventoryLink } from "@/lib/links";
import { cleanStatusDescription, formatClock, formatSpan, getStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";
import { Panel } from "./panel";

const ENERGY_PER_HIT = 25;

const numberFormat = new Intl.NumberFormat("en-US");

/** Bars stay neutral until their value is worth worrying about. */
const NEUTRAL_FILL = "bg-muted-foreground/60";

function lifeFill(percent: number) {
  if (percent >= 60) return NEUTRAL_FILL;
  if (percent >= 35) return "bg-amber-500";
  return "bg-rose-500";
}

function KeyFigure({
  label,
  figure,
  unit,
  detail,
  percent,
  fillClassName,
}: {
  label: string;
  figure: ReactNode;
  unit?: string;
  detail: string;
  percent: number;
  fillClassName: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-sans text-2xl font-semibold leading-none tabular-nums tracking-tight">
        {figure}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", fillClassName)}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{detail}</div>
    </div>
  );
}

export function YouPanel() {
  const { data: user, error } = useUserData();
  const now = useNowSeconds();

  if (error) {
    return (
      <Panel className="col-span-2 md:col-span-1">
        <h2 className="text-sm font-semibold">You</h2>
        <p className="text-sm text-destructive">Your status could not be loaded: {error.message}</p>
      </Panel>
    );
  }

  // API errors are returned as JSON with a successful HTTP status. Do not try to
  // render an incomplete response, including one left in the query cache.
  if (!user?.life || !user.status || !user.cooldowns)
    return <Panel aria-busy className="col-span-2 h-36 md:col-span-1" />;

  const tone = getStatusTone(user.status.state);
  const life = user.life;
  const lifePercent = (life.current / life.maximum) * 100;
  const energy = user.energy;
  const hits = energy ? Math.floor(energy.current / ENERGY_PER_HIT) : 0;
  const medical = user.cooldowns.medical || 0;
  const statusText =
    user.status.state === "Hospital" && user.status.until > now
      ? `Hospital ${formatClock(user.status.until - now)}`
      : cleanStatusDescription(user.status.description) || user.status.state;

  return (
    <Panel aria-label="Your status" className="col-span-2 md:col-span-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">You</h2>
        <div className="flex shrink-0 gap-1.5">
          <a
            href={factionArmoryLink()}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm", className: "h-7 text-xs" })}
          >
            Armory
          </a>
          <a
            href={inventoryLink()}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm", className: "h-7 text-xs" })}
          >
            Items
          </a>
        </div>
      </div>
      {/* Your own status comes first: in hospital or abroad you cannot attack at all. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-base font-semibold ring-1 ring-inset",
          tone.pill,
        )}
        title={user.status.description}
      >
        <span className={cn("size-2.5 shrink-0 rounded-[3px]", tone.dot)} aria-hidden />
        <span className="sr-only">Status:</span>
        <span className="min-w-0 truncate tabular-nums">{statusText}</span>
      </div>
      {/* Below the sidebar layout, one line of the numbers that decide whether you can hit now. */}
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs xl:hidden">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Ready to attack</dt>
          <dd className="text-xl font-semibold tabular-nums">{hits}</dd>
          <span className="text-muted-foreground">{hits === 1 ? "hit" : "hits"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Life</dt>
          <dd
            className={cn(
              "text-xl font-semibold tabular-nums",
              lifePercent < 35 && "text-rose-600 dark:text-rose-400",
              lifePercent >= 35 && lifePercent < 60 && "text-amber-600 dark:text-amber-400",
            )}
          >
            {Math.round(lifePercent)}%
          </dd>
          <span className="text-muted-foreground">life</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">Med</dt>
          <dd className="tabular-nums">{medical > 0 ? formatSpan(medical) : "Ready"}</dd>
        </div>
        <div className="flex items-baseline gap-1.5 md:hidden">
          <dt className="text-muted-foreground">Drug</dt>
          <dd className="tabular-nums">
            {user.cooldowns.drug > 0 ? formatSpan(user.cooldowns.drug) : "Ready"}
          </dd>
        </div>
      </dl>
      <div className="hidden grid-cols-2 gap-x-5 gap-y-3 xl:grid">
        <KeyFigure
          label="Ready to attack"
          figure={hits}
          unit={hits === 1 ? "hit" : "hits"}
          detail={energy ? `${energy.current} / ${energy.maximum} energy` : "Energy unknown"}
          percent={energy ? (energy.current / energy.maximum) * 100 : 0}
          fillClassName={hits === 0 ? "bg-rose-500" : NEUTRAL_FILL}
        />
        <KeyFigure
          label="Life"
          figure={`${Math.round(lifePercent)}%`}
          detail={`${numberFormat.format(life.current)} / ${numberFormat.format(life.maximum)}`}
          percent={lifePercent}
          fillClassName={lifeFill(lifePercent)}
        />
      </div>
      <dl className="hidden grid-cols-1 gap-x-5 gap-y-1 text-xs xl:grid @[26rem]:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Medical cooldown</dt>
          <dd className="tabular-nums">{medical > 0 ? formatSpan(medical) : "Ready"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Drug cooldown</dt>
          <dd className="tabular-nums">
            {user.cooldowns.drug > 0 ? formatSpan(user.cooldowns.drug) : "Ready"}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
