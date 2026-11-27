import type { Html } from "@effect/ui/html";
import { decodeHTML } from "entities";
import { Radio, Swords } from "lucide";
import { getChainUrgency } from "@/lib/chain";
import type { Faction, FactionChain, FactionValue, War } from "@/lib/faction";
import { factionArmoryLink, inventoryLink, playerAttackLink } from "@/lib/links";
import { cleanStatusDescription, formatClock, formatSpan, getStatusTone } from "@/lib/status";
import type { User } from "@/lib/user";
import { cn } from "@/lib/utils";
import { AppRoute } from "@/routes";
import { Icon } from "../ui/icon";
import { buttonClass } from "../ui/primitives";
import type { FactionMember } from "./roster";

const numberFormat = new Intl.NumberFormat("en-US");

export const Panel = <M>(h: Html.H<M>, className?: string | false) =>
  h.section.class(
    cn("@container flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4", className),
  );

// ---------------------------------------------------------------------------
// You
// ---------------------------------------------------------------------------

const ENERGY_PER_HIT = 25;
/** Bars stay neutral until their value is worth worrying about. */
const NEUTRAL_FILL = "bg-muted-foreground/60";

const lifeFill = (percent: number) =>
  percent >= 60 ? NEUTRAL_FILL : percent >= 35 ? "bg-amber-500" : "bg-rose-500";

const KeyFigure = <M>(
  h: Html.H<M>,
  options: {
    readonly label: string;
    readonly figure: string;
    readonly unit?: string;
    readonly detail: string;
    readonly percent: number;
    readonly fill: string;
  },
) =>
  h.div
    .class("min-w-0")
    .children(
      h.div.class("text-xs text-muted-foreground").children(options.label),
      h.div
        .class("mt-1 font-sans text-2xl font-semibold leading-none tabular-nums tracking-tight")
        .children(
          options.figure,
          options.unit &&
            h.span.class("ml-1 text-sm font-normal text-muted-foreground").children(options.unit),
        ),
      h.div
        .class("mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted")
        .children(
          h.div
            .class(cn("h-full rounded-full transition-[width] duration-500", options.fill))
            .style({ width: `${Math.max(0, Math.min(100, options.percent))}%` }),
        ),
      h.div
        .class("mt-1 truncate text-xs text-muted-foreground tabular-nums")
        .children(options.detail),
    );

const SmallLink = <M>(h: Html.H<M>, href: string, label: string) =>
  h.a
    .attrs({ href, target: "_blank", rel: "noopener noreferrer" })
    .class(buttonClass({ variant: "outline", size: "sm", class: "h-7 text-xs" }))
    .children(label);

const cooldown = (seconds: number) => (seconds > 0 ? formatSpan(seconds) : "Ready");

