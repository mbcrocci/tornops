import type { Html } from "@effect/ui/html";
import { Eye, Pin, PinOff, Rows3, SlidersHorizontal, Swords, TriangleAlert } from "lucide";
import type { FFFilter, FilterState, OnlineStatusFilter, StateFilter } from "@/domain/Settings";
import type { Member } from "@/lib/faction";
import type { FFScouterData } from "@/lib/ffscouter";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import {
  DANGEROUS_FAIR_FIGHT,
  formatClock,
  getFairFightTextClass,
  getOnlineDotClass,
  getStatusTone,
  shortStatusLabel,
} from "@/lib/status";
import type { TravelObservation } from "@/lib/travel";
import { cn } from "@/lib/utils";
import { CommunicationsMenu } from "../communications-menu";
import { type Column, PINNED_GROUP, type RowGrouping } from "../data-table";
import { Icon } from "../ui/icon";
import { Button, buttonClass } from "../ui/primitives";
import { Tip } from "../ui/tip";

export type FactionMember = Member & { id: number; ffs?: FFScouterData | undefined };
export type RosterSide = "enemy" | "ours";

/** A faction's members as rows, with their FFScouter stats when known. */
export const membersOf = (
  members: Readonly<Record<string, Member>> | undefined,
  stats: ReadonlyMap<number, FFScouterData>,
): FactionMember[] =>
  Object.entries(members ?? {}).map(([id, member]) => {
    const playerId = parseInt(id, 10);
    return { ...member, id: playerId, ffs: stats.get(playerId) };
  });

const FF_RANGES: Record<FFFilter, [number, number]> = {
  "0-2": [0, 2],
  "2-4": [2, 4],
  "4-6": [4, 6],
  "6+": [6, Number.POSITIVE_INFINITY],
};

export function filterMembers(members: FactionMember[], filters: FilterState): FactionMember[] {
  return members.filter((member) => {
    if (
      filters.onlineStatus.length > 0 &&
      !filters.onlineStatus.includes(member.last_action.status)
    )
      return false;
    if (filters.state.length > 0 && !filters.state.includes(member.status.state as StateFilter))
      return false;
    if (filters.ff.length > 0) {
      const fairFight = member.ffs?.fair_fight;
      if (fairFight === undefined) return false;
      return filters.ff.some((range) => {
        const [min, max] = FF_RANGES[range];
        return fairFight >= min && fairFight < max;
      });
    }
    return true;
  });
}

export const hasFilters = (filters: FilterState) =>
  filters.onlineStatus.length + filters.state.length + filters.ff.length > 0;

