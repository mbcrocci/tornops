import { useEnemyFactionChain, useUserFactionChain } from "@/hooks/use-torn";
import type { FactionChain } from "@/lib/faction";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Progress } from "./ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGlobalStore } from "@/lib/stores";

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

export function UserChain() {
  const { data: userFactionChain } = useUserFactionChain();
  if (!userFactionChain) return null;

  return <Chain chain={userFactionChain?.chain} />;
}

export function EnemyChain() {
  const { data: enemyFactionChain } = useEnemyFactionChain();
  if (!enemyFactionChain) return null;

  return <Chain chain={enemyFactionChain.chain} />;
}

export function Chains() {
  const collapsedCards = useGlobalStore((state) => state.collapsedCards);
  const setCollapsedCards = useGlobalStore((state) => state.setCollapsedCards);

  return (
    <Card className="w-full flex flex-col">
      <Tabs defaultValue="user" className="flex flex-col flex-1">
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <TabsList>
              <TabsTrigger value="user">User Chain</TabsTrigger>
              <TabsTrigger value="enemy">Enemy Chain</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="icon" onClick={() => setCollapsedCards(!collapsedCards)}>
              {collapsedCards ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {!collapsedCards && (
          <CardContent className="flex flex-col flex-1 justify-center min-h-0">
            <TabsContent value="user" className="mt-0 flex-1 flex items-center justify-center">
              <UserChain />
            </TabsContent>
            <TabsContent value="enemy" className="mt-0 flex-1 flex items-center justify-center">
              <EnemyChain />
            </TabsContent>
          </CardContent>
        )}
      </Tabs>
    </Card>
  );
}
function Chain({ chain }: { chain: FactionChain }) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

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
    return <div className="text-muted-foreground">No chain data available</div>;
  }

  const chainPercentage = chain.max > 0 ? (chain.current / chain.max) * 100 : 0;

  return (
    <div className="space-y-2 w-full">
      {/* Countdown Timer */}
      <div className="text-center">
        <div className="text-xs font-medium">Time Remaining</div>
        <div className="text-2xl font-bold">{formatTime(timeRemaining)}</div>
        {timeRemaining <= 0 && (
          <div className="text-xs text-muted-foreground mt-1">Chain has expired</div>
        )}
      </div>
      {/* Chain Count */}
      <div>
        <Progress value={chainPercentage} className="h-3" />
        <div className="flex justify-between">
          <div className="text-xs text-muted-foreground mt-1">
            {chain.current.toLocaleString()} / {chain.max.toLocaleString()}
          </div>

          <div className="text-xs text-muted-foreground mt-1">
            {chain.modifier > 0 && <div>Modifier: {chain.modifier}x</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
