import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, RotateCw } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import {
  BOUNTY_LIST_REFRESH_INTERVAL,
  useBounties,
  useBountyFFScouterData,
  useBountyStatuses,
} from "@/hooks/use-bounties";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import { type BountyRow, groupBounties, isAvailable, withinFF, withinLevel } from "@/lib/bounties";
import { playerProfileLink } from "@/lib/links";
import { useBountyStore, useCredentialsStore } from "@/lib/stores";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTable } from "./enemy-faction/data-table";
import { AttackButton, FairFightValue, PlayerStatusBadge, ProfileButton } from "./player-status";
import { RefreshCountdown } from "./refresh-countdown";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const MIN_REFRESH_SECONDS = 10;
const PAGE_SIZE = 20;

const STATUS_ORDER: Record<string, number> = {
  Okay: 1,
  Hospital: 2,
  Traveling: 3,
  Abroad: 4,
};

const formatMoney = (amount: number) => `$${amount.toLocaleString()}`;

const columns: ColumnDef<BountyRow>[] = [
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Reward" />,
    accessorKey: "reward",
    enableSorting: true,
    cell: ({ row }) => {
      const { reward, totalReward, count, reasons } = row.original;
      const title = [
        `${count} ${count === 1 ? "bounty" : "bounties"} worth ${formatMoney(totalReward)} in total`,
        ...reasons,
      ].join("\n");
      return (
        <div className="tabular-nums" title={title}>
          {formatMoney(reward)}
          {count > 1 && <span className="ml-1 text-xs text-muted-foreground">×{count}</span>}
        </div>
      );
    },
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    accessorKey: "name",
    enableSorting: true,
    cell: ({ row }) => (
      <a href={playerProfileLink(row.original.id)} target="_blank" rel="noopener noreferrer">
        {row.original.name}
      </a>
    ),
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Level" />,
    accessorKey: "level",
    enableSorting: true,
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="FF" />,
    id: "ff",
    accessorFn: (row) => row.ffs?.fair_fight,
    enableSorting: true,
    sortUndefined: "last",
    cell: ({ row }) => <FairFightValue ff={row.original.ffs?.fair_fight} />,
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Battle Stats" />,
    id: "battle_stats",
    accessorFn: (row) => row.ffs?.bs_estimate,
    enableSorting: true,
    sortUndefined: "last",
    cell: ({ row }) => <div>{row.original.ffs?.bs_estimate_human ?? "N/A"}</div>,
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    accessorKey: "status",
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const statusA = rowA.original.status;
      const statusB = rowB.original.status;
      // Players without a looked-up status sort last.
      const orderA = statusA ? (STATUS_ORDER[statusA.state] ?? 99) : 100;
      const orderB = statusB ? (STATUS_ORDER[statusB.state] ?? 99) : 100;
      if (orderA !== orderB) return orderA - orderB;
      if (statusA?.state === "Hospital" && statusB?.state === "Hospital") {
        return statusA.until - statusB.until;
      }
      return 0;
    },
    cell: ({ row }) =>
      row.original.status ? (
        <PlayerStatusBadge
          id={row.original.id}
          status={row.original.status}
          showTravelEta={false}
        />
      ) : (
        <div className="text-center text-muted-foreground">—</div>
      ),
  },
  {
    header: "Actions",
    id: "actions",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex gap-2">
        <ProfileButton playerId={row.original.id} />
        <AttackButton playerId={row.original.id} />
      </div>
    ),
  },
];

const parseOptionalNumber = (value: string) => {
  const number = Number.parseFloat(value);
  return value === "" || !Number.isFinite(number) ? undefined : number;
};

