import { useEnemyMembers, useUserData } from "@/hooks/use-torn";
import type { Member } from "@/lib/faction";
import { type EnemyMember, useGlobalStore } from "@/lib/stores";
import { columns } from "./enemy-faction/columns";
import { DataTable } from "./enemy-faction/data-table";
import { Filters } from "./enemy-faction/filters";
import { RefreshCountdown } from "./refresh-countdown";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";

// Helper function to get priority for sorting
function getPlayerPriority(
  member: Member,
  userLocation: string | undefined
): number {
  const { status, last_action } = member;

  // Priority 1: Online in same location
  if (
    status.state === "Okay" &&
    last_action.status === "Online" &&
    userLocation &&
    status.description === userLocation
  ) {
    return 1;
  }

  // Priority 2: Other Okay players
  if (status.state === "Okay") {
    return 2;
  }

  // Priority 3: Hospital (will be sorted by time ascending separately)
  if (status.state === "Hospital") {
    return 3;
  }

  // Priority 4: Returning to torn
  if (status.state === "Traveling" && status.travel_type) {
    // Assuming travel_type contains "return" or similar for returning
    const travelType = status.travel_type.toLowerCase();
    if (travelType.includes("return") || travelType.includes("back")) {
      return 4;
    }
    // Priority 5: Traveling away
    return 5;
  }

  // Priority 6: Abroad
  if (status.state === "Abroad") {
    return 6;
  }

  // Default: lower priority for other states
  return 99;
}

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
        const threshold = parseFloat(ffFilter.replace("<", ""));
        return fairFight < threshold;
      });

      if (!matchesFF) {
        return false;
      }
    }

    return true;
  });
}

// Sorting function
function sortPlayers(
  members: EnemyMember[],
  userLocation: string | undefined
): EnemyMember[] {
  return [...members].sort((a, b) => {
    const priorityA = getPlayerPriority(a, userLocation);
    const priorityB = getPlayerPriority(b, userLocation);

    // First sort by priority
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // If both are Hospital, sort by time to get out (ascending)
    if (a.status.state === "Hospital" && b.status.state === "Hospital") {
      return a.status.until - b.status.until;
    }

    // Otherwise maintain current order
    return 0;
  });
}

export function EnemyFactionTable() {
  const { data: userData } = useUserData();

  // Hook to fetch and store enriched enemy members
  useEnemyMembers();

  // Read from store
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const enemyMembers = useGlobalStore((state) => state.enemyMembers);
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);

  // Get user's location from status description when state is "Okay"
  const userLocation =
    userData?.status.state === "Okay" ? userData.status.description : undefined;

  // Apply filters
  const filteredMembers = filterMembers(enemyMembers, filters);

  // Sort filtered members
  const sortedMembers = sortPlayers(filteredMembers, userLocation);

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
      <DataTable columns={columns} data={sortedMembers} />
    </div>
  );
}
