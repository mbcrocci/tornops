import { Schema } from "effect";

export const OnlineStatusFilter = Schema.Literals(["Online", "Idle", "Offline"]);
export type OnlineStatusFilter = typeof OnlineStatusFilter.Type;
export const StateFilter = Schema.Literals(["Okay", "Hospital", "Abroad", "Traveling", "Federal"]);
export type StateFilter = typeof StateFilter.Type;
export const FFFilter = Schema.Literals(["0-2", "2-4", "4-6", "6+"]);
export type FFFilter = typeof FFFilter.Type;

export const FilterState = Schema.Struct({
  onlineStatus: Schema.Array(OnlineStatusFilter),
  state: Schema.Array(StateFilter),
  ff: Schema.Array(FFFilter),
});
export type FilterState = typeof FilterState.Type;
export const NO_FILTERS: FilterState = { onlineStatus: [], state: [], ff: [] };

export const ThemeMode = Schema.Literals(["dark", "light", "system"]);
export type ThemeMode = typeof ThemeMode.Type;
export const THEME_PRESETS = [
  { id: "gold-skeumorphic", label: "Gold Skeumorphic" },
  { id: "brutalist", label: "Brutalist" },
  { id: "astrovista", label: "AstroVista" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;
export const ThemePreset = Schema.Literals(THEME_PRESETS.map((preset) => preset.id));
export type ThemePreset = typeof ThemePreset.Type;

export const ObservedChainActivity = Schema.Struct({
  id: Schema.String,
  attackerId: Schema.Number,
  hits: Schema.Number,
  chainNumber: Schema.Number,
  attackAt: Schema.Number,
});
export type ObservedChainActivity = typeof ObservedChainActivity.Type;

export const DEFAULT_REFETCH_INTERVAL = 10_000;
export const DEFAULT_BOUNTY_REFRESH_INTERVAL = 60_000;
export const DEFAULT_BOUNTY_MIN_REWARD = 150_000;

/** Everything the user chose that outlives a page: keys, preferences and filters. */
export const Settings = Schema.Struct({
  // Credentials
  publicKey: Schema.NullOr(Schema.String),
  ffscouterKey: Schema.NullOr(Schema.String),
  isTornKeyValid: Schema.NullOr(Schema.Boolean),
  isFFScouterKeyValid: Schema.NullOr(Schema.Boolean),
  // War room
  refetchInterval: Schema.Number,
  enemyFactionId: Schema.NullOr(Schema.Number),
  filters: FilterState,
  collapsedCards: Schema.Boolean,
  groupByStatus: Schema.Boolean,
  communicationEmojis: Schema.Boolean,
  chainAttackActivity: Schema.Array(ObservedChainActivity),
  // Bounties
  bountyMinReward: Schema.NullOr(Schema.Number),
  bountyMaxLevel: Schema.NullOr(Schema.Number),
  bountyMaxFF: Schema.NullOr(Schema.Number),
  bountyOnlyAvailable: Schema.Boolean,
  bountyRefreshInterval: Schema.Number,
  // Appearance
  theme: ThemeMode,
  preset: ThemePreset,
});
export type Settings = typeof Settings.Type;

export const DEFAULT_SETTINGS: Settings = {
  publicKey: null,
  ffscouterKey: null,
  isTornKeyValid: null,
  isFFScouterKeyValid: null,
  refetchInterval: DEFAULT_REFETCH_INTERVAL,
  enemyFactionId: null,
  filters: NO_FILTERS,
  collapsedCards: false,
  groupByStatus: false,
  communicationEmojis: true,
  chainAttackActivity: [],
  bountyMinReward: DEFAULT_BOUNTY_MIN_REWARD,
  bountyMaxLevel: null,
  bountyMaxFF: null,
  bountyOnlyAvailable: false,
  bountyRefreshInterval: DEFAULT_BOUNTY_REFRESH_INTERVAL,
  theme: "system",
  preset: "gold-skeumorphic",
};

/** Whether the stored Torn key can be used: present, and not known to be invalid. */
export const isLoggedIn = (settings: Settings): settings is Settings & { publicKey: string } =>
  Boolean(settings.publicKey) && settings.isTornKeyValid !== false;

// The keys and layout the app used before, so stored settings carry over: zustand's
// `persist` wrote `{ state, version }` under each of these.
const CREDENTIALS_KEY = "tornops-credentials";
const MONITOR_KEY = "tornops-monitor";
const BOUNTIES_KEY = "tornops-bounties";
const THEME_KEY = "vite-ui-theme";
const PRESET_KEY = "tornops-theme-preset";

type Stored = Record<string, unknown>;

const readPersisted = (storage: Storage, key: string): Stored => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (typeof parsed === "object" && parsed !== null && "state" in parsed) {
      const state = (parsed as { state: unknown }).state;
      if (typeof state === "object" && state !== null) return state as Stored;
    }
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  return {};
};

const readRaw = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const decodeField = <A>(schema: Schema.Codec<A, any>, value: unknown, fallback: A): A => {
  // `undefined` was how the old stores wrote "not set".
  const input = value === undefined ? null : value;
  const decoded = Schema.decodeUnknownOption(schema)(input);
  return decoded._tag === "Some" ? decoded.value : fallback;
};

/** Reads the stored settings, field by field, so one bad value doesn't lose the rest. */
export const loadSettings = (storage: Storage): Settings => {
  const credentials = readPersisted(storage, CREDENTIALS_KEY);
  const monitor = readPersisted(storage, MONITOR_KEY);
  const bounties = readPersisted(storage, BOUNTIES_KEY);
  const storedPreset = readRaw(storage, PRESET_KEY);
  const fields = Settings.fields;
  const d = DEFAULT_SETTINGS;
  return {
    publicKey: decodeField(fields.publicKey, credentials.publicKey, d.publicKey) || null,
    ffscouterKey:
      decodeField(fields.ffscouterKey, credentials.ffscouterKey, d.ffscouterKey) || null,
    isTornKeyValid: decodeField(fields.isTornKeyValid, credentials.isTornKeyValid, null),
    isFFScouterKeyValid: decodeField(
      fields.isFFScouterKeyValid,
      credentials.isFFScouterKeyValid,
      null,
    ),
    refetchInterval: decodeField(
      fields.refetchInterval,
      monitor.refetchInterval,
      d.refetchInterval,
    ),
    enemyFactionId: decodeField(fields.enemyFactionId, monitor.enemyFactionId, d.enemyFactionId),
    filters: decodeField(fields.filters, monitor.filters, d.filters),
    collapsedCards: decodeField(fields.collapsedCards, monitor.collapsedCards, d.collapsedCards),
    groupByStatus: decodeField(fields.groupByStatus, monitor.groupByStatus, d.groupByStatus),
    communicationEmojis: decodeField(
      fields.communicationEmojis,
      monitor.communicationEmojis,
      d.communicationEmojis,
    ),
    chainAttackActivity: decodeField(
      fields.chainAttackActivity,
      monitor.chainAttackActivity,
      d.chainAttackActivity,
    ),
    // A missing key meant the default, as zustand merged its defaults under what it stored.
    bountyMinReward:
      "minReward" in bounties
        ? decodeField(fields.bountyMinReward, bounties.minReward, d.bountyMinReward)
        : d.bountyMinReward,
    bountyMaxLevel: decodeField(fields.bountyMaxLevel, bounties.maxLevel, d.bountyMaxLevel),
    bountyMaxFF: decodeField(fields.bountyMaxFF, bounties.maxFF, d.bountyMaxFF),
    bountyOnlyAvailable: decodeField(
      fields.bountyOnlyAvailable,
      bounties.onlyAvailable,
      d.bountyOnlyAvailable,
    ),
    bountyRefreshInterval: decodeField(
      fields.bountyRefreshInterval,
      bounties.refreshInterval,
      d.bountyRefreshInterval,
    ),
    theme: decodeField(fields.theme, readRaw(storage, THEME_KEY), d.theme),
    // "default" was renamed to "brutalist" when Gold Skeumorphic became the default.
    preset: decodeField(
      fields.preset,
      storedPreset === "default" ? "brutalist" : storedPreset,
      d.preset,
    ),
  };
};

const writePersisted = (storage: Storage, key: string, state: Stored) =>
  storage.setItem(key, JSON.stringify({ state, version: 0 }));

/** Writes the settings back in the layout `loadSettings` reads. */
export const saveSettings = (storage: Storage, settings: Settings): void => {
  try {
    writePersisted(storage, CREDENTIALS_KEY, {
      publicKey: settings.publicKey ?? undefined,
      ffscouterKey: settings.ffscouterKey ?? undefined,
      isTornKeyValid: settings.isTornKeyValid ?? undefined,
      isFFScouterKeyValid: settings.isFFScouterKeyValid ?? undefined,
    });
    writePersisted(storage, MONITOR_KEY, {
      refetchInterval: settings.refetchInterval,
      enemyFactionId: settings.enemyFactionId ?? undefined,
      filters: settings.filters,
      collapsedCards: settings.collapsedCards,
      groupByStatus: settings.groupByStatus,
      communicationEmojis: settings.communicationEmojis,
      chainAttackActivity: settings.chainAttackActivity,
    });
    writePersisted(storage, BOUNTIES_KEY, {
      minReward: settings.bountyMinReward ?? undefined,
      maxLevel: settings.bountyMaxLevel ?? undefined,
      maxFF: settings.bountyMaxFF ?? undefined,
      onlyAvailable: settings.bountyOnlyAvailable,
      refreshInterval: settings.bountyRefreshInterval,
    });
    storage.setItem(THEME_KEY, settings.theme);
    storage.setItem(PRESET_KEY, settings.preset);
  } catch {
    // The settings still apply for this visit when storage is unavailable.
  }
};
