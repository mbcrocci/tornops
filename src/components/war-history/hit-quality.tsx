import { Crosshair } from "lucide-react";
import type { WarAnalysis, ResultGroup } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatPercent, formatRespect } from "./format";

const GROUP_STYLE: Record<ResultGroup, { fill: string; label: string }> = {
  hit: { fill: "bg-primary", label: "Scored" },
  failed: { fill: "bg-destructive", label: "Wasted" },
  assist: { fill: "bg-muted-foreground/45", label: "Assist or other" },
  other: { fill: "bg-muted-foreground/45", label: "Assist or other" },
};

function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-l-2 border-primary/60 pl-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function HitQuality({ analysis }: { analysis: WarAnalysis }) {
  const { totals, results, targets } = analysis;
  const maxCount = Math.max(1, ...results.map((result) => result.count));
  const topTargets = targets.slice(0, 8);
  const topTargetsShare =
    totals.hits > 0
      ? topTargets.slice(0, 5).reduce((sum, target) => sum + target.hits, 0) / totals.hits
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crosshair className="size-4 text-primary" /> How we hit
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          What each attack ended in, and how much respect it earned
        </p>
      </CardHeader>
      <CardContent className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Figure
              label="Wasted attacks"
              value={formatPercent(totals.attacks ? totals.failed / totals.attacks : 0)}
              detail={`${totals.failed} lost, stalemated, escaped or timed out`}
            />
            <Figure
              label="Respect per hit"
              value={formatRespect(totals.respectPerHit)}
              detail={
                totals.bonusHits
                  ? `excludes ${totals.bonusHits} chain bonus ${totals.bonusHits === 1 ? "hit" : "hits"} (${formatRespect(totals.bonusRespect)})`
                  : "no chain bonus hits in this selection"
              }
            />
            <Figure
              label="Fair fight"
              value={totals.fairFight === null ? "–" : `${totals.fairFight.toFixed(2)}×`}
              detail={
                totals.fairFight === null
                  ? "Torn did not report fair fight for these attacks"
                  : "average on successful hits, 3.00× is the best possible"
              }
            />
            <Figure
              label="Top five carry"
              value={formatPercent(analysis.topFiveShare)}
              detail="of all respect came from five members"
            />
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Attack results</h3>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {(["hit", "failed", "assist"] as const).map((group) => (
                  <span key={group} className="flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-[2px]", GROUP_STYLE[group].fill)} />
                    {GROUP_STYLE[group].label}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {results.map((result) => (
                <div
                  key={result.result}
                  className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-xs"
                >
                  <span className="truncate">{result.result}</span>
                  <div className="h-3">
                    <div
                      className={cn("h-full rounded-r-[4px]", GROUP_STYLE[result.group].fill)}
                      style={{ width: `${(result.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-right font-mono tabular-nums">
                    {result.count}
                    <span className="ml-1.5 text-muted-foreground">
                      {formatPercent(result.count / Math.max(1, totals.attacks))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Most-hit enemies</h3>
            <span className="text-xs text-muted-foreground">
              {targets.length} targets · top five took {formatPercent(topTargetsShare)} of hits
            </span>
          </div>
          {topTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No successful hits.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Enemy</th>
                  <th className="px-3 py-1.5 text-right font-medium">Hits</th>
                  <th className="px-3 py-1.5 text-right font-medium">Respect</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topTargets.map((target) => (
                  <tr key={target.id}>
                    <td className="px-3 py-1.5">
                      <a
                        className="hover:text-primary hover:underline"
                        href={`https://www.torn.com/profiles.php?XID=${target.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {target.name}
                      </a>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{target.hits}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatRespect(target.respect)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
