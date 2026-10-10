import { create } from "zustand";
import type { Faction } from "./faction";
import { recordObservation } from "./activity-tracking";

export const usePresenceHistoryState = create<{
  revision: number;
  errors: Record<number, string | undefined>;
}>(() => ({ revision: 0, errors: {} }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Called by existing faction requests. Saving history must never turn a successful
// live faction response into a failed war room request.
export async function observeFactionResponse(data: unknown, expectedId?: number): Promise<void> {
  if (
    !isRecord(data) ||
    data.error ||
    !Number.isSafeInteger(data.ID) ||
    Number(data.ID) <= 0 ||
    (expectedId !== undefined && data.ID !== expectedId) ||
    typeof data.name !== "string" ||
    !isRecord(data.members) ||
    !Object.keys(data.members).length ||
    Object.values(data.members).some(
      (member) =>
        !isRecord(member) ||
        typeof member.name !== "string" ||
        !isRecord(member.last_action) ||
        !["Online", "Idle", "Offline"].includes(String(member.last_action.status)),
    )
  )
    return;
  const faction = data as Faction;
  try {
    await recordObservation(faction, Date.now());
    usePresenceHistoryState.setState((state) => ({
      revision: state.revision + 1,
      errors: { ...state.errors, [faction.ID]: undefined },
    }));
  } catch (error) {
    usePresenceHistoryState.setState((state) => ({
      errors: {
        ...state.errors,
        [faction.ID]:
          error instanceof Error ? error.message : "Activity could not be saved in this browser.",
      },
    }));
  }
}