function BountyFiltersBar({ hasFFScouterKey }: { hasFFScouterKey: boolean }) {
  const id = useId();
  const { maxLevel, maxFF, onlyAvailable, refreshInterval, setFilters, setRefreshInterval } =
    useBountyStore();
  const [refreshSeconds, setRefreshSeconds] = useState(String(refreshInterval / 1000));

  const commitRefresh = () => {
    const seconds = Math.max(MIN_REFRESH_SECONDS, Number.parseFloat(refreshSeconds) || 0);
    setRefreshInterval(seconds * 1000);
    setRefreshSeconds(String(seconds));
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-level`}>Max level</Label>
        <Input
          id={`${id}-level`}
          className="w-28"
          type="number"
          min={1}
          max={100}
          placeholder="Any"
          value={maxLevel ?? ""}
          onChange={(e) => setFilters({ maxLevel: parseOptionalNumber(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-ff`}>Max FF</Label>
        <Input
          id={`${id}-ff`}
          className="w-28"
          type="number"
          min={1}
          step={0.1}
          placeholder={hasFFScouterKey ? "Any" : "No FFScouter key"}
          disabled={!hasFFScouterKey}
          value={hasFFScouterKey ? (maxFF ?? "") : ""}
          onChange={(e) => setFilters({ maxFF: parseOptionalNumber(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-refresh`}>Refresh (seconds)</Label>
        <Input
          id={`${id}-refresh`}
          className="w-28"
          type="number"
          min={MIN_REFRESH_SECONDS}
          value={refreshSeconds}
          onChange={(e) => setRefreshSeconds(e.target.value)}
          onBlur={commitRefresh}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRefresh();
          }}
        />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Checkbox
          id={`${id}-available`}
          checked={onlyAvailable}
          onCheckedChange={(checked) => setFilters({ onlyAvailable: checked === true })}
        />
        <Label htmlFor={`${id}-available`}>Only available</Label>
      </div>
    </div>
  );
}

export function Bounties() {
  const hasFFScouterKey = useCredentialsStore((state) => Boolean(state.ffscouterKey));
  const { maxLevel, maxFF, onlyAvailable, refreshInterval } = useBountyStore();
  const { data: bounties, dataUpdatedAt, isPending, isError, error, refetch } = useBounties();

  const targets = useMemo(
    () => groupBounties(bounties ?? []).filter((target) => withinLevel(target, maxLevel)),
    [bounties, maxLevel],
  );
  const { data: ffScouterData, isFetching: isFetchingFF } = useBountyFFScouterData(
    targets.map((target) => target.id),
  );
  const ffsById = useMemo(
    () => new Map<number, FFScouterData>(ffScouterData?.map((ffs) => [ffs.player_id, ffs])),
    [ffScouterData],
  );

  const effectiveMaxFF = hasFFScouterKey ? maxFF : undefined;
  const candidates = useMemo(
    () => targets.filter((target) => withinFF(ffsById.get(target.id), effectiveMaxFF)),
    [targets, ffsById, effectiveMaxFF],
  );
  const candidateIds = useMemo(() => candidates.map((target) => target.id), [candidates]);

  // The page on screen is checked first; everyone else is crawled by reward in the background.
  const [pageIds, setPageIds] = useState<number[]>([]);
  const handleVisibleRowsChange = useCallback((rowIds: string[]) => {
    setPageIds(rowIds.map(Number));
  }, []);
  const statuses = useBountyStatuses(pageIds, candidateIds);

  const checkedCount = candidateIds.filter((id) => statuses.getStatus(id)).length;
  const failed = pageIds.filter((id) => statuses.hasFailed(id)).length;
  const isCheckingPage = pageIds.some((id) => statuses.isChecking(id));

  // Players whose status is not known yet are hidden until the crawler reaches them.
  const rows: BountyRow[] = candidates
    .map((target) => ({
      ...target,
      ffs: ffsById.get(target.id),
      status: statuses.getStatus(target.id),
    }))
    .filter((row) => !onlyAvailable || isAvailable(row.status));

  const handleRefresh = async () => {
    statuses.refreshAll();
    await refetch();
  };

  return (
    <div className="container mx-auto flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRefresh}
            aria-label="Refresh bounties"
          >
            <RotateCw className="size-4" />
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              Bounties ({rows.length} of {targets.length} targets)
              {(isFetchingFF || isCheckingPage) && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              Status known for {checkedCount} of {candidates.length} · players around are rechecked
              every {refreshInterval / 1000}s
            </p>
            {dataUpdatedAt > 0 && (
              <RefreshCountdown
                lastRefreshTime={dataUpdatedAt}
                refetchInterval={BOUNTY_LIST_REFRESH_INTERVAL}
                label="Bounty list refreshes"
              />
            )}
          </div>
        </div>
        <BountyFiltersBar hasFFScouterKey={hasFFScouterKey} />
      </div>

      {failed > 0 && (
        <p className="text-xs text-destructive">
          Could not load the status of {failed} target{failed === 1 ? "" : "s"} on this page.
        </p>
      )}

      {isPending ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading bounties…
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          Failed to load bounties: {error.message}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          initialSorting={[{ id: "reward", desc: true }]}
          pageSize={PAGE_SIZE}
          onVisibleRowsChange={handleVisibleRowsChange}
        />
      )}
    </div>
  );
}
