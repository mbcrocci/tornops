import type { ObservedChainActivity } from "@/domain/Settings";
import type { Member } from "./faction";
import type { FFScouterData } from "./ffscouter";

type ChainMember = Member & { id: number; ffs?: FFScouterData | undefined };

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export type PrioritizedTarget<T extends ChainMember = ChainMember> = T & {
  availability: "alive" | "soon";
  availableIn: number;
};

export const CHAIN_WATCHER_REFETCH_INTERVAL = 5_000;
const MAX_VIABLE_FAIR_FIGHT = 3.5;

export function prioritizeTargets<T extends ChainMember>(
  members: ReadonlyArray<T>,
  chainSecondsRemaining: number,
  nowInSeconds: number,
): PrioritizedTarget<T>[] {
  if (chainSecondsRemaining <= 0) return [];

  const prioritizeSafestTarget = chainSecondsRemaining < 45;

  return members
    .flatMap((member): PrioritizedTarget<T>[] => {
      if (member.ffs?.fair_fight !== undefined && member.ffs.fair_fight > MAX_VIABLE_FAIR_FIGHT) {
        return [];
      }

      if (member.status.state === "Okay") {
        return [{ ...member, availability: "alive", availableIn: 0 }];
      }

      if (member.status.state !== "Hospital" || member.status.until <= nowInSeconds) {
        return [];
      }

      const availableIn = member.status.until - nowInSeconds;
      if (availableIn > chainSecondsRemaining - 60) return [];

      return [{ ...member, availability: "soon", availableIn }];
    })
    .sort((a, b) => {
      if (a.availability !== b.availability) {
        return a.availability === "alive" ? -1 : 1;
      }

      const ffA = a.ffs?.fair_fight;
      const ffB = b.ffs?.fair_fight;
      if (ffA === undefined && ffB !== undefined) return 1;
      if (ffA !== undefined && ffB === undefined) return -1;
      if (ffA !== undefined && ffB !== undefined && ffA !== ffB) {
        return prioritizeSafestTarget ? ffA - ffB : ffB - ffA;
      }

      if (a.availability === "soon" && b.availability === "soon") {
        return a.availableIn - b.availableIn;
      }

      const activityOrder = { Online: 0, Idle: 1, Offline: 2 };
      return activityOrder[a.last_action.status] - activityOrder[b.last_action.status];
    })
    .slice(0, 5);
}

export type ChainUrgency = "normal" | "warning" | "danger" | "critical";

export function getChainUrgency(seconds: number): ChainUrgency {
  if (seconds > 0 && seconds < 30) return "critical";
  if (seconds > 0 && seconds < 60) return "danger";
  if (seconds > 0 && seconds < 120) return "warning";
  return "normal";
}

export function formatAttackTime(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 10) return "Just now";
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
}

export function isStoredAttackActivityValid(
  activity: ReadonlyArray<ObservedChainActivity>,
  currentChain: number,
): boolean {
  const latestAttack = activity[0];
  return !latestAttack || latestAttack.chainNumber <= currentChain;
}
