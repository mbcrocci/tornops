import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import type { FactionAttack } from "@/lib/faction";
import { type ResultGroup, resultGroup } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { formatDateTime, formatRespect } from "./format";

// The log is rarely read, so it opens short.
const INITIAL_ROWS = 10;
const PAGE_SIZE = 50;

type Direction = "outgoing" | "incoming";
type ResultFilter = "all" | ResultGroup;

const RESULT_FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All results" },
  { value: "hit", label: "Scored" },
  { value: "failed", label: "Wasted" },
  { value: "assist", label: "Assists" },
];

export function AttackLog({
  outgoing,
  incoming,
  timeZone,
}: {
  outgoing: FactionAttack[];
  incoming: FactionAttack[];
  timeZone: string;
}) {
  const [direction, setDirection] = useState<Direction>("outgoing");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(INITIAL_ROWS);
  const query = search.trim().toLowerCase();
  const rows = (direction === "outgoing" ? outgoing : incoming)
    .filter((attack) => resultFilter === "all" || resultGroup(attack) === resultFilter)
    .filter(
      (attack) =>
        !query ||
        attack.defender.name.toLowerCase().includes(query) ||
        (attack.attacker?.name.toLowerCase().includes(query) ?? false),
    )
    .reverse();
  const reset = () => setVisible(INITIAL_ROWS);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-primary" /> Attack log
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length.toLocaleString()} matching attacks, newest first
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={direction}
              onValueChange={(value) => {
                if (!value) return;
                setDirection(value as Direction);
                reset();
              }}
            >
              <ToggleGroupItem value="outgoing">Ours</ToggleGroupItem>
              <ToggleGroupItem value="incoming">Theirs</ToggleGroupItem>
            </ToggleGroup>
            <select
              aria-label="Result"
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={resultFilter}
              onChange={(event) => {
                setResultFilter(event.target.value as ResultFilter);
                reset();
              }}
            >
              {RESULT_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-full pl-8 sm:w-52"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  reset();
                }}
                placeholder="Attacker or defender"
              />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Attacker</th>
              <th className="px-3 py-2 font-medium">Defender</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 text-right font-medium">Chain</th>
              <th className="px-4 py-2 text-right font-medium">Respect</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.slice(0, visible).map((attack) => {
              const group = resultGroup(attack);
              return (
                <tr key={attack.id} className="hover:bg-muted/25">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                    {formatDateTime(attack.ended, timeZone)}
                  </td>
                  <td className="px-3 py-2">{attack.attacker?.name ?? "Stealthed"}</td>
                  <td className="px-3 py-2">{attack.defender.name}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          group === "hit"
                            ? "bg-primary"
                            : group === "failed"
                              ? "bg-destructive"
                              : "bg-muted-foreground/45",
                        )}
                        aria-hidden
                      />
                      {attack.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {attack.chain ?? "–"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {formatRespect(attack.respect_gain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No attacks match these filters.
          </p>
        )}
        {rows.length > visible && (
          <div className="flex justify-center pt-3">
            <Button variant="outline" size="sm" onClick={() => setVisible(visible + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, rows.length - visible)} more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
