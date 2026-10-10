import { useEffect } from "react";
import { create } from "zustand";
import type { MemberWithId } from "@/lib/stores";
import { observeTravel, type TravelObservation } from "@/lib/travel";
import {
  readTravelObservations,
  saveTravelObservations,
  type StoredTravelObservation,
} from "@/lib/travel-storage";

// Persisted faction data is not a fresh status observation, so only live responses are
// observed. Saved observations are restored first so a reload keeps in-flight estimates;
// observeTravel decides whether the gap since the last read still allows an estimate.
let hydration: Promise<void> | undefined;

export const useTravelObservations = create<{
  observations: Record<number, TravelObservation>;
  observe: (factionId: number, members: MemberWithId[], observedAt: number) => Promise<void>;
}>((set, get) => ({
  observations: {},
  observe: async (factionId, members, observedAt) => {
    hydration ??= readTravelObservations()
      .then((rows) =>
        set((state) => {
          const observations = { ...state.observations };
          for (const { id, factionId: _, ...observation } of rows) {
            if (!observations[id] || observations[id].observedAt < observation.observedAt) {
              observations[id] = observation;
            }
          }
          return { observations };
        }),
      )
      .catch(() => undefined);
    await hydration;

    const observations = { ...get().observations };
    const changed: StoredTravelObservation[] = [];
    for (const member of members) {
      const previous = observations[member.id];
      const next = observeTravel(previous, member.status, observedAt);
      if (next === previous) continue;
      observations[member.id] = next;
      changed.push({ ...next, id: member.id, factionId });
    }
    if (!changed.length) return;
    set({ observations });
    // Estimates still work for this session if the browser refuses storage.
    await saveTravelObservations(changed).catch(() => undefined);
  },
}));

export function useObserveTravel(
  factionId: number | undefined,
  members: MemberWithId[],
  observedAt: number,
) {
  const observe = useTravelObservations((state) => state.observe);
  useEffect(() => {
    if (factionId && observedAt > 0 && members.length) {
      void observe(factionId, members, observedAt);
    }
  }, [factionId, members, observedAt, observe]);
}
