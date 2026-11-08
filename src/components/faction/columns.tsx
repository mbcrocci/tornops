import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { Eye, Pin, PinOff, Swords, TriangleAlert } from "lucide-react";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import { useIsMobile, useIsWide } from "@/hooks/use-mobile";
import { useNowSeconds } from "@/hooks/use-now";
import type { Member } from "@/lib/faction";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import {
  DANGEROUS_FAIR_FIGHT,
  formatClock,
  getFairFightTextClass,
  getOnlineDotClass,
  getStatusTone,
  shortStatusLabel,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { CommunicationsMenu } from "../communications-menu";
import { DataTableColumnHeader } from "../data-table-column-header";
import { TravelCountdown } from "../travel-countdown";
import { Button, buttonVariants } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type FactionMember = Member & {
  id: number;
  ffs?: FFScouterData;
};

export type RosterSide = "enemy" | "ours";

const STATE_ORDER: Record<string, number> = { Okay: 1, Hospital: 2, Traveling: 3, Abroad: 4 };
/** A hospital release this close is worth getting ready for. */
const RELEASE_SOON_SECONDS = 120;

function ActivityDot({ member }: { member: FactionMember }) {
  const status = member.last_action.status;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-4 shrink-0 items-center justify-center">
          <span
            className={cn("size-2.5 rounded-full", getOnlineDotClass(status))}
            role="img"
            aria-label={status}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {status}, last action {member.last_action.relative}
      </TooltipContent>
    </Tooltip>
  );
}

// Every row names its status in a coloured pill, so a glance down the column answers
// "who can be hit" without relying on section headers.
const statusPillClass =
  "inline-flex max-w-full items-center gap-2 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset md:text-sm";

/** In the last two minutes the pill turns solid: the target is about to be hittable. */
function HospitalStatus({ until, compact }: { until: number; compact?: boolean }) {
  const now = useNowSeconds();
  const remaining = until - now;
  const tone = getStatusTone("Hospital");
  const soon = remaining <= RELEASE_SOON_SECONDS;
  return (
    <span
      className={cn(
        statusPillClass,
        soon
          ? "bg-rose-600 text-white ring-rose-600 dark:bg-rose-500 dark:ring-rose-500"
          : tone.pill,
      )}
    >
      <span className={cn(compact && "sr-only")}>Hospital</span>
      <span className="tabular-nums">{remaining > 0 ? formatClock(remaining) : "Out now"}</span>
    </span>
  );
}

export function StatusPill({ member, compact }: { member: FactionMember; compact?: boolean }) {
  const { status } = member;
  const tone = getStatusTone(status.state);
  if (status.state === "Okay") {
    return <span className={cn(statusPillClass, tone.pill)}>Okay</span>;
  }
  if (status.state === "Hospital" && status.until > 0) {
    return <HospitalStatus until={status.until} compact={compact} />;
  }
  const label = shortStatusLabel(status.state, status.description);

  return (
    <div
      className={cn(
        statusPillClass,
        "flex-col items-start gap-0",
        compact && "max-w-[6.5rem]",
        tone.pill,
      )}
      title={[status.description, status.details].filter(Boolean).join(". ")}
    >
      <span className="max-w-full min-w-0 truncate">{label}</span>
      <TravelCountdown id={member.id} status={status} />
    </div>
  );
}

/** `muted` drops the colour on rows you cannot hit yet, so they don't compete with targets. */
export function FairFight({ ff, muted }: { ff: number | undefined; muted?: boolean }) {
  if (!ff) return <span className="text-muted-foreground">–</span>;
  const dangerous = ff >= DANGEROUS_FAIR_FIGHT;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        muted ? "text-muted-foreground" : getFairFightTextClass(ff),
        dangerous && "font-semibold",
      )}
    >
      {dangerous && <TriangleAlert className="size-3" aria-label="Dangerous" />}
      {ff.toFixed(2)}
    </span>
  );
}

