import { useEnemyMembers } from "@/hooks/use-torn";
import { type EnemyMember, useGlobalStore } from "@/lib/stores";
import { columns } from "./enemy-faction/columns";
import { DataTable } from "./enemy-faction/data-table";
import { Filters } from "./enemy-faction/filters";
import { RefreshCountdown } from "./refresh-countdown";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";

// Filtering function
function filterMembers(
  members: EnemyMember[],
  filters: {
    onlineStatus: string[];
    state: string[];
    ff: string[];
  }
): EnemyMember[] {
  return members.filter((member) => {
    // Filter by online status
    if (filters.onlineStatus.length > 0) {
      if (!filters.onlineStatus.includes(member.last_action.status)) {
        return false;
      }
    }

    // Filter by state
    if (filters.state.length > 0) {
      if (!filters.state.includes(member.status.state)) {
        return false;
      }
    }

    // Filter by fair fight
    if (filters.ff.length > 0) {
      const fairFight = member.ffs?.fair_fight;
      if (fairFight === undefined) {
        return false;
      }

      const matchesFF = filters.ff.some((ffFilter) => {
        switch (ffFilter) {
          case "0-2":
            return fairFight >= 0 && fairFight < 2;
          case "2-4":
            return fairFight >= 2 && fairFight < 4;
          case "4-6":
            return fairFight >= 4 && fairFight < 6;
          case "6-":
            return fairFight >= 6;
          default:
            return false;
        }
      });

      if (!matchesFF) {
        return false;
      }
    }

    return true;
  });
}

export function EnemyFactionTable() {
  // Hook to fetch and store enriched enemy members
  useEnemyMembers();

  // Read from store
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const enemyMembers = useGlobalStore((state) => state.enemyMembers);
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);

  // Apply filters
  const filteredMembers = filterMembers(enemyMembers, filters);

  if (!enemyMembers.length) {
    return (
      <Empty className="">
        <EmptyHeader className="min-w-lg">
          <EmptyTitle>No enemy faction</EmptyTitle>
          <EmptyDescription>
            You are not currently in a war. If you want to monitor an enemy
            faction, open the settings and input the enemy faction ID.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">
            {enemyFaction?.tag} - {enemyFaction?.name} [{enemyFaction?.id}] (
            {enemyFaction?.capacity} members)
          </h2>
          <RefreshCountdown />
        </div>
        <Filters filters={filters} onFiltersChange={setFilters} />
      </div>
      <DataTable columns={columns} data={filteredMembers} />
    </div>
  );
}