export const toggle = <T>(list: ReadonlyArray<T>, value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/** What the roster needs from the page around it. */
export interface RosterContext<M> {
  readonly side: RosterSide;
  /** Unix seconds, ticking. */
  readonly now: number;
  readonly travel: Readonly<Record<number, TravelObservation>>;
  readonly emojis: boolean;
  readonly pinned: ReadonlySet<number>;
  readonly onTogglePin: (id: number) => M;
}

const STATE_ORDER: Record<string, number> = { Okay: 1, Hospital: 2, Traveling: 3, Abroad: 4 };
/** A hospital release this close is worth getting ready for. */
const RELEASE_SOON_SECONDS = 120;

// Every row names its status in a coloured pill, so a glance down the column answers
// "who can be hit" without relying on section headers.
const STATUS_PILL_CLASS =
  "inline-flex max-w-full items-center gap-2 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset md:text-sm";

export const ActivityDot = <M>(h: Html.H<M>, member: FactionMember) => {
  const status = member.last_action.status;
  return Tip(h, {
    key: `activity-${member.id}`,
    props: { class: "flex size-4 shrink-0 items-center justify-center", label: status },
    slots: {
      trigger: h.span.class(cn("size-2.5 rounded-full", getOnlineDotClass(status))),
      content: `${status}, last action ${member.last_action.relative}`,
    },
  });
};

export const TravelCountdown = <M>(
  h: Html.H<M>,
  member: FactionMember,
  observation: TravelObservation | undefined,
  nowMs: number,
) => {
  if (member.status.state !== "Traveling") return null;
  const estimate = observation?.status.state === "Traveling" ? observation.estimate : undefined;
  if (!estimate)
    return h.span
      .class("block text-[11px] font-normal opacity-80")
      .attr("title", "Departure was not observed, or destination is unknown.")
      .children("ETA unknown");
  const seconds = Math.max(0, Math.ceil((estimate.arrivalAt - nowMs) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const duration = `${hours ? `${hours}h ` : ""}${minutes}m ${seconds % 60}s`;
  const time = (ms: number) => new Date(ms).toLocaleTimeString();
  const title = `Estimated arrival: ${time(estimate.arrivalAt)}. Departure occurred between status updates; arrival window ${time(estimate.earliestArrival)}–${time(estimate.latestArrival)}. ${estimate.method}${estimate.assumedMethod ? " (assumed)" : ""}. Travel perks may change this estimate.`;
  return h.span
    .class("block text-[11px] font-normal tabular-nums opacity-80")
    .attr("title", title)
    .children(seconds > 0 ? `ETA ≈ ${duration}` : "Arrival due (est.)");
};

/** In the last two minutes the hospital pill turns solid: the target is about to be hittable. */
export const StatusPill = <M>(
  h: Html.H<M>,
  member: FactionMember,
  context: { readonly now: number; readonly travel: Readonly<Record<number, TravelObservation>> },
  compact = false,
) => {
  const { status } = member;
  const tone = getStatusTone(status.state);
  if (status.state === "Okay")
    return h.span.class(cn(STATUS_PILL_CLASS, tone.pill)).children("Okay");
  if (status.state === "Hospital" && status.until > 0) {
    const remaining = status.until - context.now;
    const soon = remaining <= RELEASE_SOON_SECONDS;
    return h.span
      .class(
        cn(
          STATUS_PILL_CLASS,
          soon
            ? "bg-rose-600 text-white ring-rose-600 dark:bg-rose-500 dark:ring-rose-500"
            : tone.pill,
        ),
      )
      .children(
        h.span.class(cn(compact && "sr-only")).children("Hospital"),
        h.span.class("tabular-nums").children(remaining > 0 ? formatClock(remaining) : "Out now"),
      );
  }
  return h.div
    .class(
      cn(STATUS_PILL_CLASS, "flex-col items-start gap-0", compact && "max-w-[6.5rem]", tone.pill),
    )
    .attr("title", [status.description, status.details].filter(Boolean).join(". "))
    .children(
      h.span
        .class("max-w-full min-w-0 truncate")
        .children(shortStatusLabel(status.state, status.description)),
      TravelCountdown(h, member, context.travel[member.id], context.now * 1000),
    );
};

/** `muted` drops the colour on rows you cannot hit yet, so they don't compete with targets. */
export const FairFight = <M>(h: Html.H<M>, ff: number | undefined, muted = false) => {
  if (!ff) return h.span.class("text-muted-foreground").children("–");
  const dangerous = ff >= DANGEROUS_FAIR_FIGHT;
  return h.span
    .class(
      cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        muted ? "text-muted-foreground" : getFairFightTextClass(ff),
        dangerous && "font-semibold",
      ),
    )
    .children(
      dangerous && Icon(h, TriangleAlert, { class: "size-3", label: "Dangerous" }),
      ff.toFixed(2),
    );
};

// Every row keeps a labelled Attack button. Enemies you can hit right now get the filled
// one; the rest are outlined so you can still open their attack page ahead of time.
const AttackLink = <M>(h: Html.H<M>, member: FactionMember, side: RosterSide, iconOnly = false) => {
  const hittable = side === "enemy" && member.status.state === "Okay";
  return h.a
    .attrs({
      "aria-label": `Attack ${member.name}`,
      href: playerAttackLink(member.id),
      target: "_blank",
      rel: "noopener noreferrer",
    })
    .class(
      buttonClass({
        variant: "outline",
        size: iconOnly ? "icon-sm" : "sm",
        class: cn(
          "text-xs font-semibold",
          iconOnly ? "size-9" : "h-7 w-[5.25rem]",
          hittable &&
            "border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:border-transparent dark:bg-primary dark:hover:bg-primary/90",
        ),
      }),
    )
    .children(Icon(h, Swords, { class: iconOnly ? "size-4" : "size-3.5" }), !iconOnly && "Attack");
};

const Communications = <M>(h: Html.H<M>, member: FactionMember, context: RosterContext<M>) => {
  const observation = context.travel[member.id];
  const arrivalAt =
    observation?.status.state === "Traveling" ? (observation.estimate?.arrivalAt ?? null) : null;
  return CommunicationsMenu(h, {
    key: String(member.id),
    props: { player: member, arrivalAt, emojis: context.emojis, ghost: true },
  });
};

const NameCell = <M>(h: Html.H<M>, member: FactionMember, pinned: boolean) =>
  h.div.class("flex items-center gap-1.5").children(
    ActivityDot(h, member),
    h.a
      .attrs({ href: playerProfileLink(member.id), target: "_blank", rel: "noopener noreferrer" })
      .class("truncate text-sm font-medium hover:underline")
      .children(member.name),
    pinned && Icon(h, Pin, { class: "size-3 shrink-0 text-primary", label: "Pinned" }),
  );

const byOptional = (a: number | undefined, b: number | undefined) => {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
};

const compareStatus = (a: FactionMember, b: FactionMember) => {
  const stateA = a.status.state;
  const stateB = b.status.state;
  const order = (STATE_ORDER[stateA] ?? 99) - (STATE_ORDER[stateB] ?? 99);
  if (order !== 0) return order;
  if (stateA === "Hospital" && stateB === "Hospital") return a.status.until - b.status.until;
  if (stateA === "Traveling" && stateB === "Traveling")
    return a.status.description.includes("Returning") ? -1 : 1;
  if (stateA === "Okay") {
    // Easiest hits first; targets without an estimate go last.
    const ffA = a.ffs?.fair_fight ?? Number.POSITIVE_INFINITY;
    const ffB = b.ffs?.fair_fight ?? Number.POSITIVE_INFINITY;
    return ffA === ffB ? 0 : ffA < ffB ? -1 : 1;
  }
  return 0;
};

export const DEFAULT_SORT = { id: "status", desc: false } as const;

export function rosterColumns<M>(
  layout: "mobile" | "tablet" | "wide",
  context: RosterContext<M>,
): Column<FactionMember, M>[] {
  const { side } = context;
  const pinned = (member: FactionMember) => context.pinned.has(member.id);

  // Desktop columns are fixed shares of the row (the table uses a fixed layout from md up),
  // so spacing is even whatever the names and statuses happen to be.
  const name: Column<FactionMember, M> = {
    id: "name",
    header: "Name",
    compare: (a, b) => a.name.localeCompare(b.name),
    className: "md:w-[28%] pl-2.5",
    cell: (h, member) => NameCell(h, member, pinned(member)),
  };
  const ff: Column<FactionMember, M> = {
    id: "ff",
    header: "FF",
    align: "end",
    hint: "Fair fight estimate from FFScouter: low is an easy target, high a hard one.",
    compare: (a, b) => byOptional(a.ffs?.fair_fight, b.ffs?.fair_fight),
    className: "md:w-[7%] text-right",
    cell: (h, member) => FairFight(h, member.ffs?.fair_fight, member.status.state !== "Okay"),
  };
  const stats: Column<FactionMember, M> = {
    id: "battle_stats",
    header: "Stats",
    align: "end",
    hint: "Estimated total battle stats from FFScouter.",
    compare: (a, b) => byOptional(a.ffs?.bs_estimate, b.ffs?.bs_estimate),
    className: "md:w-[10%] text-right",
    cell: (h, member) =>
      member.ffs?.bs_estimate_human
        ? h.span.class("tabular-nums").children(member.ffs.bs_estimate_human)
        : h.span.class("text-muted-foreground").children("–"),
  };
  const level: Column<FactionMember, M> = {
    id: "level",
    header: "Level",
    align: "end",
    compare: (a, b) => a.level - b.level,
    className: "md:w-[6%] text-right",
    cell: (h, member) =>
      h.span.class("text-muted-foreground tabular-nums").children(String(member.level)),
  };
  const status: Column<FactionMember, M> = {
    id: "status",
    header: "Status",
    compare: compareStatus,
    className: "status-cell md:w-[22%] md:pl-7!",
    cell: (h, member) => StatusPill(h, member, context),
  };
  const actions: Column<FactionMember, M> = {
    id: "actions",
    header: (h) => h.span.class("sr-only").children("Actions"),
    className: "actions-cell md:w-[13.5rem] pr-3",
    cell: (h, member) => {
      const isPinned = pinned(member);
      return h.div.class("flex items-center justify-end gap-1").children(
        Button(h, {
          variant: "ghost",
          size: "icon-sm",
          class: cn("size-7", isPinned ? "text-primary" : "text-muted-foreground"),
        })
          .attrs({
            "aria-label": isPinned ? "Unpin member" : "Pin member",
            "aria-pressed": isPinned ? "true" : "false",
            title: isPinned ? "Unpin member" : "Pin member to top",
          })
          .on("click", context.onTogglePin(member.id))
          .children(Icon(h, isPinned ? PinOff : Pin, { class: "size-3.5" })),
        h.a
          .attrs({
            "aria-label": "View profile",
            title: "View profile",
            href: playerProfileLink(member.id),
            target: "_blank",
            rel: "noopener noreferrer",
          })
          .class(
            buttonClass({
              variant: "ghost",
              size: "icon-sm",
              class: "size-7 text-muted-foreground",
            }),
          )
          .children(Icon(h, Eye, { class: "size-3.5" })),
        Communications(h, member, context),
        h.span.class("ml-1").children(AttackLink(h, member, side)),
      );
    },
  };

  if (layout === "mobile") {
    return [
      {
        ...name,
        className: "pl-2",
        cell: (h, member) =>
          h.div.class("flex w-[8rem] items-start gap-1.5 leading-tight").children(
            h.span.class("mt-0.5").children(ActivityDot(h, member)),
            h.div.class("min-w-0").children(
              h.a
                .attrs({
                  href: playerProfileLink(member.id),
                  target: "_blank",
                  rel: "noopener noreferrer",
                })
                .class("block truncate text-sm font-medium")
                .children(member.name),
              h.span
                .class(
                  "flex gap-1.5 overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground tabular-nums",
                )
                .children(
                  member.ffs?.fair_fight
                    ? h.span
                        .class(
                          cn(
                            "inline-flex items-center gap-0.5",
                            member.status.state === "Okay"
                              ? getFairFightTextClass(member.ffs.fair_fight)
                              : "text-muted-foreground",
                          ),
                        )
                        .children(
                          member.ffs.fair_fight >= DANGEROUS_FAIR_FIGHT &&
                            Icon(h, TriangleAlert, { class: "size-2.5", label: "Dangerous" }),
                          `FF ${member.ffs.fair_fight.toFixed(1)}`,
                        )
                    : null,
                  member.ffs?.bs_estimate_human
                    ? h.span.children(member.ffs.bs_estimate_human)
                    : null,
                ),
            ),
          ),
      },
      {
        ...status,
        header: (h) => h.span.class("sr-only").children("Status"),
        className: "status-cell",
        cell: (h, member) => StatusPill(h, member, context, true),
      },
      {
        id: "actions",
        header: (h) => h.span.class("sr-only").children("Actions"),
        className: "w-px pr-2",
        cell: (h, member) =>
          h.div
            .class("flex items-center justify-end gap-4")
            .children(Communications(h, member, context), AttackLink(h, member, side, true)),
      },
    ];
  }
  // Tablets drop level to keep every row's status and buttons in view.
  if (layout === "tablet") return [name, ff, stats, status, actions];
  return [name, ff, stats, level, status, actions];
}

// Targets that cannot be hit right now fade back so the hittable ones stand out. Their status
// and action buttons keep full contrast: those are what you act on.
export function enemyRowClass(member: FactionMember, now: number) {
  const state = member.status.state;
  if (state === "Traveling" || state === "Abroad" || state === "Federal") {
    return "[&>td:not(.status-cell):not(.actions-cell)]:opacity-50 hover:[&>td]:opacity-100";
  }
  if (state === "Hospital" && member.status.until - now > 120) {
    return "[&>td:not(.status-cell):not(.actions-cell)]:opacity-60 hover:[&>td]:opacity-100";
  }
  return undefined;
}

const STATE_GROUP: Record<string, string> = { Okay: "ready", Hospital: "hospital" };

const NextOut = <M>(h: Html.H<M>, members: ReadonlyArray<FactionMember>, now: number) => {
  const next = members
    .filter((member) => member.status.state === "Hospital" && member.status.until > now)
    .sort((a, b) => a.status.until - b.status.until)[0];
  if (!next) return null;
  return h.div.class("flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground").children(
    h.span.children("next out"),
    h.a
      .attrs({
        href: playerAttackLink(next.id),
        target: "_blank",
        rel: "noopener noreferrer",
        title: `Attack ${next.name}`,
      })
      .class("font-medium text-foreground hover:underline")
      .children(next.name),
    h.span
      .class("font-semibold text-foreground tabular-nums")
      .children(formatClock(next.status.until - now)),
  );
};

export function rosterGrouping<M>(side: RosterSide, now: number): RowGrouping<FactionMember, M> {
  return {
    groupOrder: ["ready", "hospital", "away"],
    groupOf: (member) => STATE_GROUP[member.status.state] ?? "away",
    header: (h, group, rows) => {
      const count = h.span
        .class("font-normal text-muted-foreground tabular-nums")
        .children(String(rows.length));
      if (group === PINNED_GROUP)
        return h.span
          .class("flex items-center gap-2 font-medium")
          .children(Icon(h, Pin, { class: "size-3 text-primary" }), "Pinned ", count);
      if (group === "ready") {
        const online = rows.filter((member) => member.last_action.status === "Online").length;
        return h.span
          .class("flex flex-wrap items-center gap-x-2 font-medium")
          .children(
            h.span
              .class(cn("size-2 rounded-[2px]", getStatusTone("Okay").dot))
              .attr("aria-hidden", "true"),
            h.span.children(side === "enemy" ? "Hittable now" : "Available"),
            count,
            h.span.class("font-normal text-muted-foreground").children(`${online} online`),
          );
      }
      if (group === "hospital")
        return h.span
          .class("flex flex-wrap items-center gap-x-2 font-medium")
          .children(
            h.span
              .class(cn("size-2 rounded-[2px]", getStatusTone("Hospital").dot))
              .attr("aria-hidden", "true"),
            "In hospital ",
            count,
            h.span.class("font-normal").children(NextOut(h, rows, now)),
          );
      return h.span
        .class("flex flex-wrap items-center gap-x-2 font-medium text-muted-foreground")
        .children(
          h.span.class("size-2 rounded-[2px] bg-muted-foreground/50").attr("aria-hidden", "true"),
          "Out of reach ",
          count,
          h.span.class("font-normal").children("traveling, abroad or in jail"),
        );
    },
  };
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

export const Chip = <M>(
  h: Html.H<M>,
  options: {
    readonly pressed: boolean;
    readonly label: string;
    readonly onClick: M;
    readonly class?: string | false | undefined;
    readonly pressedClass?: string | undefined;
  },
) =>
  h.button
    .attrs({
      type: "button",
      "aria-pressed": options.pressed ? "true" : "false",
      "aria-label": options.label,
    })
    .on("click", options.onClick)
    .class(
      cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Borderless until switched on, so the filters stay quieter than the list they filter.
        options.pressed
          ? cn(
              options.pressedClass ?? "bg-accent text-accent-foreground",
              "ring-2 ring-foreground/50",
            )
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
        options.class,
      ),
    );

const STATES: { value: StateFilter; label: string }[] = [
  { value: "Okay", label: "Okay" },
  { value: "Hospital", label: "Hospital" },
  { value: "Traveling", label: "Traveling" },
  { value: "Abroad", label: "Abroad" },
  { value: "Federal", label: "Jail" },
];

export interface FilterControls<M> {
  readonly filters: FilterState;
  readonly onFilters: (filters: FilterState) => M;
}

export const StateChips = <M>(
  h: Html.H<M>,
  members: FactionMember[],
  controls: FilterControls<M>,
) => {
  const { filters, onFilters } = controls;
  return h.div
    .attrs({ role: "group", "aria-label": "Filter by status" })
    .class("flex shrink-0 items-center gap-0.5 sm:shrink sm:flex-wrap")
    .children(
      h.span.class("mr-1 text-xs text-muted-foreground").children("Status"),
      // Makes the filter state visible: "All" is on until a status is picked.
      Chip(h, {
        pressed: filters.state.length === 0,
        label: "All statuses",
        onClick: onFilters({ ...filters, state: [] }),
      }).children("All"),
      STATES.map(({ value, label }) => {
        const count = members.filter((member) => member.status.state === value).length;
        const pressed = filters.state.includes(value);
        if (value === "Federal" && count === 0 && !pressed) return null;
        const tone = getStatusTone(value);
        return Chip(h, {
          pressed,
          pressedClass: tone.pill,
          label: `${label}: ${count}`,
          onClick: onFilters({ ...filters, state: toggle(filters.state, value) }),
        })
          .key(value)
          .children(
            h.span.class(cn("size-2 rounded-[2px]", tone.dot)).attr("aria-hidden", "true"),
            h.span.class(cn(!pressed && count > 0 && "text-foreground")).children(label),
            h.span
              .class(
                cn(
                  "tabular-nums",
                  value === "Okay" && count > 0 && "font-semibold text-foreground",
                ),
              )
              .children(String(count)),
          );
      }),
    );
};

export const SecondaryFilters = <M>(
  h: Html.H<M>,
  members: FactionMember[],
  controls: FilterControls<M>,
) => {
  const { filters, onFilters } = controls;
  return h.div.class("flex shrink-0 items-center gap-x-5 gap-y-2 sm:shrink sm:flex-wrap").children(
    h.div
      .attrs({ role: "group", "aria-label": "Filter by fair fight" })
      .class("flex items-center gap-0.5")
      .children(
        h.span.class("mr-1 text-xs text-muted-foreground").children("FF"),
        (Object.keys(FF_RANGES) as FFFilter[]).map((range) =>
          Chip(h, {
            pressed: filters.ff.includes(range),
            label: `Fair fight ${range}`,
            // The ends of the scale carry the same tint as the FF column.
            class: cn(
              "px-2",
              range === "0-2" && "text-violet-700 dark:text-violet-400",
              range === "6+" && "text-rose-700 dark:text-rose-400",
            ),
            onClick: onFilters({ ...filters, ff: toggle(filters.ff, range) }),
          })
            .key(range)
            .children(range),
        ),
      ),
    h.div
      .attrs({ role: "group", "aria-label": "Filter by activity" })
      .class("flex items-center gap-0.5")
      .children(
        h.span.class("mr-1 text-xs text-muted-foreground").children("Activity"),
        (["Online", "Idle", "Offline"] as OnlineStatusFilter[]).map((status) => {
          const count = members.filter((member) => member.last_action.status === status).length;
          return Chip(h, {
            pressed: filters.onlineStatus.includes(status),
            label: `${status}: ${count}`,
            onClick: onFilters({ ...filters, onlineStatus: toggle(filters.onlineStatus, status) }),
          })
            .key(status)
            .children(
              h.span
                .class(cn("size-2.5 rounded-full", getOnlineDotClass(status)))
                .attr("aria-hidden", "true"),
              status,
              h.span.class("tabular-nums").children(String(count)),
            );
        }),
      ),
  );
};

export const GroupToggle = <M>(h: Html.H<M>, groupByStatus: boolean, onClick: M) =>
  Chip(h, {
    pressed: groupByStatus,
    label: groupByStatus ? "Show one list" : "Group by status",
    onClick,
  }).children(Icon(h, Rows3, { class: "size-3.5" }), "Group");

export const MoreFiltersToggle = <M>(h: Html.H<M>, shown: boolean, active: number, onClick: M) =>
  Chip(h, {
    pressed: shown,
    label: shown ? "Hide FF and activity filters" : "Show FF and activity filters",
    onClick,
  }).children(
    Icon(h, SlidersHorizontal, { class: "size-3.5" }),
    "More filters",
    active > 0 && h.span.class("tabular-nums").children(String(active)),
  );
