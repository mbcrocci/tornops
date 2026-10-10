import { useEffect, useState } from "react";
import { useTravelObservations } from "@/hooks/use-travel-estimates";
import type { StatusClass } from "@/lib/faction";

export function TravelCountdown({ id, status }: { id: number; status: StatusClass }) {
  const observation = useTravelObservations((state) => state.observations[id]);
  const estimate = observation?.status.state === "Traveling" ? observation.estimate : undefined;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (status.state !== "Traveling" || !estimate) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status.state, estimate]);
  if (status.state !== "Traveling") return null;
  if (!estimate)
    return (
      <span
        className="block text-xs font-normal"
        title="Departure was not observed, or destination is unknown."
      >
        ETA unknown
      </span>
    );
  const seconds = Math.max(0, Math.ceil((estimate.arrivalAt - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const duration = `${hours ? `${hours}h ` : ""}${minutes}m ${seconds % 60}s`;
  const title = `Estimated arrival: ${new Date(estimate.arrivalAt).toLocaleTimeString()}. Departure occurred between status updates; arrival window ${new Date(estimate.earliestArrival).toLocaleTimeString()}–${new Date(estimate.latestArrival).toLocaleTimeString()}. ${estimate.method}${estimate.assumedMethod ? " (assumed)" : ""}. Travel perks may change this estimate.`;
  return (
    <span className="block text-xs font-normal tabular-nums" title={title}>
      {seconds > 0 ? `ETA ≈ ${duration}` : "Arrival due (est.)"}
    </span>
  );
}
