import { useUserData } from "@/hooks/use-torn";
import { factionArmoryLink, inventoryLink } from "@/lib/links";
import { getStatusBgColorClass } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGlobalStore } from "@/lib/stores";

// Helper function to format time duration
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

export function UserStatus() {
  const collapsedCards = useGlobalStore((state) => state.collapsedCards);
  const setCollapsedCards = useGlobalStore((state) => state.setCollapsedCards);
  const { data: userData } = useUserData();

  const healthPercentage = userData ? (userData.life.current / userData.life.maximum) * 100 : 0;
  const energyPercentage = userData?.energy ? (userData.energy.current / userData.energy.maximum) * 100 : 0;

  const medicalCooldownRemaining = userData?.cooldowns.medical || 0;

  // Standard medical cooldown is 8 hours (28800 seconds)
  // If remaining time is greater than 8h, use it as the total (cooldown just started with extended time)
  const standardMedicalCooldown = 8 * 3600; // 8 hours
  const medicalCooldownTotal = Math.max(standardMedicalCooldown, medicalCooldownRemaining);
  const medicalCooldownElapsed = userData?.cooldowns.medical || 0;
  //medicalCooldownTotal - medicalCooldownRemaining;

  const medicalCooldownPercentage =
    medicalCooldownTotal > 0 ? (medicalCooldownElapsed / medicalCooldownTotal) * 100 : 0;

  if (!userData) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Your Status</CardTitle>

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
        <>
          <CardContent className="space-y-2">
            {/* Status and Energy */}
            <div className="flex flex-row gap-2 w-full">
              {/* Status */}
              <div className="w-1/2">
                <div className="text-xs font-medium mb-1">Status:</div>
                <div className="w-full h-4 bg-muted overflow-hidden mb-1">
                  <div
                    className={`h-full flex items-center justify-center text-white text-[8px] md:text-[10px] font-semibold ${getStatusBgColorClass(userData.status.state)}`}
                    style={{ width: "100%" }}
                  >
                    {userData.status.description || userData.status.state}
                  </div>
                </div>
              </div>

              {/* Energy */}
              <div className="w-1/2">
                <div className="text-xs font-medium mb-1">Energy:</div>
                <Progress value={energyPercentage} className="h-3" />
                <div className="text-xs text-muted-foreground">
                  {userData.energy
                    ? `${userData.energy.current.toLocaleString()} / ${userData.energy.maximum.toLocaleString()} (${energyPercentage.toFixed(1)}%)`
                    : "N/A"}
                </div>
              </div>
            </div>
            <div className="flex flex-row gap-2 w-full">
              {/* Health */}
              <div className="w-1/2">
                <div className="text-xs font-medium mb-1">Health:</div>
                <Progress value={healthPercentage} className="h-3" />
                <div className="text-xs text-muted-foreground">
                  {userData.life.current.toLocaleString()} /{" "}
                  {userData.life.maximum.toLocaleString()} ({healthPercentage.toFixed(1)}%)
                </div>
              </div>

              {/* Medical Cooldown */}
              <div className="w-1/2">
                <div className="text-xs font-medium mb-1">Medical Cooldown:</div>
                {/* <div className="w-full h-6 bg-muted outline-input rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${medicalCooldownPercentage}%` }}
                  />
                </div> */}
                <Progress value={medicalCooldownPercentage} className="h-3" />
                <div className="text-xs text-muted-foreground">
                  {formatDuration(medicalCooldownElapsed)} / {formatDuration(medicalCooldownTotal)}{" "}
                  ({medicalCooldownPercentage.toFixed(1)}%)
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2 items-center justify-center px-4">
            <a
              href={factionArmoryLink()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-1/2")}
            >
              Faction Armory
            </a>
            <a
              href={inventoryLink()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-1/2")}
            >
              Inventory
            </a>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