function AttackLink({
  member,
  side,
  iconOnly,
}: {
  member: FactionMember;
  side: RosterSide;
  iconOnly?: boolean;
}) {
  // Every row keeps a labelled Attack button. Enemies you can hit right now get the filled
  // one; the rest are outlined so you can still open their attack page ahead of time.
  const hittable = side === "enemy" && member.status.state === "Okay";
  return (
    <a
      aria-label={`Attack ${member.name}`}
      href={playerAttackLink(member.id)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "outline", size: iconOnly ? "icon-sm" : "sm" }),
        "text-xs font-semibold",
        iconOnly ? "size-9" : "h-7 w-[5.25rem]",
        hittable &&
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:border-transparent dark:bg-primary dark:hover:bg-primary/90",
      )}
    >
      <Swords className={iconOnly ? "size-4" : "size-3.5"} />
      {!iconOnly && "Attack"}
    </a>
  );
}

function PinButton({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <Tooltip delayDuration={750}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("size-7", selected ? "text-primary" : "text-muted-foreground")}
          aria-label={selected ? "Unpin member" : "Pin member"}
          aria-pressed={selected}
          onClick={onToggle}
        >
          {selected ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{selected ? "Unpin member" : "Pin member to top"}</TooltipContent>
    </Tooltip>
  );
}

function ProfileLink({ playerId }: { playerId: number }) {
  return (
    <Tooltip delayDuration={750}>
      <TooltipTrigger asChild>
        <a
          aria-label="View profile"
          href={playerProfileLink(playerId)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "size-7 text-muted-foreground",
          )}
        >
          <Eye className="size-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent>View profile</TooltipContent>
    </Tooltip>
  );
}

/** The dot in front of the name shows Online / Idle / Offline; hover it for the last action. */
function NameCell({ member, pinned }: { member: FactionMember; pinned: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <ActivityDot member={member} />
      <a
        href={playerProfileLink(member.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-sm font-medium hover:underline"
      >
        {member.name}
      </a>
      {pinned && <Pin className="size-3 shrink-0 text-primary" aria-label="Pinned" />}
    </div>
  );
}

const nameColumn: ColumnDef<FactionMember> = {
  accessorKey: "name",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  enableSorting: true,
  // Desktop columns are fixed shares of the row (the table uses a fixed layout from md up),
  // so spacing is even whatever the names and statuses happen to be.
  meta: { className: "md:w-[28%] pl-2.5" },
  cell: ({ row }) => <NameCell member={row.original} pinned={row.getIsSelected()} />,
};

const ffColumn: ColumnDef<FactionMember> = {
  id: "ff",
  accessorFn: (member) => member.ffs?.fair_fight,
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title="FF"
      align="end"
      hint="Fair fight estimate from FFScouter: low is an easy target, high a hard one."
    />
  ),
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const ffA = rowA.original.ffs?.fair_fight;
    const ffB = rowB.original.ffs?.fair_fight;
    if (ffA === undefined && ffB === undefined) return 0;
    if (ffA === undefined) return 1;
    if (ffB === undefined) return -1;
    return ffA - ffB;
  },
  meta: { className: "md:w-[7%] text-right" },
  cell: ({ row }) => (
    <FairFight ff={row.original.ffs?.fair_fight} muted={row.original.status.state !== "Okay"} />
  ),
};

const battleStatsColumn: ColumnDef<FactionMember> = {
  id: "battle_stats",
  accessorFn: (member) => member.ffs?.bs_estimate,
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title="Stats"
      align="end"
      hint="Estimated total battle stats from FFScouter."
    />
  ),
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const bsA = rowA.original.ffs?.bs_estimate;
    const bsB = rowB.original.ffs?.bs_estimate;
    if (bsA === undefined && bsB === undefined) return 0;
    if (bsA === undefined) return 1;
    if (bsB === undefined) return -1;
    return bsA - bsB;
  },
  meta: { className: "md:w-[10%] text-right" },
  cell: ({ row }) => {
    const human = row.original.ffs?.bs_estimate_human;
    if (!human) return <span className="text-muted-foreground">–</span>;
    return <span className="tabular-nums">{human}</span>;
  },
};

const levelColumn: ColumnDef<FactionMember> = {
  accessorKey: "level",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Level" align="end" />,
  enableSorting: true,
  meta: { className: "md:w-[6%] text-right" },
  cell: ({ row }) => (
    <span className="text-muted-foreground tabular-nums">{row.original.level}</span>
  ),
};

