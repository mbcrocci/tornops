import { useEffect, useState } from "react";

// Component for hospital countdown
export function HospitalCountdown({ until }: { until: number }) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, until - now);
      setTimeRemaining(remaining);
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [until]);

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "Out now";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return ` (${formatTime(timeRemaining)})`;
}
