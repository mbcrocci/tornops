import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId?: number) => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      refetchInterval: 10_000,
      enemyFactionId: undefined,

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId?: number) => set({ enemyFactionId }),
    }),
    {
      name: "tornops-monitor",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
