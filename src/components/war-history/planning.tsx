import { ShieldAlert, Zap } from "lucide-react";
import { type ScheduleWindow, dangerWindows, pushWindows } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Card } from "../ui/card";
import { formatSigned, formatWindow, timeZoneLabel } from "./format";

function WindowRank({ index }: { index: number }) {
  return (
    <span
      className={cn(
        "grid size-7 place-items-center rounded-full font-mono text-xs",
        index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}

function EmptyWindows() {
  return (
    <p className="border-t pt-3 text-sm text-muted-foreground">
      The selected wars never covered a full three-hour window.
    </p>
  );
}

export function PlanningWindows({
  windows,
  timeZone,
  hasIncoming,
}: {
  windows: ScheduleWindow[];
  timeZone: string;
  hasIncoming: boolean;
}) {
  const pushes = pushWindows(windows);
  const dangers = dangerWindows(windows);

  return (
    <Card className="overflow-hidden border-primary/30 p-0">
      <div className="grid lg:grid-cols-2">
        <section className="border-b bg-primary/[0.06] p-5 lg:border-b-0 lg:border-r sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Zap className="size-4" /> Call the push
              </div>
              <h2 className="font-serif text-2xl font-semibold">Bring the most people</h2>
            </div>
            <span className="rounded-full border border-primary/30 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
              3 hours, {timeZoneLabel(timeZone)}
            </span>
          </div>
          <div className="space-y-3">
            {pushes.length === 0 && <EmptyWindows />}
            {pushes.map((window, index) => (
              <div
                key={window.startHour}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t pt-3",
                  index === 0 && "border-primary/40",
                )}
              >
                <WindowRank index={index} />
                <div>
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {formatWindow(window.startHour)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    attacked on {window.daysWithCoverage} of {window.sampledDays} war days ·{" "}
                    {formatSigned(window.averageNetRespect)} net respect a day
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {window.medianMembers}
                  </div>
                  <div className="text-[10px] text-muted-foreground">typical members</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 sm:p-6">
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-destructive">
              <ShieldAlert className="size-4" /> Turtle the gap
            </div>
            <h2 className="font-serif text-2xl font-semibold">
              {hasIncoming ? "Where the enemy outnumbers you" : "Expect fewer people"}
            </h2>
          </div>
          <div className="space-y-3">
            {dangers.length === 0 && <EmptyWindows />}
            {dangers.map((window) => (
              <div
                key={window.startHour}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t pt-3"
              >
                <div>
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {formatWindow(window.startHour)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {window.averageHitsTaken.toFixed(1)} hits taken a day ·{" "}
                    {formatSigned(window.averageNetRespect)} net respect
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {window.averageMembers.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">our attackers</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {window.enemyAverageAttackers.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">their attackers</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
        Counts are unique attackers per war day, using only days when the war ran for the whole
        window. An attack proves presence. Silence does not prove absence.
      </div>
    </Card>
  );
}
