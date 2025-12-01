import type { Member } from "@/lib/faction";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Swords } from "lucide-react";
import { HospitalCountdown } from "../hospital-countdown";
import { cleanStatusDescription, getStatusBgColorClass } from "@/lib/status";
import { buttonVariants } from "../ui/button";
import type { FFScouterData } from "@/hooks/use-ffscouter";

export type EnemyFactionMember = Member & {
  id: number;
  ffs?: FFScouterData;
};

export const columns: ColumnDef<EnemyFactionMember>[] = [
  {
    header: "Online",
    accessorKey: "online",
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
    header: "Name",
    accessorKey: "name",
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
    header: "Level",
    accessorKey: "level",
    cell: ({ row }) => {
      return <div>{row.original.level}</div>;
    },
  },
  {
    header: "Status",
    accessorKey: "status",
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
    header: "FF",
    accessorKey: "ff",
    cell: ({ row }) => {
      if (!row.original.ffs) {
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
    header: "Battle Stats",
    accessorKey: "battle_stats",
    cell: ({ row }) => {
      return <div>{row.original.ffs?.bs_estimate_human}</div>;
    },
  },
  {
    header: "Last Action",
    accessorKey: "last_action",
    cell: ({ row }) => {
      return <div>{row.original.last_action.relative}</div>;
    },
  },
];
