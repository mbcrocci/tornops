export function cleanStatusDescription(description: string): string {
  const hospitalIndex = description.indexOf("hospital");
  if (hospitalIndex !== -1) {
    return description.slice(0, hospitalIndex + "hospital".length).trim();
  }

  return description;
}

// Helper function to get status background color class
export function getStatusBgColorClass(state: string): string {
  switch (state) {
    case "Okay":
      return "bg-emerald-400 dark:bg-emerald-600";
    case "Hospital":
      return "bg-rose-400 dark:bg-rose-600";
    case "Traveling":
      return "bg-sky-400 dark:bg-sky-600";
    case "Abroad":
      return "bg-amber-400 dark:bg-amber-600";
    default:
      return "bg-gray-400 dark:bg-gray-600";
  }
}

/** A short status label for tight spaces: "To Mexico", "From Japan", "Hospital". */
export function shortStatusLabel(state: string, description: string): string {
  if (state === "Hospital") return "Hospital";
  const returning = /^Returning to Torn from (.+)$/.exec(description);
  if (returning) return `From ${returning[1]}`;
  const outbound = /^Traveling to (.+)$/.exec(description);
  if (outbound) return `To ${outbound[1]}`;
  if (/federal/i.test(description)) return "Federal jail";
  return cleanStatusDescription(description) || state;
}

export type StatusTone = {
  /** Tinted pill: soft background, readable text, faint ring. */
  pill: string;
  /** Solid swatch for dots and bar fills. */
  dot: string;
  /** Text color alone. */
  text: string;
};

const tones = {
  ready: {
    pill: "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  hospital: {
    pill: "bg-rose-500/12 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
  },
  traveling: {
    pill: "bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/25",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  // Abroad shares travel's hue (both are away); its swatch is hollow to tell them apart.
  abroad: {
    pill: "bg-sky-500/8 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/25",
    dot: "ring-[1.5px] ring-inset ring-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  jail: {
    pill: "bg-slate-500/12 text-slate-700 ring-slate-600/25 dark:text-slate-300 dark:ring-slate-400/25",
    dot: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-300",
  },
} satisfies Record<string, StatusTone>;

export function getStatusTone(state: string): StatusTone {
  switch (state) {
    case "Okay":
      return tones.ready;
    case "Hospital":
      return tones.hospital;
    case "Traveling":
      return tones.traveling;
    case "Abroad":
      return tones.abroad;
    default:
      return tones.jail;
  }
}

export function getOnlineDotClass(status: string): string {
  if (status === "Online") return "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20";
  if (status === "Idle") return "ring-2 ring-inset ring-yellow-300/80";
  // Offline is a smaller, fainter dot so it reads as "nobody home" next to the idle ring.
  return "scale-75 bg-muted-foreground/40";
}

/**
 * Fair fight colour. Only the extremes get a hue, so the column stays quiet: low FF is an
 * easy hit, 6+ a dangerous one.
 */
export const EASY_FAIR_FIGHT = 2;
export const DANGEROUS_FAIR_FIGHT = 6;

export function getFairFightTextClass(ff: number): string {
  // Violet is used nowhere else, so an easy FF cannot be mistaken for a travel status.
  if (ff < EASY_FAIR_FIGHT) return "text-violet-700 dark:text-violet-400";
  if (ff < DANGEROUS_FAIR_FIGHT) return "text-foreground";
  return "text-rose-700 dark:text-rose-400";
}

/** "1:02:03", "12:34" or "0:42": a fixed-width clock for live countdowns. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** "3h 20m", "12m", "45s": a compact duration for things that are not ticking. */
export function formatSpan(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}
