import { Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import {
  useCheckWarsForEnemyFaction,
  useEnemyFactionData,
  useEnemyMembers,
} from "@/hooks/use-torn";
import { type EnemyMember, useCredentialsStore, useGlobalStore } from "@/lib/stores";
import { columns } from "./enemy-faction/columns";
import { DataTable } from "./enemy-faction/data-table";
import { Filters } from "./enemy-faction/filters";
import { RefreshCountdown } from "./refresh-countdown";
import { Button } from "./ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";
import { Label } from "./ui/label";

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

export function EnemyFactionEmptyState() {
  const setEnemyFactionId = useGlobalStore((state) => state.setEnemyFactionId);
  const [enemyFactionIdInput, setEnemyFactionIdInput] = useState<
    number | undefined
  >(undefined);
  const publicKey = useCredentialsStore((state) => state.publicKey ?? "");
  const {
    mutate: checkWars,
    isPending: isCheckingWars,
    isError: isCheckWarsError,
    isSuccess: isCheckWarsSuccess,
    data: checkWarsData,
  } = useCheckWarsForEnemyFaction();

  return (
    <Empty className="">
      <EmptyHeader className="min-w-lg">
        <EmptyTitle>No enemy faction</EmptyTitle>
        <EmptyDescription>
          Enter an enemy faction ID to monitor their members and chain
          activity.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Label htmlFor="enemy-faction-id-empty">Enemy Faction ID</Label>
          <InputGroup>
            <InputGroupInput
              id="enemy-faction-id-empty"
              type="number"
              placeholder="1234567890"
              value={enemyFactionIdInput ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setEnemyFactionIdInput(value ? parseInt(value, 10) : undefined);
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={() => setEnemyFactionId(enemyFactionIdInput)}
              >
                Save
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div className="my-4 border-t" />
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => checkWars()}
            disabled={!publicKey || isCheckingWars}
          >
            {isCheckingWars ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                <span>Checking…</span>
              </>
            ) : (
              "Check for wars"
            )}
          </Button>
          {!publicKey && (
            <p className="text-muted-foreground text-xs">
              Add your API key in settings to use this.
            </p>
          )}
          {isCheckWarsSuccess && checkWarsData?.enemySet === false && (
            <p className="text-muted-foreground text-sm">No active wars.</p>
          )}
          {isCheckWarsError && (
            <p className="text-destructive text-sm">
              Failed to check wars. Check your API key and try again.
            </p>
          )}
        </div>
      </EmptyContent>
    </Empty>
  );
}

export function EnemyFactionTable() {
  // Hook to fetch and store enriched enemy members
  useEnemyMembers();

  // Get refetch function from react-query
  const { refetch } = useEnemyFactionData();

  // Read from store
  const filters = useGlobalStore((state) => state.filters);
  const setFilters = useGlobalStore((state) => state.setFilters);
  const enemyMembers = useGlobalStore((state) => state.enemyMembers);
  const enemyFaction = useGlobalStore((state) => state.enemyFaction);
  const setLastRefreshTime = useGlobalStore((state) => state.setLastRefreshTime);

  // Apply filters
  const filteredMembers = filterMembers(enemyMembers, filters);

  // Handle refresh button click
  const handleRefresh = async () => {
    await refetch();
    setLastRefreshTime(Date.now());
  };

  if (!enemyMembers.length) {
    return (
      <EnemyFactionEmptyState />
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
        columns={columns}
        data={filteredMembers}
        getRowId={(row) => String(row.id)}
      />
    </div>
  );
}
