import type { FactionRankedWar } from "@/lib/faction";
import { PLANNING_WINDOW_HOURS } from "@/lib/war-analysis";

export const TIME_ZONES = [
  { value: "local", label: "My timezone" },
  { value: "UTC", label: "Torn City Time (UTC)" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Lisbon", label: "Lisbon" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

export function timeZoneLabel(timeZone: string) {
  return TIME_ZONES.find((zone) => zone.value === timeZone)?.label ?? timeZone;
}

const intlTimeZone = (timeZone: string) => (timeZone === "local" ? undefined : timeZone);

export function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function formatWindow(startHour: number) {
  return `${formatHour(startHour)} to ${formatHour((startHour + PLANNING_WINDOW_HOURS) % 24)}`;
}

export function formatDateTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: intlTimeZone(timeZone),
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp * 1000));
}

export function formatWarDate(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: intlTimeZone(timeZone),
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

export function formatRespect(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatSigned(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatRespect(Math.abs(value))}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function warOpponent(war: FactionRankedWar, factionId: number | undefined) {
  return war.factions.find((faction) => faction.id !== factionId) ?? war.factions[1];
}

export function warOutcome(war: FactionRankedWar, factionId: number | undefined) {
  if (!war.winner) return "Draw";
  return war.winner === factionId ? "Victory" : "Defeat";
}
