import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CredentialsState {
  publicKey: string;
  ffscouterKey: string;
  setPublicKey: (publicKey: string) => void;
  setFFScouterKey: (ffscouterKey: string) => void;
}

export const useCredentialsStore = create<CredentialsState>()(
  persist(
    (set) => ({
      publicKey: "LLHrCIqC3Tfp0yJc", // TODO: make this use inputable
      ffscouterKey: "CJJfNJkBgoyMFouX", // TODO: make this use inputable
      setPublicKey: (publicKey: string) => set({ publicKey }),
      setFFScouterKey: (ffscouterKey: string) => set({ ffscouterKey }),
    }),
    {
      name: "credentials",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

interface GlobalState {
  refetchInterval: number;
  enemyFactionId: number;
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId: number) => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      refetchInterval: 10_000,
      enemyFactionId: 0,

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId: number) => set({ enemyFactionId }),
    }),
    {
      name: "monitor",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
