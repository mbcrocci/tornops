import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./Settings";

const memoryStorage = (entries: Record<string, string> = {}): Storage => {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
};

const persisted = (state: object) => JSON.stringify({ state, version: 0 });

describe("settings storage", () => {
  it("starts from the defaults when nothing is stored", () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("reads what the earlier version of the app stored", () => {
    const settings = loadSettings(
      memoryStorage({
        "tornops-credentials": persisted({ publicKey: "torn", isTornKeyValid: true }),
        "tornops-monitor": persisted({
          refetchInterval: 5000,
          enemyFactionId: 42,
          filters: { onlineStatus: ["Online"], state: [], ff: ["0-2"] },
          // Derived data the old store also kept is ignored.
          enemyMembers: [{ id: 1 }],
        }),
        "tornops-bounties": persisted({ maxLevel: 50, onlyAvailable: true }),
        "vite-ui-theme": "dark",
        "tornops-theme-preset": "default",
      }),
    );
    expect(settings).toMatchObject({
      publicKey: "torn",
      ffscouterKey: null,
      isTornKeyValid: true,
      refetchInterval: 5000,
      enemyFactionId: 42,
      filters: { onlineStatus: ["Online"], state: [], ff: ["0-2"] },
      bountyMaxLevel: 50,
      // A missing key meant the default.
      bountyMinReward: DEFAULT_SETTINGS.bountyMinReward,
      bountyOnlyAvailable: true,
      theme: "dark",
      preset: "brutalist",
    });
  });

  it("keeps the readable fields when one is malformed", () => {
    const settings = loadSettings(
      memoryStorage({
        "tornops-monitor": persisted({ refetchInterval: "soon", groupByStatus: true }),
      }),
    );
    expect(settings.refetchInterval).toBe(DEFAULT_SETTINGS.refetchInterval);
    expect(settings.groupByStatus).toBe(true);
  });

  it("round-trips through storage, observed chain attacks included", () => {
    const storage = memoryStorage();
    const settings = {
      ...DEFAULT_SETTINGS,
      publicKey: "torn",
      bountyMinReward: null,
      chainAttackActivity: [
        { id: "attack-1", attackerId: 7, hits: 1, chainNumber: 12, attackAt: 1000 },
      ],
    };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual({
      ...settings,
      // "Any" is stored as a missing key, which reads back as the default, as before.
      bountyMinReward: DEFAULT_SETTINGS.bountyMinReward,
    });
  });
});
