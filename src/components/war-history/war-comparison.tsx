import { Layers3 } from "lucide-react";
import type { FactionRankedWar } from "@/lib/faction";
import type { AttackTotals } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  formatPercent,
  formatRespect,
  formatSigned,
  formatWarDate,
  warOpponent,
  warOutcome,
} from "./format";

export type WarComparisonRow = { war: FactionRankedWar; totals: AttackTotals };

export function WarComparison({
  rows,
  ownFactionId,
  timeZone,
}: {
  rows: WarComparisonRow[];
  ownFactionId: number | undefined;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers3 className="size-4 text-primary" /> War by war
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Is the faction getting better? Oldest war first.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">War</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 text-right font-medium">Attackers</th>
              <th className="px-3 py-2 text-right font-medium">Hits</th>
              <th className="px-3 py-2 text-right font-medium">Wasted</th>
              <th className="px-3 py-2 text-right font-medium">Respect / hit</th>
              <th className="px-3 py-2 text-right font-medium">Hits taken</th>
              <th className="px-4 py-2 text-right font-medium">Net respect</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...rows]
              .sort((a, b) => a.war.start - b.war.start)
              .map(({ war, totals }) => {
                const opponent = warOpponent(war, ownFactionId);
                const own = war.factions.find((faction) => faction.id === ownFactionId);
                const outcome = warOutcome(war, ownFactionId);
                const net = totals.respect - totals.respectLost;
                return (
                  <tr key={war.id} className="hover:bg-muted/25">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{opponent?.name ?? `War ${war.id}`}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatWarDate(war.start, timeZone)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {war.target > 0 ? (
                        <span className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "text-xs font-semibold uppercase",
                              outcome === "Victory"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : outcome === "Defeat"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {outcome}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {own?.score ?? 0}:{opponent?.score ?? 0}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not cached</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {totals.attackers}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{totals.hits}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPercent(totals.attacks ? totals.failed / totals.attacks : 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatRespect(totals.respectPerHit)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {totals.hitsTaken}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatSigned(net)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
