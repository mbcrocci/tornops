import type { Member } from "@/lib/faction";
import { observeTravel, type TravelObservation } from "@/lib/travel";
import {
  readTravelObservations,
  saveTravelObservations,
  type StoredTravelObservation,
} from "@/lib/travel-storage";

// Travel estimates are built from consecutive live reads of each player's status, so they
// live for the whole visit, across pages, and are saved so a reload keeps in-flight
// estimates. observeTravel decides whether the gap since the last read still allows one.
const observations = new Map<number, TravelObservation>();
let hydration: Promise<void> | undefined;

const hydrate = () =>
  (hydration ??= readTravelObservations()
    .then((rows) => {
      for (const { id, factionId: _, ...observation } of rows) {
        const current = observations.get(id);
        if (!current || current.observedAt < observation.observedAt) {
          observations.set(id, observation);
        }
      }
    })
    .catch(() => undefined));

/**
 * Records a live read of a faction's members and returns every member's latest
 * observation, keyed by player id.
 */
export async function observeFactionTravel(
  factionId: number,
  members: Record<string, Member>,
  observedAt: number,
): Promise<Record<number, TravelObservation>> {
  await hydrate();
  const changed: StoredTravelObservation[] = [];
  const result: Record<number, TravelObservation> = {};
  for (const [key, member] of Object.entries(members)) {
    const id = parseInt(key, 10);
    const previous = observations.get(id);
    const next = observeTravel(previous, member.status, observedAt);
    if (next !== previous) {
      observations.set(id, next);
      changed.push({ ...next, id, factionId });
    }
    result[id] = next;
  }
  // Estimates still work for this session if the browser refuses storage.
  if (changed.length) await saveTravelObservations(changed).catch(() => undefined);
  return result;
}
