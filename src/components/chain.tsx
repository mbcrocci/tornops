import { useEnemyFactionChain, useUserFactionChain } from "@/hooks/use-torn";
import type { FactionChain } from "@/lib/faction";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

// Helper function to format time duration
function formatTime(seconds: number): string {
  if (seconds <= 0) return "Expired";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

export function UserChain({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const { data: userFactionChain } = useUserFactionChain();
  if (!userFactionChain) return null;

  return <Chain chain={userFactionChain?.chain} defaultOpen={defaultOpen} />;
}

export function EnemyChain({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const { data: enemyFactionChain } = useEnemyFactionChain();
  if (!enemyFactionChain) return null;

  return (
    <Chain
      title="Enemy Chain"
      chain={enemyFactionChain.chain}
      defaultOpen={defaultOpen}
    />
  );
}

function Chain({
  title,
  chain,
  defaultOpen = true,
}: {
  title?: string;
  chain: FactionChain;
  defaultOpen?: boolean;
}) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!chain?.timeout) {
      setTimeRemaining(0);
      return;
    }

    // Initialize with the timeout value (seconds remaining)
    setTimeRemaining(chain.timeout);

    // Decrement every second
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [chain?.timeout]);

  if (!chain) {
    return (
      <Card>
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <CardTitle>{title || "Chain"}</CardTitle>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isOpen ? "transform rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">No chain data available</div>
        </CardContent>
      </Card>
    );
  }

  const chainPercentage = chain.max > 0 ? (chain.current / chain.max) * 100 : 0;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full h-full"
    >
      <Card className="w-full">
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <CardTitle>{title || "Chain"}</CardTitle>
            <CollapsibleTrigger asChild>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  isOpen ? "transform rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CardContent className="">
          <CollapsibleContent className="w-full h-full">
            <div className="space-y-4">
              {/* Countdown Timer */}
              <div className="text-center">
                <div className="text-sm font-medium">Time Remaining</div>
                <div className="text-4xl font-bold">
                  {formatTime(timeRemaining)}
                </div>
                {timeRemaining <= 0 && (
                  <div className="text-sm text-muted-foreground mt-1">
                    Chain has expired
                  </div>
                )}
              </div>
              {/* Chain Count */}
              <div>
                <Progress value={chainPercentage} className="h-6" />
                <div className="flex justify-between">
                  <div className="text-sm text-muted-foreground mt-1">
                    {chain.current.toLocaleString()} /{" "}
                    {chain.max.toLocaleString()}
                  </div>

                  <div className="text-sm text-muted-foreground mt-1">
                    {chain.modifier > 0 && (
                      <div>Modifier: {chain.modifier}x</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
