import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A polled request that never settles freezes polling: each interval tick joins the
// pending request instead of starting a new one, so the data goes stale until a manual
// refresh. Failing it lets react-query retry and the next tick fetch again.
export const POLL_TIMEOUT = 20_000;
export function withTimeout<T>(promise: Promise<T>, timeout = POLL_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Request timed out")), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}
