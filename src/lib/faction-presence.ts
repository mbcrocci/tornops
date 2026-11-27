import type { Faction } from "./faction";
import { recordObservation } from "./activity-tracking";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Called by existing faction requests. Saving history must never turn a successful
// live faction response into a failed war room request, so a failure to save is returned
// as a message instead. Resolves undefined when the history was saved or nothing was saved.
export async function observeFactionResponse(
  data: unknown,
  expectedId?: number,
): Promise<string | undefined> {
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
    return undefined;
  const faction = data as Faction;
  try {
    await recordObservation(faction, Date.now());
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "Activity could not be saved in this browser.";
  }
}
