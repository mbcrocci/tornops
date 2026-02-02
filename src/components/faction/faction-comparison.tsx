import { RotateCw } from "lucide-react";
import {
  useEnemyFactionData,
  useEnemyMembers,
  useUserFactionData,
  useUserMembers,
} from "@/hooks/use-torn";
import { type FactionMember } from "./columns";
import { useGlobalStore } from "@/lib/stores";
import { factionColumns } from "./columns";
import { DataTable } from "../enemy-faction/data-table";
import { Filters } from "../enemy-faction/filters";
import { RefreshCountdown } from "../refresh-countdown";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { EnemyFactionEmptyState } from "../enemy-faction";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

// Filtering function for faction members
function filterMembers(
  members: FactionMember[],
  filters: {
    onlineStatus: string[];
    state: string[];
    ff: string[];
  },
): FactionMember[] {
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
          case "6+":
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

function EnemyFactionContent() {
  // Hook to fetch and store enriched enemy members
  useEnemyMembers();

  // Get refetch function from react-query
  const { refetch } = useEnemyFactionData();

  // Read from store
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const enemyMembers = useGlobalStore((state) => state.enemyMembers);
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);
  const setLastRefreshTime = useGlobalStore(
    (state) => state.setLastRefreshTime,
  );

  // Apply filters
  const filteredMembers = filterMembers(enemyMembers, filters);

  // Handle refresh button click
  const handleRefresh = async () => {
    await refetch();
    setLastRefreshTime(Date.now());
  };

  if (!enemyMembers.length) {
    return <EnemyFactionEmptyState />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRefresh}
            aria-label="Refresh enemy faction data"
          >
            <RotateCw className="size-4" />
          </Button>
          <div>
            <h2 className="text-sm font-bold">
              {enemyFaction?.tag} - {enemyFaction?.name} [{enemyFaction?.id}] (
              {enemyFaction?.capacity} members)
            </h2>
            <RefreshCountdown />
          </div>
        </div>
        <Filters filters={filters} onFiltersChange={setFilters} />
      </div>
      <DataTable
        columns={factionColumns}
        data={filteredMembers}
        getRowId={(row) => String(row.id)}
      />
    </div>
  );
}

function UserFactionContent() {
  // Hook to fetch and store enriched user members
  useUserMembers();

  // Get refetch function from react-query
  const { refetch } = useUserFactionData();

  // Read from store
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const userMembers = useGlobalStore((state) => state.userMembers);
  const userFaction = useGlobalStore((state) => state.userFaction);
  const setLastRefreshTime = useGlobalStore(
    (state) => state.setLastRefreshTime,
  );

  // Apply filters
  const filteredMembers = filterMembers(userMembers, filters);

  // Handle refresh button click
  const handleRefresh = async () => {
    await refetch();
    setLastRefreshTime(Date.now());
  };

  if (!userMembers.length) {
    return (
      <Empty>
        <EmptyHeader className="min-w-lg">
          <EmptyTitle>No faction data</EmptyTitle>
          <EmptyDescription>
            Unable to load your faction data. Please check your API key and try
            again.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRefresh}
            aria-label="Refresh user faction data"
          >
            <RotateCw className="size-4" />
          </Button>
          <div>
            <h2 className="text-sm font-bold">
              {userFaction?.tag} - {userFaction?.name} [{userFaction?.id}] (
              {userFaction?.capacity} members)
            </h2>
            <RefreshCountdown />
          </div>
        </div>
        <Filters filters={filters} onFiltersChange={setFilters} />
      </div>
      <DataTable
        columns={factionColumns}
        data={filteredMembers}
        getRowId={(row) => String(row.id)}
      />
    </div>
  );
}

export function FactionComparison() {
  const collapsedCards = useGlobalStore((state) => state.collapsedCards);

  return (
    <Card className="w-full p-0 flex flex-col gap-1">
      <Tabs defaultValue="enemy" className="w-full gap-0">
        <CardHeader className="p-2 pb-0 gap-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger
                value="enemy"
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50"
              >
                Enemy Faction
              </TabsTrigger>
              <TabsTrigger
                value="user"
                className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/50"
              >
                Your Faction
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>
        <CardContent className={collapsedCards ? "hidden" : "p-2 pt-0"}>
          <TabsContent value="enemy">
            <EnemyFactionContent />
          </TabsContent>
          <TabsContent value="user">
            <UserFactionContent />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
