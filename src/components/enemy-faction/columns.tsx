import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pin, PinOff, Swords } from "lucide-react";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import type { Member } from "@/lib/faction";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { cleanStatusDescription, getStatusBgColorClass } from "@/lib/status";
import { DataTableColumnHeader } from "../data-table-column-header";
import { HospitalCountdown } from "../hospital-countdown";
import { Button, buttonVariants } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type EnemyFactionMember = Member & {
  id: number;
  ffs?: FFScouterData;
  pinned?: boolean;
};

export const columns: ColumnDef<EnemyFactionMember>[] = [
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Online" />
    ),
    accessorKey: "online",
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const statusA = rowA.original.last_action.status;
      const statusB = rowB.original.last_action.status;

      // Order: Online > Idle > Offline
      const statusOrder: Record<string, number> = {
        Online: 1,
        Idle: 2,
        Offline: 3,
      };

      return (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
    },
    cell: ({ row }) => {
      const status = row.original.last_action.status;
      let color = "bg-gray-600";
      if (status === "Online") {
        color = "bg-green-600";
      } else if (status === "Idle") {
        color = "bg-yellow-600";
      }

      return (
        <div
          className={`${color} text-white font-semibold px-3 py-2 rounded-md text-center shadow-sm`}
        >
          {status}
        </div>
      );
    },
  },
  {
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
  },
  {
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
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Level" />
    ),
    accessorKey: "level",
    enableSorting: true,
    cell: ({ row }) => {
      return <div>{row.original.level}</div>;
    },
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    accessorKey: "status",
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const stateA = rowA.original.status.state;
      const stateB = rowB.original.status.state;

      // Order: Okay > Hospital > Traveling > Abroad > others
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

      // If both are Hospital, sort by time remaining
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
          )} text-white font-semibold px-3 py-2 rounded-md  text-center shadow-sm`}
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
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="FF" />
    ),
    accessorKey: "ff",
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const ffA = rowA.original.ffs?.fair_fight;
      const ffB = rowB.original.ffs?.fair_fight;

      // Treat undefined/null as highest value (sort to bottom)
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
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Battle Stats" />
    ),
    accessorKey: "battle_stats",
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const bsA = rowA.original.ffs?.bs_estimate;
      const bsB = rowB.original.ffs?.bs_estimate;

      // Treat undefined/null as highest value (sort to bottom)
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
  },
  {
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
  },
  {
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
  },
];
