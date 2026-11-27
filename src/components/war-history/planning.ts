import type { Html } from "@effect/ui/html";
import { ShieldAlert, Zap } from "lucide";
import { dangerWindows, pushWindows, type ScheduleWindow } from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { Card } from "../ui/primitives";
import { formatSigned, formatWindow, timeZoneLabel } from "./format";

const EmptyWindows = <M>(h: Html.H<M>) =>
  h.p
    .class("border-t pt-3 text-sm text-muted-foreground")
    .children("The selected wars never covered a full three-hour window.");

const Figure = <M>(h: Html.H<M>, value: string, label: string) =>
  h.div
    .class("text-right")
    .children(
      h.div.class("font-mono text-xl font-semibold tabular-nums").children(value),
      h.div.class("text-[10px] text-muted-foreground").children(label),
    );

export const PlanningWindows = <M>(
  h: Html.H<M>,
  windows: ScheduleWindow[],
  timeZone: string,
  hasIncoming: boolean,
) => {
  const pushes = pushWindows(windows);
  const dangers = dangerWindows(windows);
  return Card(h, { class: "overflow-hidden border-primary/30 p-0" }).children(
    h.div.class("grid lg:grid-cols-2").children(
      h.section.class("border-b bg-primary/[0.06] p-5 lg:border-b-0 lg:border-r sm:p-6").children(
        h.div
          .class("mb-5 flex items-start justify-between gap-4")
          .children(
            h.div.children(
              h.div
                .class(
                  "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary",
                )
                .children(Icon(h, Zap, { class: "size-4" }), " Call the push"),
              h.h2.class("font-serif text-2xl font-semibold").children("Bring the most people"),
            ),
            h.span
              .class(
                "rounded-full border border-primary/30 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground",
              )
              .children(`3 hours, ${timeZoneLabel(timeZone)}`),
          ),
        h.div.class("space-y-3").children(
          pushes.length === 0 && EmptyWindows(h),
          pushes.map((window, index) =>
            h.div
              .key(String(window.startHour))
              .class(
                cn(
                  "grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t pt-3",
                  index === 0 && "border-primary/40",
                ),
              )
              .children(
                h.span
                  .class(
                    cn(
                      "grid size-7 place-items-center rounded-full font-mono text-xs",
                      index === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    ),
                  )
                  .children(String(index + 1)),
                h.div.children(
                  h.div
                    .class("font-mono text-lg font-semibold tabular-nums")
                    .children(formatWindow(window.startHour)),
                  h.div
                    .class("text-xs text-muted-foreground")
                    .children(
                      `attacked on ${window.daysWithCoverage} of ${window.sampledDays} war days · ${formatSigned(window.averageNetRespect)} net respect a day`,
                    ),
                ),
                Figure(h, String(window.medianMembers), "typical members"),
              ),
          ),
        ),
      ),
      h.section.class("p-5 sm:p-6").children(
        h.div
          .class("mb-5")
          .children(
            h.div
              .class(
                "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-destructive",
              )
              .children(Icon(h, ShieldAlert, { class: "size-4" }), " Turtle the gap"),
            h.h2
              .class("font-serif text-2xl font-semibold")
              .children(hasIncoming ? "Where the enemy outnumbers you" : "Expect fewer people"),
          ),
        h.div.class("space-y-3").children(
          dangers.length === 0 && EmptyWindows(h),
          dangers.map((window) =>
            h.div
              .key(String(window.startHour))
              .class("grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t pt-3")
              .children(
                h.div.children(
                  h.div
                    .class("font-mono text-lg font-semibold tabular-nums")
                    .children(formatWindow(window.startHour)),
                  h.div
                    .class("text-xs text-muted-foreground")
                    .children(
                      `${window.averageHitsTaken.toFixed(1)} hits taken a day · ${formatSigned(window.averageNetRespect)} net respect`,
                    ),
                ),
                Figure(h, window.averageMembers.toFixed(1), "our attackers"),
                Figure(h, window.enemyAverageAttackers.toFixed(1), "their attackers"),
              ),
          ),
        ),
      ),
    ),
    h.div
      .class("border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground")
      .children(
        "Counts are unique attackers per war day, using only days when the war ran for the whole window. An attack proves presence. Silence does not prove absence.",
      ),
  );
};
