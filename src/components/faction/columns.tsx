import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { Eye, Pin, PinOff, Swords } from "lucide-react";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Member } from "@/lib/faction";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { cleanStatusDescription, getStatusBgColorClass } from "@/lib/status";
import { DataTableColumnHeader } from "../data-table-column-header";
import { HospitalCountdown } from "../hospital-countdown";
import { Button, buttonVariants } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type FactionMember = Member & {
  id: number;
  ffs?: FFScouterData;
};

function getOnlineColor(status: string) {
  if (status === "Online") return "bg-green-600";
  if (status === "Idle") return "bg-yellow-600";
  return "bg-gray-600";
}

const onlineColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Online" />
  ),
  accessorKey: "online",
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const statusA = rowA.original.last_action.status;
    const statusB = rowB.original.last_action.status;

    const statusOrder: Record<string, number> = {
      Online: 1,
      Idle: 2,
      Offline: 3,
    };

    return (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
  },
  cell: ({ row }) => {
    const status = row.original.last_action.status;
    const color = getOnlineColor(status);

    return (
      <div
        className={`${color} text-white font-semibold px-3 py-2 rounded-md text-center shadow-sm`}
      >
        {status}
      </div>
    );
  },
};

const onlineColumnMobile: ColumnDef<FactionMember> = {
  ...onlineColumn,
  header: () => <span className="sr-only">Online</span>,
  cell: ({ row }) => {
    const status = row.original.last_action.status;
    const color = getOnlineColor(status);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`${color} size-3 rounded-full shrink-0`}
            aria-label={status}
          />
        </TooltipTrigger>
        <TooltipContent>{status}</TooltipContent>
      </Tooltip>
    );
  },
};

const nameColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Name" />
  ),
  accessorKey: "name",
  enableSorting: true,
  cell: ({ row }) => {
    return (
      <a
        href={playerProfileLink(row.original.id)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {row.original.name}
      </a>
    );
  },
};

