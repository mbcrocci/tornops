import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/lib/stores";
import { CredentialsInput } from "./credentials";
import { Button } from "./ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";
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
          <SheetDescription>
            Manage your settings and preferences.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <CredentialsInput />
          <EnemyFactionInput />
          <RefreshIntervalInput />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EnemyFactionInput() {
  const enemyFactionId = useGlobalStore((state) => state.enemyFactionId);
  const setEnemyFactionId = useGlobalStore((state) => state.setEnemyFactionId);

  const [enemyFactionIdInput, setEnemyFactionIdInput] =
    useState(enemyFactionId);

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
  const setRefetchInterval = useGlobalStore(
    (state) => state.setRefetchInterval
  );

  const DEFAULT_INTERVAL_MS = 10_000;
  const DEFAULT_INTERVAL_SECONDS = DEFAULT_INTERVAL_MS / 1000;

  // Convert milliseconds to seconds for display
  const [intervalSecondsInput, setIntervalSecondsInput] = useState(
    refetchInterval / 1000
  );

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
