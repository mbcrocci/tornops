import { useEffect } from "react";
import { create } from "zustand";
import type { MemberWithId } from "@/lib/stores";
import { observeTravel, type TravelObservation } from "@/lib/travel";

// Session-only: persisted faction data is not a fresh status observation.
export const useTravelObservations = create<{
  observations: Record<number, TravelObservation>;
  observe: (members: MemberWithId[], observedAt: number) => void;
}>((set) => ({
  observations: {},
  observe: (members, observedAt) =>
    set((state) => {
      const observations = { ...state.observations };
      for (const member of members) {
        observations[member.id] = observeTravel(observations[member.id], member.status, observedAt);
      }
      return { observations };
    }),
}));

export function useObserveTravel(members: MemberWithId[], observedAt: number) {
  const observe = useTravelObservations((state) => state.observe);
  useEffect(() => {
    if (observedAt > 0 && members.length) observe(members, observedAt);
  }, [members, observedAt, observe]);
}
