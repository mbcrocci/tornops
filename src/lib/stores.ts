import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FilterState } from "@/components/enemy-faction/filters";
import type { FFScouterData } from "@/hooks/use-ffscouter";
import type { BountyFilters } from "@/lib/bounties";
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
      setTornKeyValidation: (isValid: boolean) => set({ isTornKeyValid: isValid }),
      setFFScouterKeyValidation: (isValid: boolean) => set({ isFFScouterKeyValid: isValid }),
    }),
    {
      name: "tornops-credentials",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const DEFAULT_BOUNTY_REFRESH_INTERVAL = 60_000;
export const DEFAULT_BOUNTY_MIN_REWARD = 150_000;

interface BountyState extends BountyFilters {
  refreshInterval: number;
  setFilters: (filters: Partial<BountyFilters>) => void;
  setRefreshInterval: (refreshInterval: number) => void;
}

export const useBountyStore = create<BountyState>()(
  persist(
    (set) => ({
      minReward: DEFAULT_BOUNTY_MIN_REWARD,
      maxLevel: undefined,
      maxFF: undefined,
      onlyAvailable: false,
      refreshInterval: DEFAULT_BOUNTY_REFRESH_INTERVAL,
      setFilters: (filters: Partial<BountyFilters>) => set(filters),
      setRefreshInterval: (refreshInterval: number) => set({ refreshInterval }),
    }),
    {
      name: "tornops-bounties",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export type MemberWithId = Member & {
  id: number;
};

export type EnemyMember = MemberWithId & {
  ffs?: FFScouterData;
};

export type UserMember = MemberWithId & {
  ffs?: FFScouterData;
};

export type EnemyFaction = {
  id: number;
  name: string;
  tag: string;
  capacity: number;
};

export type UserFaction = {
  id: number;
  name: string;
  tag: string;
  capacity: number;
};

export type ObservedChainActivity = {
  id: string;
  attackerId: number;
  hits: number;
  chainNumber: number;
  attackAt: number;
};

interface GlobalState {
  refetchInterval: number;
  enemyFactionId: number | undefined;
  enemyFaction?: EnemyFaction;
  userFaction?: UserFaction;
  filters: FilterState;
  enemyMembers: EnemyMember[];
  userMembers: UserMember[];
  lastRefreshTime: number | undefined;
  collapsedCards: boolean;
  chainAttackActivity: ObservedChainActivity[];
  communicationEmojis: boolean;
  setRefetchInterval: (refetchInterval: number) => void;
  setEnemyFactionId: (enemyFactionId?: number) => void;
  setEnemyFaction: (enemyFaction?: EnemyFaction) => void;
  setUserFaction: (userFaction?: UserFaction) => void;
  setFilters: (filters: FilterState) => void;
  setEnemyMembers: (members: EnemyMember[]) => void;
  setUserMembers: (members: UserMember[]) => void;
  setLastRefreshTime: (timestamp: number) => void;
  setCollapsedCards: (collapsedCards: boolean) => void;
  addChainAttackActivity: (activity: ObservedChainActivity[]) => void;
  clearChainAttackActivity: () => void;
  setCommunicationEmojis: (communicationEmojis: boolean) => void;
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
      userFaction: undefined,
      enemyMembers: [],
      userMembers: [],
      lastRefreshTime: undefined,
      collapsedCards: false,
      chainAttackActivity: [],
      communicationEmojis: true,

      setRefetchInterval: (refetchInterval: number) => set({ refetchInterval }),
      setEnemyFactionId: (enemyFactionId?: number) => set({ enemyFactionId }),
      setEnemyFaction: (enemyFaction?: EnemyFaction) => set({ enemyFaction }),
      setUserFaction: (userFaction?: UserFaction) => set({ userFaction }),
      setFilters: (filters: FilterState) => set({ filters }),
      setEnemyMembers: (members: EnemyMember[]) => set({ enemyMembers: members }),
      setUserMembers: (members: UserMember[]) => set({ userMembers: members }),
      setLastRefreshTime: (timestamp: number) => set({ lastRefreshTime: timestamp }),
      setCollapsedCards: (collapsedCards: boolean) => set({ collapsedCards }),
      addChainAttackActivity: (activity: ObservedChainActivity[]) =>
        set((state) => ({
          chainAttackActivity: [...activity, ...state.chainAttackActivity].slice(0, 10),
        })),
      clearChainAttackActivity: () => set({ chainAttackActivity: [] }),
      setCommunicationEmojis: (communicationEmojis: boolean) => set({ communicationEmojis }),
    }),
    {
      name: "tornops-monitor",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
