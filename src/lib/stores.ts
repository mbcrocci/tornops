import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FilterState } from "@/components/enemy-faction/filters";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import type { Member } from "@/lib/faction";

interface CredentialsState {
  publicKey: string | undefined;
  ffscouterKey: string | undefined;
  isTornKeyValid: boolean | undefined;
  isFFScouterKeyValid: boolean | undefined;
  setPublicKey: (publicKey: string | undefined, isValid: boolean) => void;
  setFFScouterKey: (ffscouterKey: string | undefined, isValid: boolean) => void;
  setTornKeyValidation: (isValid: boolean) => void;
  setFFScouterKeyValidation: (isValid: boolean) => void;
}

export const useCredentialsStore = create<CredentialsState>()(
  persist(
    (set) => ({
      publicKey: undefined, // TODO: make this use inputable
      ffscouterKey: undefined, // TODO: make this use inputable
      isTornKeyValid: undefined,
      isFFScouterKeyValid: undefined,
      setPublicKey: (publicKey: string | undefined, isValid: boolean) =>
        set({
          publicKey: publicKey || undefined,
          isTornKeyValid: publicKey ? isValid : undefined,
        }),
      setFFScouterKey: (ffscouterKey: string | undefined, isValid: boolean) =>
        set({
          ffscouterKey: ffscouterKey || undefined,
          isFFScouterKeyValid: ffscouterKey ? isValid : undefined,
        }),
      setTornKeyValidation: (isValid: boolean) =>
        set({ isTornKeyValid: isValid }),
      setFFScouterKeyValidation: (isValid: boolean) =>
        set({ isFFScouterKeyValid: isValid }),
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
  lastRefreshTime: number | undefined;
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId?: number) => void;
  setEnemyFaction: (enemyFaction?: EnemyFaction) => void;
  setFilters: (filters: FilterState) => void;
  setEnemyMembers: (members: EnemyMember[]) => void;
  setLastRefreshTime: (timestamp: number) => void;
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
      lastRefreshTime: undefined,

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId?: number) => set({ enemyFactionId }),
      setEnemyFaction: (enemyFaction?: EnemyFaction) => set({ enemyFaction }),
      setFilters: (filters: FilterState) => set({ filters }),
      setEnemyMembers: (members: EnemyMember[]) =>
        set({ enemyMembers: members }),
      setLastRefreshTime: (timestamp: number) =>
        set({ lastRefreshTime: timestamp }),
    }),
    {
      name: "tornops-monitor",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
