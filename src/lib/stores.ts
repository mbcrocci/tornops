import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FilterState } from "@/components/enemy-faction/filters";
import type { Member } from "@/lib/faction";
import type { FFScouterData } from "@/hooks/use-ffscouter";

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

export type MemberWithId = Member & {
  id: number;
};

export type EnemyMember = MemberWithId & {
  ffs?: FFScouterData;
};

export type EnemyFaction = {
  id: number;
  name: string;
  tag: string;
  capacity: number;
};

interface GlobalState {
  refetchInterval: number;
  enemyFactionId: number | undefined;
  enemyFaction?: EnemyFaction;
  filters: FilterState;
  enemyMembers: EnemyMember[];
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId?: number) => void;
  setEnemyFaction: (enemyFaction?: EnemyFaction) => void;
  setFilters: (filters: FilterState) => void;
  setEnemyMembers: (members: EnemyMember[]) => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      refetchInterval: 10_000,
      filters: {
        onlineStatus: [],
        state: [],
        ff: [],
      },
      enemyFactionId: undefined,
      enemyFaction: undefined,
      enemyMembers: [],

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId?: number) => set({ enemyFactionId }),
      setEnemyFaction: (enemyFaction?: EnemyFaction) => set({ enemyFaction }),
      setFilters: (filters: FilterState) => set({ filters }),
      setEnemyMembers: (members: EnemyMember[]) =>
        set({ enemyMembers: members }),
    }),
    {
      name: "tornops-monitor",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
