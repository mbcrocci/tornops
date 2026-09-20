import {
  ChevronDownIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/lib/stores";
import { THEME_PRESETS, useTheme, type ThemeMode } from "@/components/theme";
import { CredentialsInput } from "./credentials";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";
import { Label } from "./ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

export function SettingsSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SettingsIcon />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Manage your settings and preferences.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4">
          <AppearanceSettings />
          <CredentialsInput />
          <EnemyFactionInput />
          <RefreshIntervalInput />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const THEME_MODES: Array<{
  id: ThemeMode;
  label: string;
  icon: typeof SunIcon;
}> = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
  { id: "system", label: "System", icon: MonitorIcon },
];

function AppearanceSettings() {
  const { theme, preset, setTheme, setPreset } = useTheme();

  const selectedPreset = THEME_PRESETS.find((option) => option.id === preset);

  return (
    <section className="mb-2 flex flex-col gap-4 border-b pb-7" aria-labelledby="appearance-title">
      <div>
        <Label id="appearance-title">Appearance</Label>
        <p className="text-sm text-muted-foreground">Choose a visual theme and color mode.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Theme</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <PaletteIcon />
                {selectedPreset?.label ?? "Select theme"}
              </span>
              <ChevronDownIcon className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preset}
              onValueChange={(value) => {
                const nextPreset = THEME_PRESETS.find((option) => option.id === value);
                if (nextPreset) setPreset(nextPreset.id);
              }}
            >
              {THEME_PRESETS.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Color mode</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_MODES.map((option) => {
            const Icon = option.icon;

            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={theme === option.id ? "secondary" : "outline"}
                aria-pressed={theme === option.id}
                onClick={() => setTheme(option.id)}
              >
                <Icon />
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EnemyFactionInput() {
  const enemyFactionId = useGlobalStore((state) => state.enemyFactionId);
  const setEnemyFactionId = useGlobalStore((state) => state.setEnemyFactionId);

  const [enemyFactionIdInput, setEnemyFactionIdInput] = useState(enemyFactionId);

  return (
    <div className="flex flex-col gap-2">
      <Label>Enemy Faction ID</Label>
      <InputGroup>
        <InputGroupInput
          type="number"
          placeholder="1234567890"
          value={enemyFactionIdInput ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            setEnemyFactionIdInput(value ? parseInt(value, 10) : undefined);
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => {
              setEnemyFactionId(enemyFactionIdInput);
            }}
          >
            Save
          </InputGroupButton>
          <InputGroupButton
            variant="outline"
            onClick={() => {
              setEnemyFactionId(undefined);
              setEnemyFactionIdInput(undefined);
            }}
          >
            Reset
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function RefreshIntervalInput() {
  const refetchInterval = useGlobalStore((state) => state.refetchInterval);
  const setRefetchInterval = useGlobalStore((state) => state.setRefetchInterval);

  const DEFAULT_INTERVAL_MS = 10_000;
  const DEFAULT_INTERVAL_SECONDS = DEFAULT_INTERVAL_MS / 1000;

  // Convert milliseconds to seconds for display
  const [intervalSecondsInput, setIntervalSecondsInput] = useState(refetchInterval / 1000);

  // Sync input with store value when it changes
  useEffect(() => {
    setIntervalSecondsInput(refetchInterval / 1000);
  }, [refetchInterval]);

  return (
    <div className="flex flex-col gap-2">
      <Label>Refresh Interval (seconds)</Label>
      <InputGroup>
        <InputGroupInput
          type="number"
          placeholder="10"
          min="1"
          value={intervalSecondsInput}
          onChange={(e) => {
            const value = e.target.value;
            setIntervalSecondsInput(value ? parseFloat(value) : DEFAULT_INTERVAL_SECONDS);
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => {
              const intervalMs = Math.max(1000, intervalSecondsInput * 1000);
              setRefetchInterval(intervalMs);
            }}
          >
            Save
          </InputGroupButton>
          <InputGroupButton
            variant="outline"
            onClick={() => {
              setRefetchInterval(DEFAULT_INTERVAL_MS);
              setIntervalSecondsInput(DEFAULT_INTERVAL_SECONDS);
            }}
          >
            Reset
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-sm text-muted-foreground">
        Current: {refetchInterval / 1000}s ({refetchInterval}ms)
      </p>
    </div>
  );
}