export const YouPanel = <M>(
  h: Html.H<M>,
  user: User | undefined,
  error: string | undefined,
  now: number,
) => {
  if (error && !user)
    return Panel(h, "col-span-2 md:col-span-1").children(
      h.h2.class("text-sm font-semibold").children("You"),
      h.p.class("text-sm text-destructive").children(`Your status could not be loaded: ${error}`),
    );
  // API errors are returned as JSON with a successful HTTP status. Do not try to render an
  // incomplete response.
  if (!user?.life || !user.status || !user.cooldowns)
    return Panel(h, "col-span-2 h-36 md:col-span-1").attr("aria-busy", "true");

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

  return Panel(h, "col-span-2 md:col-span-1")
    .attr("aria-label", "Your status")
    .children(
      h.div
        .class("flex items-center justify-between gap-2")
        .children(
          h.h2.class("text-sm font-semibold").children("You"),
          h.div
            .class("flex shrink-0 gap-1.5")
            .children(
              SmallLink(h, factionArmoryLink(), "Armory"),
              SmallLink(h, inventoryLink(), "Items"),
            ),
        ),
      // Your own status comes first: in hospital or abroad you cannot attack at all.
      h.div
        .class(
          cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-base font-semibold ring-1 ring-inset",
            tone.pill,
          ),
        )
        .attr("title", user.status.description)
        .children(
          h.span.class(cn("size-2.5 shrink-0 rounded-[3px]", tone.dot)).attr("aria-hidden", "true"),
          h.span.class("sr-only").children("Status:"),
          h.span.class("min-w-0 truncate tabular-nums").children(statusText),
        ),
      // Below the sidebar layout, one line of the numbers that decide whether you can hit now.
      h.dl
        .class("flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs xl:hidden")
        .children(
          h.div
            .class("flex items-baseline gap-1.5")
            .children(
              h.dt.class("sr-only").children("Ready to attack"),
              h.dd.class("text-xl font-semibold tabular-nums").children(String(hits)),
              h.span.class("text-muted-foreground").children(hits === 1 ? "hit" : "hits"),
            ),
          h.div
            .class("flex items-baseline gap-1.5")
            .children(
              h.dt.class("sr-only").children("Life"),
              h.dd
                .class(
                  cn(
                    "text-xl font-semibold tabular-nums",
                    lifePercent < 35 && "text-rose-600 dark:text-rose-400",
                    lifePercent >= 35 && lifePercent < 60 && "text-amber-600 dark:text-amber-400",
                  ),
                )
                .children(`${Math.round(lifePercent)}%`),
              h.span.class("text-muted-foreground").children("life"),
            ),
          h.div
            .class("flex items-baseline gap-1.5")
            .children(
              h.dt.class("text-muted-foreground").children("Med"),
              h.dd.class("tabular-nums").children(cooldown(medical)),
            ),
          h.div
            .class("flex items-baseline gap-1.5 md:hidden")
            .children(
              h.dt.class("text-muted-foreground").children("Drug"),
              h.dd.class("tabular-nums").children(cooldown(user.cooldowns.drug)),
            ),
        ),
      h.div.class("hidden grid-cols-2 gap-x-5 gap-y-3 xl:grid").children(
        KeyFigure(h, {
          label: "Ready to attack",
          figure: String(hits),
          unit: hits === 1 ? "hit" : "hits",
          detail: energy ? `${energy.current} / ${energy.maximum} energy` : "Energy unknown",
          percent: energy ? (energy.current / energy.maximum) * 100 : 0,
          fill: hits === 0 ? "bg-rose-500" : NEUTRAL_FILL,
        }),
        KeyFigure(h, {
          label: "Life",
          figure: `${Math.round(lifePercent)}%`,
          detail: `${numberFormat.format(life.current)} / ${numberFormat.format(life.maximum)}`,
          percent: lifePercent,
          fill: lifeFill(lifePercent),
        }),
      ),
      h.dl
        .class("hidden grid-cols-1 gap-x-5 gap-y-1 text-xs xl:grid @[26rem]:grid-cols-2")
        .children(
          h.div
            .class("flex justify-between gap-2")
            .children(
              h.dt.class("text-muted-foreground").children("Medical cooldown"),
              h.dd.class("tabular-nums").children(cooldown(medical)),
            ),
          h.div
            .class("flex justify-between gap-2")
            .children(
              h.dt.class("text-muted-foreground").children("Drug cooldown"),
              h.dd.class("tabular-nums").children(cooldown(user.cooldowns.drug)),
            ),
        ),
    );
};

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

const URGENCY_TEXT = {
  normal: "text-foreground",
  // The chain alarm stays in the red family, so it never reads as the theme's accent colour.
  warning: "text-rose-500 dark:text-rose-300",
  danger: "text-rose-600 dark:text-rose-400",
  critical: "text-rose-600 dark:text-rose-400",
} as const;

const URGENCY_FILL = {
  normal: "bg-muted-foreground/60",
  warning: "bg-rose-400",
  danger: "bg-rose-500",
  critical: "bg-rose-500",
} as const;

export type ChainResponse = { chain?: FactionChain; error?: { error?: string } };

/** Seconds until the chain times out, counted from when the response arrived. */
export const chainRemaining = (
  chain: FactionChain | undefined,
  fetchedAtMs: number,
  now: number,
): number =>
  chain && chain.timeout > 0 ? chain.timeout - (now - Math.floor(fetchedAtMs / 1000)) : 0;

