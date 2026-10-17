import { Eye, Swords } from "lucide-react";
import type { StatusClass } from "@/lib/faction";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { cleanStatusDescription, getStatusBgColorClass } from "@/lib/status";
import { HospitalCountdown } from "./hospital-countdown";
import { TravelCountdown } from "./travel-countdown";
import { buttonVariants } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function PlayerStatusBadge({
  id,
  status,
  showTravelEta = true,
}: {
  id: number;
  status: StatusClass;
  showTravelEta?: boolean;
}) {
  const description = cleanStatusDescription(status.description) || status.state;

  return (
    <div
      className={`${getStatusBgColorClass(
        status.state,
      )} text-white font-semibold px-3 py-2 rounded-md  text-center shadow-sm`}
    >
      {status.state === "Hospital" && status.until > 0 ? (
        <span>
          {description}
          <HospitalCountdown until={status.until} />
        </span>
      ) : (
        <span>{description}</span>
      )}
      {showTravelEta && <TravelCountdown id={id} status={status} />}
    </div>
  );
}

export function FairFightValue({ ff }: { ff: number | undefined }) {
  if (!ff) {
    return <div>N/A</div>;
  }

  let color = "text-gray-600";
  if (ff < 2) color = "text-blue-600";
  else if (ff < 4) color = "text-green-600";
  else if (ff < 6) color = "text-yellow-600";
  else color = "text-red-600";

  return <div className={color}>{ff.toFixed(2)}</div>;
}

export function ProfileButton({ playerId }: { playerId: number }) {
  return (
    <Tooltip delayDuration={750}>
      <TooltipTrigger asChild>
        <a
          aria-label="View profile"
          href={playerProfileLink(playerId)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <Eye />
        </a>
      </TooltipTrigger>
      <TooltipContent>View profile</TooltipContent>
    </Tooltip>
  );
}

export function AttackButton({ playerId }: { playerId: number }) {
  return (
    <Tooltip delayDuration={750}>
      <TooltipTrigger asChild>
        <a
          aria-label="Attack"
          href={playerAttackLink(playerId)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <Swords />
        </a>
      </TooltipTrigger>
      <TooltipContent>Attack</TooltipContent>
    </Tooltip>
  );
}
