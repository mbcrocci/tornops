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

export function RefreshCountdown() {
  const lastRefreshTime = useGlobalStore((state) => state.lastRefreshTime);
  const refetchInterval = useGlobalStore((state) => state.refetchInterval);
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
    <p className="text-sm text-muted-foreground">
      Next refresh in {formatTimeRemaining(timeRemaining)}
    </p>
  );
}
