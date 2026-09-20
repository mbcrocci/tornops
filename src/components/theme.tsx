import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEME_PRESETS = [
  { id: "default", label: "Default" },
  { id: "astrovista", label: "AstroVista" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export type ThemeMode = "dark" | "light" | "system";
export type ThemePreset = (typeof THEME_PRESETS)[number]["id"];

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeMode;
  defaultPreset?: ThemePreset;
  storageKey?: string;
  presetStorageKey?: string;
};

type ThemeProviderState = {
  theme: ThemeMode;
  preset: ThemePreset;
  setTheme: (theme: ThemeMode) => void;
  setPreset: (preset: ThemePreset) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

function isThemePreset(value: string | null): value is ThemePreset {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The selected theme still applies when storage is unavailable.
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultPreset = "default",
  storageKey = "vite-ui-theme",
  presetStorageKey = "tornops-theme-preset",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const storedTheme = readStorage(storageKey);
    return isThemeMode(storedTheme) ? storedTheme : defaultTheme;
  });
  const [preset, setPresetState] = useState<ThemePreset>(() => {
    const storedPreset = readStorage(presetStorageKey);
    return isThemePreset(storedPreset) ? storedPreset : defaultPreset;
  });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;

      root.classList.toggle("dark", resolvedTheme === "dark");
      root.classList.toggle("light", resolvedTheme === "light");
    };

    applyTheme();

    if (theme !== "system") return;

    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = preset;
  }, [preset]);

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      writeStorage(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey],
  );

  const setPreset = useCallback(
    (nextPreset: ThemePreset) => {
      writeStorage(presetStorageKey, nextPreset);
      setPresetState(nextPreset);
    },
    [presetStorageKey],
  );

  const value = useMemo(
    () => ({ theme, preset, setTheme, setPreset }),
    [theme, preset, setTheme, setPreset],
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
