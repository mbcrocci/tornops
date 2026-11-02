import { Link } from "@tanstack/react-router";
import { ArrowLeft, Coins, RefreshCw, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import {
  useFactionAttackHistory,
  useFactionRankedWars,
  useUserFactionData,
} from "@/hooks/use-torn";
import { cn } from "@/lib/utils";
import { PayoutCalculator } from "./payouts/payout-calculator";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { isWarOngoing } from "./war-history/format";
import { WarPicker } from "./war-history/war-picker";

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}

/** Splits a war payout between the members, from the ranked-war hits in the chosen wars. */
export function WarPayout({
  selectedWarIds,
  onSelectWars,
}: {
  /** Undefined picks the most recent war. */
  selectedWarIds: number[] | undefined;
  onSelectWars: (warIds: number[]) => void;
}) {
  const warsQuery = useFactionRankedWars();
  const usingCachedWars = warsQuery.data?.source === "cache";
  const factionQuery = useUserFactionData(warsQuery.isSuccess && !usingCachedWars);
  const wars = warsQuery.data?.wars ?? [];
  const selectedWars = useMemo(() => {
    if (selectedWarIds === undefined) return wars.slice(0, 1);
    const ids = new Set(selectedWarIds);
    return wars.filter((war) => ids.has(war.id));
  }, [selectedWarIds, wars]);
  const attackRanges = useMemo(
    () =>
      selectedWars.map((war) => ({
        id: war.id,
        from: war.start,
        to: isWarOngoing(war) ? 0 : war.end + 1,
      })),
    [selectedWars],
  );
  const attackQuery = useFactionAttackHistory(attackRanges);
  const outgoing = useMemo(
    () => (attackQuery.data?.attacks ?? []).filter((attack) => attack.is_ranked_war),
    [attackQuery.data],
  );

  const isPending = warsQuery.isPending || Boolean(selectedWars.length && attackQuery.isPending);
  const isFetching = warsQuery.isFetching || attackQuery.isFetching;
  const error = warsQuery.error ?? attackQuery.error;
  const refresh = () => {
    void warsQuery.refetch();
    if (selectedWars.length) void attackQuery.refetchFresh();
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-12 pt-5 sm:px-6">
      <section className="mb-6 grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            <Coins className="size-4" aria-hidden />
            Faction intelligence
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            War payout
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Share a payout between the members who hit in one or more ranked wars. Only ranked-war
            hits that earned respect count.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(290px,1fr)_auto_auto] sm:items-end">
          <WarPicker
            wars={wars}
            selectedWars={selectedWars}
            ownFactionId={factionQuery.data?.ID}
            timeZone="local"
            onChange={onSelectWars}
          />
          <Button variant="outline" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={cn(isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <Link to="/war-report">
              <ArrowLeft />
              War report
            </Link>
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex gap-3 py-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">War history is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The Torn API request failed."} The key
                needs Limited Access and the faction API Access permission.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground">
          <div>
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="size-4 animate-spin" />
              {warsQuery.isPending
                ? "Loading ranked wars…"
                : `Loading every attack from ${selectedWars.length} ${selectedWars.length === 1 ? "war" : "wars"}…`}
            </div>
            {!warsQuery.isPending && (
              <p className="mt-2 text-xs">
                If Torn applies its request limit, loading pauses for 65 seconds before retrying.
              </p>
            )}
          </div>
        </div>
      ) : wars.length === 0 ? (
        <Notice title="No ranked wars found">
          Torn did not return any ranked wars for this faction.
        </Notice>
      ) : selectedWars.length === 0 ? (
        <Notice title="Choose at least one war">
          Open the war selector and pick the wars to pay out.
        </Notice>
      ) : (
        <PayoutCalculator
          attacks={outgoing}
          title="War payout"
          hitLabel="War hits"
          hitDescription="War hits are ranked-war attacks in the selected wars that earned respect."
        />
      )}
    </main>
  );
}