const actionsColumn: ColumnDef<FactionMember> = {
  header: "Actions",
  accessorKey: "actions",
  enableSorting: false,
  cell: ({ row }) => {
    return (
      <div className="flex gap-2">
        <a
          href={playerProfileLink(row.original.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <Eye />
        </a>
        <a
          href={playerAttackLink(row.original.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <Swords />
        </a>
      </div>
    );
  },
};

const actionsColumnMobile: ColumnDef<FactionMember> = {
  ...actionsColumn,
  cell: ({ row }) => {
    return (
      <div className="flex gap-1">
        <a
          href={playerProfileLink(row.original.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
        >
          <Eye className="size-4" />
        </a>
        <a
          href={playerAttackLink(row.original.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
        >
          <Swords className="size-4" />
        </a>
      </div>
    );
  },
};

const levelColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Level" />
  ),
  accessorKey: "level",
  enableSorting: true,
  cell: ({ row }) => {
    return <div>{row.original.level}</div>;
  },
};

const statusColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Status" />
  ),
  accessorKey: "status",
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const stateA = rowA.original.status.state;
    const stateB = rowB.original.status.state;

    const stateOrder: Record<string, number> = {
      Okay: 1,
      Hospital: 2,
      Traveling: 3,
      Abroad: 4,
    };

    const orderA = stateOrder[stateA] ?? 99;
    const orderB = stateOrder[stateB] ?? 99;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    if (stateA === "Hospital" && stateB === "Hospital") {
      return rowA.original.status.until - rowB.original.status.until;
    }

    if (stateA === "Traveling" && stateB === "Traveling") {
      return rowA.original.status.description.includes("Returning") ? -1 : 1;
    }

    return 0;
  },
  cell: ({ row }) => {
    const member = row.original;
    return (
      <div
        className={`${getStatusBgColorClass(
          member.status.state
        )} text-white font-semibold px-3 py-2 rounded-md text-center shadow-sm`}
      >
        {member.status.state === "Hospital" && member.status.until > 0 ? (
          <span>
            {cleanStatusDescription(member.status.description) ||
              member.status.state}
            <HospitalCountdown until={member.status.until} />
          </span>
        ) : (
          <span>
            {cleanStatusDescription(member.status.description) ||
              member.status.state}
          </span>
        )}
      </div>
    );
  },
};

const statusColumnMobile: ColumnDef<FactionMember> = {
  ...statusColumn,
  cell: ({ row }) => {
    const member = row.original;
    return (
      <div
        className={`${getStatusBgColorClass(
          member.status.state
        )} text-white font-semibold px-2 py-1 rounded-md text-center shadow-sm text-xs max-w-[7rem] truncate`}
      >
        {member.status.state === "Hospital" && member.status.until > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate">
                {cleanStatusDescription(member.status.description) ||
                  member.status.state}
                <HospitalCountdown until={member.status.until} />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {cleanStatusDescription(member.status.description) ||
                member.status.state}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate">
                {cleanStatusDescription(member.status.description) ||
                  member.status.state}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {cleanStatusDescription(member.status.description) ||
                member.status.state}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  },
};

const ffColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="FF" />
  ),
  accessorKey: "ff",
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const ffA = rowA.original.ffs?.fair_fight;
    const ffB = rowB.original.ffs?.fair_fight;

    if (ffA === undefined && ffB === undefined) return 0;
    if (ffA === undefined) return 1;
    if (ffB === undefined) return -1;

    return ffA - ffB;
  },
  cell: ({ row }) => {
    if (!row.original.ffs?.fair_fight) {
      return <div>N/A</div>;
    }

    const ff = row.original.ffs.fair_fight;

    let color = "text-gray-600";
    if (ff < 2) color = "text-blue-600";
    else if (ff < 4) color = "text-green-600";
    else if (ff < 6) color = "text-yellow-600";
    else color = "text-red-600";

    return <div className={color}>{ff.toFixed(2)}</div>;
  },
};

const battleStatsColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Battle Stats" />
  ),
  accessorKey: "battle_stats",
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    const bsA = rowA.original.ffs?.bs_estimate;
    const bsB = rowB.original.ffs?.bs_estimate;

    if (bsA === undefined && bsB === undefined) return 0;
    if (bsA === undefined) return 1;
    if (bsB === undefined) return -1;

    return bsA - bsB;
  },
  cell: ({ row }) => {
    if (!row.original.ffs?.bs_estimate_human) {
      return <div>N/A</div>;
    }

    return <div>{row.original.ffs?.bs_estimate_human}</div>;
  },
};

const lastActionColumn: ColumnDef<FactionMember> = {
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Last Action" />
  ),
  accessorKey: "last_action",
  enableSorting: true,
  sortingFn: (rowA, rowB) => {
    return (
      rowA.original.last_action.timestamp -
      rowB.original.last_action.timestamp
    );
  },
  cell: ({ row }) => {
    return <div>{row.original.last_action.relative}</div>;
  },
};

const pinnedColumn: ColumnDef<FactionMember> = {
  header: () => (
    <Tooltip>
      <TooltipTrigger>Pin</TooltipTrigger>
      <TooltipContent>
        <p>
          Toggle to pin or unpin a member to keep them at the top of the list.
        </p>
      </TooltipContent>
    </Tooltip>
  ),
  accessorKey: "pinned",
  enableSorting: false,
  cell: ({ row }) => {
    const selected = row.getIsSelected();

    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          row.toggleSelected();
        }}
      >
        {selected ? <PinOff /> : <Pin />}
      </Button>
    );
  },
};

const pinnedColumnMobile: ColumnDef<FactionMember> = {
  ...pinnedColumn,
  cell: ({ row }) => {
    const selected = row.getIsSelected();

    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          row.toggleSelected();
        }}
      >
        {selected ? <PinOff className="size-4" /> : <Pin className="size-4" />}
      </Button>
    );
  },
};

export function useFactionColumns(): ColumnDef<FactionMember>[] {
  const isMobile = useIsMobile();

  return useMemo(() => {
    if (isMobile) {
      return [
        onlineColumnMobile,
        nameColumn,
        statusColumnMobile,
        actionsColumnMobile,
        pinnedColumnMobile,
      ];
    }

    return [
      onlineColumn,
      nameColumn,
      actionsColumn,
      levelColumn,
      statusColumn,
      ffColumn,
      battleStatsColumn,
      lastActionColumn,
      pinnedColumn,
    ];
  }, [isMobile]);
}
