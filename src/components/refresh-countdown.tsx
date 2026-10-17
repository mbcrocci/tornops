import { useEffect, useState } from "react";
import { useGlobalStore } from "@/lib/stores";

function formatTimeRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function RefreshCountdown(props: {
  lastRefreshTime?: number;
  refetchInterval?: number;
  label?: string;
}) {
  const globalLastRefreshTime = useGlobalStore((state) => state.lastRefreshTime);
  const globalRefetchInterval = useGlobalStore((state) => state.refetchInterval);
  const lastRefreshTime = props.lastRefreshTime ?? globalLastRefreshTime;
  const refetchInterval = props.refetchInterval ?? globalRefetchInterval;
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!lastRefreshTime) {
      setTimeRemaining(null);
      return;
    }

    const updateTimeRemaining = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshTime;
      const remaining = refetchInterval - elapsed;

      if (remaining <= 0) {
        setTimeRemaining(0);
      } else {
        setTimeRemaining(remaining);
      }
    };

    // Update immediately
    updateTimeRemaining();

    // Update every second
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [lastRefreshTime, refetchInterval]);

  if (timeRemaining === null) {
    return null;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {props.label ?? "Next refresh"} in {formatTimeRemaining(timeRemaining)}
    </p>
  );
}
