import { useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import { useTravelObservations } from "@/hooks/use-travel-estimates";
import {
  buildCommunication,
  COMMUNICATIONS,
  type CommunicationKind,
  type CommunicationPlayer,
} from "@/lib/communications";
import { useGlobalStore } from "@/lib/stores";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function CommunicationsMenu({
  player,
  size,
}: {
  player: CommunicationPlayer;
  size?: "icon-sm";
}) {
  const observation = useTravelObservations((state) => state.observations[player.id]);
  const emojis = useGlobalStore((state) => state.communicationEmojis);
  const [copied, setCopied] = useState(false);
  const iconClass = size ? "size-4" : undefined;

  const arrivalAt =
    observation?.status.state === "Traveling" ? observation.estimate?.arrivalAt : undefined;

  async function copy(kind: CommunicationKind) {
    await navigator.clipboard.writeText(buildCommunication(kind, player, { arrivalAt, emojis }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={750}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size={size} aria-label="Communications">
              {copied ? <Check className={iconClass} /> : <MessageSquare className={iconClass} />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied to clipboard" : "Communications"}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Copy message</DropdownMenuLabel>
        {COMMUNICATIONS.map(({ kind, label }) => (
          <Tooltip key={kind} delayDuration={200}>
            <TooltipTrigger asChild>
              <DropdownMenuItem onSelect={() => void copy(kind)}>{label}</DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              {buildCommunication(kind, player, { arrivalAt, emojis })}
            </TooltipContent>
          </Tooltip>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
