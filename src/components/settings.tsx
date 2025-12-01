import { SettingsIcon } from "lucide-react";
import { useState } from "react";
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
