import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Download } from "lucide-react";
import { usePresenceHistoryState } from "@/lib/faction-presence";
import { useGlobalStore } from "@/lib/stores";
import { analyzeActivity, readActivity, readActivityFactions } from "@/lib/activity-tracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const selectClass = "h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-ring";

export function WarPlanning() {
  const { revision, errors } = usePresenceHistoryState();
  const client = useQueryClient();
  const savedFactions = useQuery({
    queryKey: ["activity-factions"],
    queryFn: readActivityFactions,
  });
  const factions = savedFactions.data ?? [];
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ["activity-factions"] });
    void client.invalidateQueries({ queryKey: ["tracked-activity"] });
  }, [revision, client]);
  const opponent = useGlobalStore((state) => state.enemyFactionId);
  const ownFaction = useGlobalStore((state) => state.userFaction);
  const [selected, setSelected] = useState<number | undefined>(factions[0]?.id);
  const [daysBack, setDaysBack] = useState(7);
  const [timeZone, setTimeZone] = useState("UTC");
  const [includeIdle, setIncludeIdle] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedHour, setSelectedHour] = useState(new Date().getUTCHours());
  const factionId = factions.some((f) => f.id === selected)
    ? selected
    : (factions.find((f) => f.id === opponent)?.id ??
      factions.find((f) => f.id === ownFaction?.id)?.id ??
      factions[0]?.id);
  const faction = factions.find((f) => f.id === factionId);
  const history = useQuery({
    queryKey: ["tracked-activity", factionId],
    queryFn: () => readActivity(factionId!),
    enabled: Boolean(factionId),
  });
  const rows = useMemo(
    () => (history.data ?? []).filter((row) => row.hour >= Date.now() - daysBack * 86_400_000),
    [history.data, daysBack],
  );
  const analysis = useMemo(
    () => analyzeActivity(rows, includeIdle, timeZone),
    [rows, includeIdle, timeZone],
  );
  const measured = analysis.hourly.filter((hour) => hour.average !== null);
  const strongest = [...measured].sort((a, b) => b.average! - a.average!)[0];
  const quietest = [...measured].sort((a, b) => a.average! - b.average!)[0];
  const max = Math.max(1, ...measured.map((hour) => hour.average!));
  const members = analysis.members
    .filter((member) => `${member.name} ${member.id}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aHour = a.hourly[selectedHour];
      const bHour = b.hourly[selectedHour];
      return (
        (bHour.samples ? bHour.active / bHour.samples : -1) -
        (aHour.samples ? aHour.active / aHour.samples : -1)
      );
    });
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const wholeHourLocal =
    new Intl.DateTimeFormat("en", { timeZone: localZone, minute: "2-digit" }).format(
      Math.floor(Date.now() / 3_600_000) * 3_600_000,
    ) === "00";
  const zones = [
    ...new Set([
      "UTC",
      ...(wholeHourLocal ? [localZone] : []),
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Singapore",
      "Australia/Sydney",
    ]),
  ];
  function exportHistory() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { factionId, exportedAt: new Date().toISOString(), hours: history.data },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tornops-activity-${factionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-12 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">War planning</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Watch when a faction comes online. Build a picture before the war and adjust as it
            develops.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="size-4 text-primary" /> Torn presence from faction refreshes
        </div>
      </div>
      <section aria-label="Saved factions" className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {factions.map((f) => (
            <Button
              key={f.id}
              variant={f.id === factionId ? "default" : "outline"}
              onClick={() => setSelected(f.id)}
            >
              {f.name}
              {f.id === ownFaction?.id ? " · Our faction" : f.id === opponent ? " · Opponent" : ""}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Our faction and the opponent are recorded automatically whenever TornOps refreshes their
          member statuses. This page only views saved history. Observations are saved at most once
          per minute and kept in this browser for 30 days.
        </p>
        {savedFactions.error && (
          <p role="alert" className="text-sm text-destructive">
            {savedFactions.error.message}
          </p>
        )}
        {Object.entries(errors)
          .filter(([id, error]) => error && Number(id) !== factionId)
          .map(([id, error]) => (
            <p key={id} role="alert" className="text-sm text-destructive">
              Faction {id}: {error} Live faction updates continue.
            </p>
          ))}
      </section>
      {!faction ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-lg font-medium">No saved faction observations yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Use the war room as usual. Its faction status requests build history for both sides
            automatically. Return here to view their patterns.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {faction.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">[{faction.id}]</span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!history.data?.length}
                  onClick={exportHistory}
                >
                  <Download />
                  Export history
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Period
                <select
                  className={selectClass}
                  value={daysBack}
                  onChange={(event) => setDaysBack(Number(event.target.value))}
                >
                  {[1, 7, 14, 30].map((days) => (
                    <option key={days} value={days}>
                      Last {days} {days === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Timezone
                <select
                  className={selectClass}
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                >
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone === "UTC" ? "Torn time (UTC)" : zone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeIdle}
                  onChange={(event) => setIncludeIdle(event.target.checked)}
                />
                Include Idle
              </label>
            </div>
          </section>
          {(errors[faction.id] || history.error) && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {errors[faction.id] ?? history.error?.message} Live faction updates continue. History
              saving will retry on the next faction refresh.
            </p>
          )}
          {history.isPending ? (
            <p className="py-12 text-center text-muted-foreground">Loading saved observations...</p>
          ) : !rows.length ? (
            <div className="rounded-lg border p-8">
              <h3 className="font-medium">No observations in this period</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a longer period to see earlier history. New observations are saved whenever
                TornOps refreshes this faction's member statuses.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-x-8 gap-y-3 rounded-lg bg-muted/40 px-5 py-4 text-sm">
                <p>
                  Most online: <strong>{strongest ? hourLabel(strongest.hour) : "No data"}</strong>
                  {strongest && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {strongest.average!.toFixed(1)} members on average
                    </span>
                  )}
                </p>
                <p>
                  Fewest online: <strong>{quietest ? hourLabel(quietest.hour) : "No data"}</strong>
                  {quietest && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {quietest.average!.toFixed(1)} members on average
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {analysis.days.size} observed {analysis.days.size === 1 ? "day" : "days"} ·{" "}
                  {rows.reduce((sum, row) => sum + row.minutes.length, 0)} samples
                </p>
              </div>
              <section className="overflow-hidden rounded-lg border">
                <div className="border-b px-5 py-4">
                  <h3 className="font-semibold">When are they online?</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Average members {includeIdle ? "Online or Idle" : "Online"} per observation.
                    Select an hour to inspect members. Darker cells mean more members.
                  </p>
                </div>
                <div className="overflow-x-auto p-4">
                  <div className="min-w-[850px]">
                    <div className="grid grid-cols-[7rem_repeat(24,minmax(0,1fr))] gap-1 text-center text-[10px] text-muted-foreground">
                      <span className="text-left">{timeZone}</span>
                      {analysis.hourly.map((hour) => (
                        <span key={hour.hour}>{String(hour.hour).padStart(2, "0")}</span>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-[7rem_repeat(24,minmax(0,1fr))] items-center gap-1">
                      <span className="text-xs font-medium">All days</span>
                      {analysis.hourly.map((hour) => (
                        <button
                          key={hour.hour}
                          onClick={() => setSelectedHour(hour.hour)}
                          aria-label={`${hourLabel(hour.hour)}: ${hour.average === null ? "no observations" : `${hour.average.toFixed(1)} average members, ${hour.samples} samples across ${hour.days.size} days`}`}
                          aria-pressed={selectedHour === hour.hour}
                          title={`${hour.samples} samples across ${hour.days.size} days`}
                          className={cn(
                            "h-10 rounded text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
                            selectedHour === hour.hour && "ring-2 ring-primary",
                            hour.average === null && "bg-muted text-muted-foreground",
                          )}
                          style={
                            hour.average !== null
                              ? {
                                  backgroundColor: `color-mix(in srgb, var(--primary) ${10 + (hour.average / max) * 60}%, var(--background))`,
                                }
                              : undefined
                          }
                        >
                          {hour.average === null ? "-" : hour.average.toFixed(1)}
                        </button>
                      ))}
                    </div>
                    {[...analysis.days]
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([day, cells]) => (
                        <div
                          key={day}
                          className="mt-1 grid grid-cols-[7rem_repeat(24,minmax(0,1fr))] items-center gap-1"
                        >
                          <span className="text-xs text-muted-foreground">{day}</span>
                          {cells.map((cell, hour) => (
                            <button
                              key={hour}
                              onClick={() => setSelectedHour(hour)}
                              aria-label={`${day} ${hourLabel(hour)}: ${cell ? `${cell.average.toFixed(1)} average members from ${cell.samples} samples` : "no observations"}`}
                              title={
                                cell
                                  ? `${cell.average.toFixed(1)} members, ${cell.samples} samples`
                                  : "No observations"
                              }
                              className={cn(
                                "h-6 rounded-sm text-[10px] focus-visible:outline-2 focus-visible:outline-ring",
                                !cell && "bg-muted text-muted-foreground",
                              )}
                              style={
                                cell
                                  ? {
                                      backgroundColor: `color-mix(in srgb, var(--primary) ${10 + Math.min(1, cell.average / max) * 60}%, var(--background))`,
                                    }
                                  : undefined
                              }
                            >
                              {cell ? cell.average.toFixed(0) : "-"}
                            </button>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>
                <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                  Blank hours have no observations. Rankings compare only sampled hours, not a
                  complete day. A few samples are an early hint, not an established pattern.
                </p>
              </section>
              <section className="mt-5 rounded-lg border">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5">
                  <div>
                    <h3 className="font-semibold">Members at {hourLabel(selectedHour)}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Share of this hour's observations where each member was{" "}
                      {includeIdle ? "Online or Idle" : "Online"}. Includes members observed earlier
                      in the period.
                    </p>
                  </div>
                  <Input
                    className="w-56"
                    aria-label="Find a member"
                    placeholder="Find a member or ID"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-muted/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">Member</th>
                        <th className="px-5 py-3 font-medium">Observed online</th>
                        <th className="px-5 py-3 font-medium">Samples in this hour</th>
                        <th className="px-5 py-3 font-medium">Most observed hour</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {members.map((member) => {
                        const counts = member.hourly[selectedHour];
                        const best = member.hourly
                          .map((value, hour) => ({ ...value, hour }))
                          .filter((value) => value.samples)
                          .sort((a, b) => b.active / b.samples - a.active / a.samples)[0];
                        return (
                          <tr key={member.id}>
                            <td className="px-5 py-3">
                              <a
                                className="font-medium hover:underline"
                                href={`https://www.torn.com/profiles.php?XID=${member.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {member.name}
                              </a>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {member.id}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {counts.samples
                                ? `${Math.round((counts.active / counts.samples) * 100)}%`
                                : "No observations"}
                            </td>
                            <td className="px-5 py-3 tabular-nums">{counts.samples}</td>
                            <td className="px-5 py-3">
                              {best?.active ? hourLabel(best.hour) : "Not seen online"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!members.length && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      No members match that search.
                    </p>
                  )}
                </div>
              </section>
              <p className="mt-4 text-xs text-muted-foreground">
                Status is the war room's last action status. Observations do not measure session
                duration or guarantee availability for a push. Last saved sample:{" "}
                {new Intl.DateTimeFormat(undefined, {
                  timeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(
                  Math.max(...rows.map((row) => row.hour + Math.max(...row.minutes) * 60_000)),
                )}
                .
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
