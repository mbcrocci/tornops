import { PanelTopClose, PanelTopOpen, Pin, RotateCw, Rows3, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  useEnemyFactionData,
  useEnemyMembers,
  useUserFactionData,
  useUserMembers,
} from "@/hooks/use-torn";
import { useNowSeconds } from "@/hooks/use-now";
import { playerAttackLink } from "@/lib/links";
import { formatClock, getOnlineDotClass, getStatusTone } from "@/lib/status";
import { useGlobalStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { EnemyFactionEmptyState } from "../enemy-faction";
import { DataTable, PINNED_GROUP, type RowGrouping } from "../enemy-faction/data-table";
import type {
  FFFilter,
  FilterState,
  OnlineStatusFilter,
  StateFilter,
} from "../enemy-faction/filters";
import { RefreshCountdown } from "../refresh-countdown";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { type FactionMember, type RosterSide, useFactionColumns } from "./columns";

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

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Chip({
  pressed,
  onClick,
  className,
  pressedClassName,
  children,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  className?: string;
  pressedClassName?: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Borderless until switched on, so the filters stay quieter than the list they filter.
        pressed
          ? cn(pressedClassName ?? "bg-accent text-accent-foreground", "ring-2 ring-foreground/50")
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

const STATES: { value: StateFilter; label: string }[] = [
  { value: "Okay", label: "Okay" },
  { value: "Hospital", label: "Hospital" },
  { value: "Traveling", label: "Traveling" },
  { value: "Abroad", label: "Abroad" },
  { value: "Federal", label: "Jail" },
];

function StateChips({
  members,
  filters,
  onChange,
}: {
  members: FactionMember[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 sm:shrink sm:flex-wrap"
      role="group"
      aria-label="Filter by status"
    >
      <span className="mr-1 text-xs text-muted-foreground">Status</span>
      {/* Makes the filter state visible: "All" is on until a status is picked. */}
      <Chip
        pressed={filters.state.length === 0}
        label="All statuses"
        onClick={() => onChange({ ...filters, state: [] })}
      >
        All
      </Chip>
      {STATES.map(({ value, label }) => {
        const inState = members.filter((member) => member.status.state === value);
        const pressed = filters.state.includes(value);
        if (value === "Federal" && inState.length === 0 && !pressed) return null;
        const tone = getStatusTone(value);
        return (
          <Chip
            key={value}
            pressed={pressed}
            pressedClassName={tone.pill}
            label={`${label}: ${inState.length}`}
            onClick={() => onChange({ ...filters, state: toggle(filters.state, value) })}
          >
            <span className={cn("size-2 rounded-[2px]", tone.dot)} aria-hidden />
            <span className={cn(!pressed && inState.length > 0 && "text-foreground")}>{label}</span>
            <span
              className={cn(
                "tabular-nums",
                value === "Okay" && inState.length > 0 && "font-semibold text-foreground",
              )}
            >
              {inState.length}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

function NextOut({ members }: { members: FactionMember[] }) {
  const now = useNowSeconds();
  const next = members
    .filter((member) => member.status.state === "Hospital" && member.status.until > now)
    .sort((a, b) => a.status.until - b.status.until)[0];
  if (!next) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span>next out</span>
      <a
        href={playerAttackLink(next.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground hover:underline"
        title={`Attack ${next.name}`}
      >
        {next.name}
      </a>
      <span className="font-semibold text-foreground tabular-nums">
        {formatClock(next.status.until - now)}
      </span>
    </div>
  );
}

function SecondaryFilters({
  members,
  filters,
  onChange,
}: {
  members: FactionMember[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-x-5 gap-y-2 sm:shrink sm:flex-wrap">
      <div className="flex items-center gap-0.5" role="group" aria-label="Filter by fair fight">
        <span className="mr-1 text-xs text-muted-foreground">FF</span>
        {(Object.keys(FF_RANGES) as FFFilter[]).map((range) => (
          <Chip
            key={range}
            pressed={filters.ff.includes(range)}
            label={`Fair fight ${range}`}
            // The ends of the scale carry the same tint as the FF column.
            className={cn(
              "px-2",
              range === "0-2" && "text-violet-700 dark:text-violet-400",
              range === "6+" && "text-rose-700 dark:text-rose-400",
            )}
            onClick={() => onChange({ ...filters, ff: toggle(filters.ff, range) })}
          >
            {range}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-0.5" role="group" aria-label="Filter by activity">
        <span className="mr-1 text-xs text-muted-foreground">Activity</span>
        {(["Online", "Idle", "Offline"] as OnlineStatusFilter[]).map((status) => {
          const count = members.filter((member) => member.last_action.status === status).length;
          return (
            <Chip
              key={status}
              pressed={filters.onlineStatus.includes(status)}
              label={`${status}: ${count}`}
              onClick={() =>
                onChange({ ...filters, onlineStatus: toggle(filters.onlineStatus, status) })
              }
            >
              <span
                className={cn("size-2.5 rounded-full", getOnlineDotClass(status))}
                aria-hidden
              />
              {status}
              <span className="tabular-nums">{count}</span>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

function hasFilters(filters: FilterState) {
  return filters.onlineStatus.length + filters.state.length + filters.ff.length > 0;
}

// Targets that cannot be hit right now fade back so the hittable ones stand out. Their status
// and action buttons keep full contrast: those are what you act on.
// Re-evaluated on every refresh, which is often enough for a two-minute window.
function enemyRowClassName(member: FactionMember) {
  const state = member.status.state;
  if (state === "Traveling" || state === "Abroad" || state === "Federal") {
    return "[&>td:not(.status-cell):not(.actions-cell)]:opacity-50 hover:[&>td]:opacity-100";
  }
  if (state === "Hospital" && member.status.until - Date.now() / 1000 > 120) {
    return "[&>td:not(.status-cell):not(.actions-cell)]:opacity-60 hover:[&>td]:opacity-100";
  }
  return undefined;
}

const STATE_GROUP: Record<string, string> = { Okay: "ready", Hospital: "hospital" };

function GroupHeader({
  group,
  rows,
  side,
}: {
  group: string;
  rows: FactionMember[];
  side: RosterSide;
}) {
  const count = (
    <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
  );
  if (group === PINNED_GROUP) {
    return (
      <span className="flex items-center gap-2 font-medium">
        <Pin className="size-3 text-primary" aria-hidden />
        Pinned {count}
      </span>
    );
  }
  if (group === "ready") {
    const online = rows.filter((member) => member.last_action.status === "Online").length;
    return (
      <span className="flex flex-wrap items-center gap-x-2 font-medium">
        <span className={cn("size-2 rounded-[2px]", getStatusTone("Okay").dot)} aria-hidden />
        <span>{side === "enemy" ? "Hittable now" : "Available"}</span>
        {count}
        <span className="font-normal text-muted-foreground">{online} online</span>
      </span>
    );
  }
  if (group === "hospital") {
    return (
      <span className="flex flex-wrap items-center gap-x-2 font-medium">
        <span className={cn("size-2 rounded-[2px]", getStatusTone("Hospital").dot)} aria-hidden />
        In hospital {count}
        <span className="font-normal">
          <NextOut members={rows} />
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 font-medium text-muted-foreground">
      <span className="size-2 rounded-[2px] bg-muted-foreground/50" aria-hidden />
      Out of reach {count}
      <span className="font-normal">traveling, abroad or in jail</span>
    </span>
  );
}

/** Whether `content` (laid out at its natural width) fits inside `container`. */
function useFits(container: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const outer = container.current;
    const inner = content.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;
    const measure = () => setFits(inner.scrollWidth <= outer.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [container, content]);
  return fits;
}

function GroupToggle() {
  const groupByStatus = useGlobalStore((state) => state.groupByStatus);
  const setGroupByStatus = useGlobalStore((state) => state.setGroupByStatus);
  return (
    <Chip
      pressed={groupByStatus}
      label={groupByStatus ? "Show one list" : "Group by status"}
      onClick={() => setGroupByStatus(!groupByStatus)}
    >
      <Rows3 className="size-3.5" aria-hidden />
      Group
    </Chip>
  );
}

function Roster({ members, side }: { members: FactionMember[]; side: RosterSide }) {
  const columns = useFactionColumns(side);
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const groupByStatus = useGlobalStore((state) => state.groupByStatus);
  const visible = filterMembers(members, filters);
  const secondaryActive = filters.ff.length + filters.onlineStatus.length;
  // FF and activity sit next to the status chips when the row has room for them all, and fold
  // behind "More filters" when it does not. The hidden copy measures the full row's width.
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const inline = useFits(rowRef, measureRef);
  // Opens by itself when one of its filters is already on, so an active filter is never hidden.
  const [showMore, setShowMore] = useState(secondaryActive > 0);
  const grouping = useMemo<RowGrouping<FactionMember>>(
    () => ({
      columnId: "status",
      getGroup: (member) => STATE_GROUP[member.status.state] ?? "away",
      renderHeader: (group, rows) => <GroupHeader group={group} rows={rows} side={side} />,
    }),
    [side],
  );
  const secondary = <SecondaryFilters members={members} filters={filters} onChange={setFilters} />;

  return (
    <div className="flex flex-col gap-3 px-2 sm:px-3">
      <div className="relative">
        <div
          ref={measureRef}
          aria-hidden
          inert
          className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-x-5"
        >
          <StateChips members={members} filters={filters} onChange={setFilters} />
          {secondary}
          <GroupToggle />
        </div>
        {/* One swipeable row on phones (faded at the edge to show it scrolls), wrapping on wider screens. */}
        <div
          ref={rowRef}
          className={cn(
            "-mx-2 flex items-center gap-x-5 gap-y-2 overflow-x-auto contain-inline-size px-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
            !inline &&
              "[mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]",
          )}
        >
          <StateChips members={members} filters={filters} onChange={setFilters} />
          {inline ? (
            secondary
          ) : (
            <Chip
              pressed={showMore}
              label={showMore ? "Hide FF and activity filters" : "Show FF and activity filters"}
              onClick={() => setShowMore(!showMore)}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              More filters
              {secondaryActive > 0 && <span className="tabular-nums">{secondaryActive}</span>}
            </Chip>
          )}
          <div className="ml-auto">
            <GroupToggle />
          </div>
        </div>
      </div>
      {!inline && showMore && (
        <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {secondary}
        </div>
      )}
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => String(row.id)}
        getRowClassName={side === "enemy" ? enemyRowClassName : undefined}
        className="-mx-2 rounded-none border-0 border-t sm:-mx-3 max-md:[&_thead]:hidden md:[&_td]:text-sm md:[&_table]:table-fixed md:[&_td]:px-3.5 md:[&_th]:px-3.5 [&_thead_tr]:bg-muted/40 [&_thead_tr]:hover:bg-muted/40"
        grouping={groupByStatus ? grouping : undefined}
      />
      {hasFilters(filters) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            Showing {visible.length} of {members.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilters({ onlineStatus: [], state: [], ff: [] })}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function EnemyRoster() {
  useEnemyMembers();
  const members = useGlobalStore((state) => state.enemyMembers);
  if (!members.length) return <EnemyFactionEmptyState />;
  return <Roster members={members} side="enemy" />;
}

function OurRoster() {
  useUserMembers();
  const members = useGlobalStore((state) => state.userMembers);
  if (!members.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No faction data</EmptyTitle>
          <EmptyDescription>
            Your faction could not be loaded. Check your API key in settings.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <Roster members={members} side="ours" />;
}

function RefreshControl({ side }: { side: RosterSide }) {
  const enemy = useEnemyFactionData();
  const ours = useUserFactionData();
  const setLastRefreshTime = useGlobalStore((state) => state.setLastRefreshTime);
  const query = side === "enemy" ? enemy : ours;

  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <RefreshCountdown />
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7"
        onClick={async () => {
          await query.refetch();
          setLastRefreshTime(Date.now());
        }}
        aria-label={side === "enemy" ? "Refresh enemy faction" : "Refresh your faction"}
      >
        <RotateCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
      </Button>
    </div>
  );
}

/** Hides your status and chain cards to give the roster the whole page. */
function CardsToggle() {
  const collapsed = useGlobalStore((state) => state.collapsedCards);
  const setCollapsed = useGlobalStore((state) => state.setCollapsedCards);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={() => setCollapsed(!collapsed)}
      aria-expanded={!collapsed}
    >
      {collapsed ? <PanelTopOpen className="size-3.5" /> : <PanelTopClose className="size-3.5" />}
      <span className="hidden sm:inline">{collapsed ? "Show status" : "Hide status"}</span>
      <span className="sr-only sm:hidden">
        {collapsed ? "Show status and chains" : "Hide status and chains"}
      </span>
    </Button>
  );
}

function SideLabel({ title, name, count }: { title: string; name?: string; count?: number }) {
  return (
    <>
      <span>{title}</span>
      {name && (
        <span className="hidden max-w-40 truncate font-normal text-muted-foreground sm:inline">
          {name}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      )}
    </>
  );
}

export function FactionComparison() {
  const [side, setSide] = useState<RosterSide>("enemy");
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);
  // The war bar already polls our faction, so the tab can be labelled before it is opened.
  const { data: ourFaction } = useUserFactionData();
  const enemyCount = useGlobalStore((state) => state.enemyMembers.length);
  const ourCount = Object.keys(ourFaction?.members ?? {}).length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Faction rosters">
      <Tabs value={side} onValueChange={(value) => setSide(value as RosterSide)} className="gap-0">
        <div className="flex items-center justify-between gap-2 p-2 sm:p-3">
          <TabsList className="h-8">
            <TabsTrigger value="enemy" className="px-3">
              <SideLabel title="Enemy" name={enemyFaction?.name} count={enemyCount} />
            </TabsTrigger>
            <TabsTrigger value="ours" className="px-3">
              <SideLabel title="Ours" name={ourFaction?.name} count={ourCount} />
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            <RefreshControl side={side} />
            <CardsToggle />
          </div>
        </div>
        <TabsContent value="enemy">
          <EnemyRoster />
        </TabsContent>
        <TabsContent value="ours">
          <OurRoster />
        </TabsContent>
      </Tabs>
    </section>
  );
}
