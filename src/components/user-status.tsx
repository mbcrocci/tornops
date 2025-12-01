import { useUserData, useUserFactionChain } from "@/hooks/use-torn";
import { factionArmoryLink, inventoryLink } from "@/lib/links";
import { getStatusBgColorClass } from "@/lib/status";
import { useEffect } from "react";
import { buttonVariants } from "./ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Progress } from "./ui/progress";
import { cn } from "@/lib/utils";

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
  const { data: userData } = useUserData();
  const { data: userFactionChain } = useUserFactionChain();

  useEffect(() => {
    console.log(userFactionChain);
  }, [userFactionChain]);

  const healthPercentage = userData
    ? (userData.life.current / userData.life.maximum) * 100
    : 0;

  const medicalCooldownRemaining = userData?.cooldowns.medical || 0;

  // Standard medical cooldown is 8 hours (28800 seconds)
  // If remaining time is greater than 8h, use it as the total (cooldown just started with extended time)
  const standardMedicalCooldown = 8 * 3600; // 8 hours
  const medicalCooldownTotal = Math.max(
    standardMedicalCooldown,
    medicalCooldownRemaining
  );
  const medicalCooldownElapsed = userData?.cooldowns.medical || 0;
  //medicalCooldownTotal - medicalCooldownRemaining;

  const medicalCooldownPercentage =
    medicalCooldownTotal > 0
      ? (medicalCooldownElapsed / medicalCooldownTotal) * 100
      : 0;

  if (!userData) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Your Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div>
          <div className="text-sm font-medium mb-2">Status:</div>
          <div className="w-full h-6 bg-muted rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full flex items-center justify-center text-white text-xs font-semibold ${getStatusBgColorClass(userData.status.state)}`}
              style={{ width: "100%" }}
            >
              {userData.status.description || userData.status.state}
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-2 w-full">
          {/* Health */}
          <div className="w-1/2">
            <div className="text-sm font-medium mb-2">Health:</div>
            <Progress value={healthPercentage} className="h-6" />
            <div className="text-sm text-muted-foreground">
              {userData.life.current.toLocaleString()} /{" "}
              {userData.life.maximum.toLocaleString()} (
              {healthPercentage.toFixed(1)}%)
            </div>
          </div>

          {/* Medical Cooldown */}
          <div className="w-1/2">
            <div className="text-sm font-medium mb-2">Medical Cooldown:</div>
            {/* <div className="w-full h-6 bg-muted outline-input rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${medicalCooldownPercentage}%` }}
                />
              </div> */}
            <Progress value={medicalCooldownPercentage} className="h-6" />
            <div className="text-sm text-muted-foreground">
              {formatDuration(medicalCooldownElapsed)} /{" "}
              {formatDuration(medicalCooldownTotal)} (
              {medicalCooldownPercentage.toFixed(1)}%)
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-4 items-center justify-center px-8">
        <a
          href={factionArmoryLink()}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "default" }), "w-1/2")}
        >
          Faction Armory
        </a>
        <a
          href={inventoryLink()}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "default" }), "w-1/2")}
        >
          Inventory
        </a>
      </CardFooter>
    </Card>
  );
}
