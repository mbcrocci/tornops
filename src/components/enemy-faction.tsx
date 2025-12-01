import { useFFScouterData } from "@/hooks/use-ffscouter";
import { useEnemyFactionData, useUserData } from "@/hooks/use-torn";
import type { Member } from "@/lib/faction";
import { columns } from "./enemy-faction/columns";
import { DataTable } from "./enemy-faction/data-table";
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

type MemberWithId = Member & {
  id: number;
};

// Sorting function
function sortPlayers(
  members: MemberWithId[],
  userLocation: string | undefined
): MemberWithId[] {
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
  const { data: enemyFactionData } = useEnemyFactionData();

  // Get user's location from status description when state is "Okay"
  const userLocation =
    userData?.status.state === "Okay" ? userData.status.description : undefined;

  // Convert members object to array and sort
  const members: MemberWithId[] = enemyFactionData?.members
    ? Object.entries(enemyFactionData.members).map(([id, member]) => ({
        ...member,
        id: parseInt(id, 10),
      }))
    : [];
  const sortedMembers = sortPlayers(members, userLocation);

  const { data: ffScouterData } = useFFScouterData(
    sortedMembers.map((member) => member.id)
  );

  if (!enemyFactionData) {
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
    <div>
      <h2 className="text-xl font-bold mb-4">
        {enemyFactionData?.tag} - {enemyFactionData?.name} [
        {enemyFactionData?.ID}] ({enemyFactionData?.capacity} members)
      </h2>
      <DataTable
        columns={columns}
        data={sortedMembers.map((m) => {
          const ffs = (ffScouterData ?? []).find((f) => f.player_id === m.id);
          return {
            ...m,
            ffs,
          };
        })}
      />
    </div>
  );
}