const statusColumn: ColumnDef<FactionMember> = {
  id: "status",
  accessorFn: (member) => member.status.state,
  header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const stateA = rowA.original.status.state;
    const stateB = rowB.original.status.state;
    const order = (STATE_ORDER[stateA] ?? 99) - (STATE_ORDER[stateB] ?? 99);
    if (order !== 0) return order;
    if (stateA === "Hospital" && stateB === "Hospital") {
      return rowA.original.status.until - rowB.original.status.until;
    }
    if (stateA === "Traveling" && stateB === "Traveling") {
      return rowA.original.status.description.includes("Returning") ? -1 : 1;
    }
    if (stateA === "Okay") {
      // Easiest hits first; targets without an estimate go last.
      const ffA = rowA.original.ffs?.fair_fight ?? Number.POSITIVE_INFINITY;
      const ffB = rowB.original.ffs?.fair_fight ?? Number.POSITIVE_INFINITY;
      return ffA === ffB ? 0 : ffA < ffB ? -1 : 1;
    }
    return 0;
  },
  meta: { className: "status-cell md:w-[22%] md:pl-7!" },
  cell: ({ row }) => <StatusPill member={row.original} />,
};

function actionsColumn(side: RosterSide): ColumnDef<FactionMember> {
  return {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    meta: { className: "actions-cell md:w-[13.5rem] pr-3" },
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <PinButton selected={row.getIsSelected()} onToggle={() => row.toggleSelected()} />
        <ProfileLink playerId={row.original.id} />
        <CommunicationsMenu player={row.original} size="icon-sm" variant="ghost" />
        <span className="ml-1">
          <AttackLink member={row.original} side={side} />
        </span>
      </div>
    ),
  };
}

function mobileColumns(side: RosterSide): ColumnDef<FactionMember>[] {
  return [
    {
      ...nameColumn,
      meta: { className: "pl-2" },
      cell: ({ row }) => (
        <div className="flex w-[8rem] items-start gap-1.5 leading-tight">
          <span className="mt-0.5">
            <ActivityDot member={row.original} />
          </span>
          <div className="min-w-0">
            <a
              href={playerProfileLink(row.original.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium"
            >
              {row.original.name}
            </a>
            <span className="flex gap-1.5 overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {row.original.ffs?.fair_fight ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5",
                    row.original.status.state === "Okay"
                      ? getFairFightTextClass(row.original.ffs.fair_fight)
                      : "text-muted-foreground",
                  )}
                >
                  {row.original.ffs.fair_fight >= DANGEROUS_FAIR_FIGHT && (
                    <TriangleAlert className="size-2.5" aria-label="Dangerous" />
                  )}
                  FF {row.original.ffs.fair_fight.toFixed(1)}
                </span>
              ) : null}
              {row.original.ffs?.bs_estimate_human ? (
                <span>{row.original.ffs.bs_estimate_human}</span>
              ) : null}
            </span>
          </div>
        </div>
      ),
    } as ColumnDef<FactionMember>,
    {
      ...statusColumn,
      header: () => <span className="sr-only">Status</span>,
      meta: { className: "status-cell" },
      cell: ({ row }) => <StatusPill member={row.original} compact />,
    } as ColumnDef<FactionMember>,
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { className: "w-px pr-2" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-4">
          <CommunicationsMenu player={row.original} size="icon-sm" variant="ghost" />
          <AttackLink member={row.original} side={side} iconOnly />
        </div>
      ),
    },
  ];
}

export function useFactionColumns(side: RosterSide = "enemy"): ColumnDef<FactionMember>[] {
  const isMobile = useIsMobile();
  const isWide = useIsWide();

  return useMemo(() => {
    if (isMobile) return mobileColumns(side);
    // Tablets drop level to keep every row's status and buttons in view.
    if (!isWide)
      return [nameColumn, ffColumn, battleStatsColumn, statusColumn, actionsColumn(side)];
    return [
      nameColumn,
      ffColumn,
      battleStatsColumn,
      levelColumn,
      statusColumn,
      actionsColumn(side),
    ];
  }, [isMobile, isWide, side]);
}