const ChainBody = <M>(
  h: Html.H<M>,
  response: ChainResponse | undefined,
  fetchedAt: number,
  now: number,
  ours: boolean,
) => {
  const chain = response?.chain;
  if (!response) return h.div.class("h-14").attr("aria-busy", "true");
  if (!chain)
    return h.p
      .class("flex flex-1 items-center text-sm text-muted-foreground")
      .children(`Chain unavailable: ${response.error?.error ?? "Torn returned no chain data"}.`);

  const remaining = chainRemaining(chain, fetchedAt, now);
  if (!(chain.current > 0 && remaining > 0))
    return h.div
      .class("flex flex-1 flex-col justify-center text-sm text-muted-foreground")
      .children(
        h.span.children("No chain running."),
        chain.cooldown > 0 &&
          h.span.class("text-xs").children(`Cooldown ${formatSpan(chain.cooldown)}`),
      );

  // Our chain is ours to save. Theirs about to drop is an opening, not a threat.
  const urgency = ours ? getChainUrgency(remaining) : "normal";
  const theirsDropping = !ours && remaining < 60;
  const percent = chain.max > 0 ? Math.min(100, (chain.current / chain.max) * 100) : 0;
  const toNext = chain.max - chain.current;

  return h.div.class("contents").children(
    // Narrow cards (phones) stack the count over the timer so the two never touch.
    h.div
      .class(
        "flex flex-col gap-1.5 @[13rem]:flex-row @[13rem]:items-end @[13rem]:justify-between @[13rem]:gap-3",
      )
      .children(
        h.div.class("font-sans leading-none tabular-nums").children(
          // The timer is what you act on, so the hit count stays a step smaller.
          h.span
            .class("text-lg font-semibold tracking-tight @[15rem]:text-2xl")
            .children(numberFormat.format(chain.current)),
          h.span
            .class("text-xs text-muted-foreground @[15rem]:text-sm")
            .children(` / ${numberFormat.format(chain.max)}`),
        ),
        h.div.class("@[13rem]:text-right").children(
          h.div
            .class(
              cn(
                "font-sans leading-none tabular-nums tracking-tight",
                "text-2xl @[15rem]:text-4xl",
                ours ? "font-semibold" : "font-medium",
                theirsDropping
                  ? "text-emerald-600/90 dark:text-emerald-400/85"
                  : URGENCY_TEXT[urgency],
              ),
            )
            .attr("aria-label", `Chain times out in ${formatSpan(remaining)}`)
            .children(formatClock(remaining)),
        ),
      ),
    h.div.children(
      h.div
        .class("h-1.5 overflow-hidden rounded-full bg-muted")
        .children(
          h.div
            .class(cn("h-full rounded-full transition-[width] duration-500", URGENCY_FILL[urgency]))
            .style({ width: `${percent}%` }),
        ),
      h.div
        .class(
          "mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground tabular-nums",
        )
        .children(
          h.span
            .class(cn(theirsDropping && "text-emerald-600 dark:text-emerald-400"))
            .children(
              theirsDropping
                ? "About to drop"
                : toNext > 0
                  ? `${numberFormat.format(toNext)} ${toNext === 1 ? "hit" : "hits"} to ${numberFormat.format(chain.max)}`
                  : "",
            ),
          chain.modifier > 0 && h.span.children(`Respect ×${chain.modifier}`),
        ),
    ),
  );
};

export const OurChainPanel = <M>(
  h: Html.H<M>,
  response: ChainResponse | undefined,
  fetchedAt: number,
  now: number,
) => {
  const chain = response?.chain;
  const urgency =
    chain && chain.current > 0 ? getChainUrgency(chainRemaining(chain, fetchedAt, now)) : "normal";
  return Panel(
    h,
    cn(
      urgency === "warning" && "border-rose-400/60 bg-rose-500/[0.05]",
      urgency === "danger" && "border-rose-500/70",
      urgency === "critical" && "chain-critical-flash border-rose-500",
    ),
  )
    .attr("aria-label", "Our chain")
    .children(
      h.div.class("flex items-center justify-between gap-2").children(
        h.h2.class("text-sm font-semibold").children("Our chain"),
        h.a
          .attrs({
            href: AppRoute.print(AppRoute.ChainWatcher()),
            "aria-label": "Open chain watcher",
            title: "Open chain watcher",
          })
          .class(
            buttonClass({
              variant: "ghost",
              size: "icon-sm",
              class: "-my-1.5 -mr-1.5 text-muted-foreground",
            }),
          )
          .children(Icon(h, Radio)),
      ),
      ChainBody(h, response, fetchedAt, now, true),
    );
};

