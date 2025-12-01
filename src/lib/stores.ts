import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FilterState } from "@/components/enemy-faction/filters";

interface CredentialsState {
  publicKey: string | undefined;
  ffscouterKey: string | undefined;
  setPublicKey: (publicKey: string) => void;
  setFFScouterKey: (ffscouterKey: string) => void;
}

export const useCredentialsStore = create<CredentialsState>()(
  persist(
    (set) => ({
      publicKey: undefined, // TODO: make this use inputable
      ffscouterKey: undefined, // TODO: make this use inputable
      setPublicKey: (publicKey: string) => set({ publicKey }),
      setFFScouterKey: (ffscouterKey: string) => set({ ffscouterKey }),
    }),
    {
      name: "tornops-credentials",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

interface GlobalState {
  refetchInterval: number;
  enemyFactionId: number | undefined;
  filters: FilterState;
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId?: number) => void;
  setFilters: (filters: FilterState) => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      refetchInterval: 10_000,
      enemyFactionId: undefined,
      filters: {
        onlineStatus: [],
        state: [],
        ff: [],
      },

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId?: number) => set({ enemyFactionId }),
      setFilters: (filters: FilterState) => set({ filters }),
    }),
    {
      name: "tornops-monitor",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
