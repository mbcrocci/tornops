import { useSyncExternalStore } from "react";

// One shared clock for every countdown on the page, so timers for the same player never
// disagree by a second because their intervals started at different moments.
const listeners = new Set<() => void>();
let now = Math.floor(Date.now() / 1000);
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      now = Math.floor(Date.now() / 1000);
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current time in unix seconds, re-rendering once a second. */
export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, () => now);
}