export const EnemyChainPanel = <M>(
  h: Html.H<M>,
  response: ChainResponse | undefined,
  fetchedAt: number,
  now: number,
) =>
  Panel(h)
    .attr("aria-label", "Enemy chain")
    .children(
      h.h2.class("text-sm font-semibold").children("Their chain"),
      ChainBody(h, response, fetchedAt, now, false),
    );

// ---------------------------------------------------------------------------
// Out of hospital next
// ---------------------------------------------------------------------------

// Three is enough to plan the next hits without repeating the roster's hospital section.
const SHOWN = 3;
/** Same window the roster uses to call a release imminent. */
const RELEASE_SOON_SECONDS = 120;

/** The enemies who become hittable next, so you can be on their attack page when they do. */
export const NextOutPanel = <M>(
  h: Html.H<M>,
  members: ReadonlyArray<FactionMember>,
  now: number,
  className?: string,
) => {
  const upcoming = members
    .filter((member) => member.status.state === "Hospital" && member.status.until > now)
    .sort((a, b) => a.status.until - b.status.until)
    .slice(0, SHOWN);
  if (!upcoming.length) return null;
  const tone = getStatusTone("Hospital");

  return Panel(
    h,
    cn(
      "gap-2 py-2 sm:py-2 xl:py-4",
      "md:flex-row md:items-center md:gap-4",
      "xl:flex-col xl:items-stretch xl:gap-2",
      className,
    ),
  )
    .attr("aria-label", "Out of hospital next")
    .children(
      h.h2.class("shrink-0 text-sm font-semibold").children("Out of hospital next"),
      h.ol.class("flex gap-x-10 overflow-hidden xl:flex-col xl:gap-x-0").children(
        upcoming.map((member) => {
          const remaining = member.status.until - now;
          const soon = remaining <= RELEASE_SOON_SECONDS;
          const ff = member.ffs?.fair_fight;
          return h.li
            .key(String(member.id))
            .class("xl:w-full")
            .children(
              // The whole row opens the attack page, ready for the moment they are out.
              h.a
                .attrs({
                  href: playerAttackLink(member.id),
                  target: "_blank",
                  rel: "noopener noreferrer",
                  title: `Open the attack page for ${member.name}`,
                })
                .class(
                  "group/next -mx-1.5 flex items-center gap-2 rounded-md xl:gap-3 px-1.5 py-1 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                )
                .children(
                  h.span
                    .class(
                      cn(
                        "shrink-0 rounded tabular-nums xl:w-[4.25rem]",
                        // Neutral until the release is close; colour means "get ready".
                        soon
                          ? cn("px-1.5 font-semibold ring-1 ring-inset", tone.pill)
                          : "text-foreground",
                      ),
                    )
                    .children(formatClock(remaining)),
                  h.span.class("min-w-0 truncate font-medium xl:flex-1").children(member.name),
                  ff
                    ? h.span
                        .class("hidden text-xs tabular-nums xl:inline text-muted-foreground")
                        .children(`FF ${ff.toFixed(2)}`)
                    : null,
                  h.span
                    .class(
                      "ml-1 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground group-hover/next:border-primary/60 group-hover/next:text-foreground",
                    )
                    .children(Icon(h, Swords, { class: "size-3.5" })),
                ),
            );
        }),
      ),
    );
};

// ---------------------------------------------------------------------------
// War bar
// ---------------------------------------------------------------------------

type Side = FactionValue & { id: number };
type CurrentWar = { war: War; us: Side; them: Side };

/** The most recent ranked war in the faction response, with our side first. */
export function getCurrentWar(faction: Faction | undefined): CurrentWar | undefined {
  if (!faction?.ranked_wars) return undefined;
  const latest = Object.values(faction.ranked_wars).sort((a, b) => b.war.start - a.war.start)[0];
  if (!latest) return undefined;
  const sides = Object.entries(latest.factions).map(([id, value]) => ({
    ...value,
    name: decodeHTML(value.name),
    id: Number(id),
  }));
  const us = sides.find((side) => side.id === faction.ID);
  const them = sides.find((side) => side.id !== faction.ID);
  if (!us || !them) return undefined;
  return { war: latest.war, us, them };
}

const FactionScore = <M>(h: Html.H<M>, side: Side, align: "start" | "end", tag: string) =>
  h.div
    .class(cn("min-w-0", align === "end" && "text-right"))
    .children(
      h.div
        .class(
          cn(
            "flex items-center gap-1.5 text-sm text-muted-foreground",
            align === "end" && "justify-end",
          ),
        )
        .children(
          h.span
            .class(
              "hidden shrink-0 rounded bg-muted px-1.5 text-[11px] font-medium text-foreground sm:inline",
            )
            .children(tag),
          h.span.class("truncate").attr("title", side.name).children(side.name),
        ),
      h.div
        .class("font-sans text-2xl font-semibold leading-none tabular-nums tracking-tight")
        .children(numberFormat.format(side.score)),
    );

export const WarBar = <M>(h: Html.H<M>, faction: Faction | undefined, now: number) => {
  const current = getCurrentWar(faction);
  // Between wars there is nothing to act on, so the bar disappears.
  if (!current) return null;
  const { war, us, them } = current;
  if (war.end > 0 && war.end <= now) return null;

  if (war.start > now)
    return h.div
      .class(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2.5 text-sm",
      )
      .children(
        h.span
          .class("min-w-0 truncate")
          .children(
            "Ranked war against ",
            h.span.class("font-medium").children(them.name),
            " starts in ",
            h.span.class("font-semibold tabular-nums").children(formatSpan(war.start - now)),
          ),
        h.span.class("text-muted-foreground").children(`Target ${numberFormat.format(war.target)}`),
      );

  const lead = us.score - them.score;
  const progress = war.target > 0 ? Math.min(1, Math.abs(lead) / war.target) : 0;
  const leadLabel =
    lead === 0
      ? "Scores level"
      : `${lead > 0 ? "Ahead" : "Behind"} by ${numberFormat.format(Math.abs(lead))}`;

  return h.section
    .attr("aria-label", "Ranked war score")
    .class("flex items-center gap-3 rounded-xl border bg-card px-4 py-3")
    .children(
      h.div
        .class(
          "grid min-w-0 flex-1 grid-cols-2 items-end gap-x-6 gap-y-3 md:grid-cols-[fit-content(14rem)_minmax(0,1fr)_fit-content(14rem)] md:items-center md:gap-x-8",
        )
        .children(
          FactionScore(h, us, "start", "Us"),
          h.div
            .class("col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1")
            .children(
              h.div
                .class("mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1")
                .children(
                  h.span
                    .class(
                      cn(
                        "text-xl font-semibold leading-none tabular-nums tracking-tight sm:text-2xl",
                        lead > 0 && "text-emerald-600 dark:text-emerald-400",
                        lead < 0 && "text-rose-600 dark:text-rose-400",
                      ),
                    )
                    .children(leadLabel),
                  h.span
                    .class("text-sm text-muted-foreground tabular-nums")
                    .children(
                      lead >= 0
                        ? `${numberFormat.format(Math.max(0, war.target - lead))} more lead to win`
                        : `they need ${numberFormat.format(Math.max(0, war.target + lead))} more`,
                    ),
                ),
              // Whoever leads fills the bar; it is full when their lead reaches the target.
              h.div
                .class("h-3 overflow-hidden rounded-full bg-muted")
                .attrs({
                  role: "meter",
                  "aria-label": "Lead towards the war target",
                  "aria-valuemin": "0",
                  "aria-valuemax": String(war.target),
                  "aria-valuenow": String(Math.abs(lead)),
                })
                .children(
                  h.div
                    .class(
                      cn(
                        "h-full rounded-full transition-[width] duration-700",
                        lead >= 0 ? "bg-emerald-500" : "bg-rose-500",
                      ),
                    )
                    .style({ width: `${progress * 100}%` }),
                ),
              h.div
                .class(
                  "mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums",
                )
                .children(
                  // The bar's end is the target, so it reads as lead towards a goal, not a score share.
                  h.span.children(`War time ${formatSpan(now - war.start)}`),
                  h.span.children(`Target ${numberFormat.format(war.target)}`),
                ),
            ),
          FactionScore(h, them, "end", "Enemy"),
        ),
    );
};
