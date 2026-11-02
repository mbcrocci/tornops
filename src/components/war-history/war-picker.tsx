import { ChevronDown } from "lucide-react";
import type { FactionRankedWar } from "@/lib/faction";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { formatWarDate, isWarOngoing, warOpponent } from "./format";

/** Picks one or more ranked wars from the faction's list. */
export function WarPicker({
  wars,
  selectedWars,
  ownFactionId,
  timeZone,
  onChange,
}: {
  wars: FactionRankedWar[];
  selectedWars: FactionRankedWar[];
  ownFactionId: number | undefined;
  timeZone: string;
  onChange: (warIds: number[]) => void;
}) {
  const selectedIds = new Set(selectedWars.map((war) => war.id));
  const toggleWar = (warId: number) =>
    onChange(
      selectedIds.has(warId)
        ? [...selectedIds].filter((id) => id !== warId)
        : [...selectedIds, warId],
    );

  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <span>Ranked wars</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full min-w-0 justify-between px-3 font-normal text-foreground"
            disabled={wars.length === 0}
          >
            <span className="truncate">
              {selectedWars.length === 0
                ? "Choose wars"
                : selectedWars.length === 1
                  ? `${warOpponent(selectedWars[0], ownFactionId)?.name ?? `War ${selectedWars[0].id}`} · ${isWarOngoing(selectedWars[0]) ? "Ongoing" : formatWarDate(selectedWars[0].end, timeZone)}`
                  : `${selectedWars.length} wars selected`}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,28rem)] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selectedWars.length} of {wars.length} selected
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onChange(wars.map((war) => war.id))}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {wars.map((war) => {
              const rival = warOpponent(war, ownFactionId);
              const checkboxId = `war-${war.id}`;
              return (
                <label
                  key={war.id}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-muted"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selectedIds.has(war.id)}
                    onCheckedChange={() => toggleWar(war.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {rival?.name ?? `War ${war.id}`}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {formatWarDate(war.start, timeZone)} · #{war.id}
                      {isWarOngoing(war) && (
                        <span className="ml-1.5 uppercase text-primary">· Ongoing</span>
                      )}
                    </span>
                  </span>
                  {war.target > 0 && (
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {war.factions.find((faction) => faction.id === ownFactionId)?.score ?? 0}:
                      {rival?.score ?? 0}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
