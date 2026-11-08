import { Swords } from "lucide-react";
import { useNowSeconds } from "@/hooks/use-now";
import { playerAttackLink } from "@/lib/links";
import { formatClock, getStatusTone } from "@/lib/status";
import { useGlobalStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

// Three is enough to plan the next hits without repeating the roster's hospital section.
const SHOWN = 3;
/** Same window the roster uses to call a release imminent. */
const RELEASE_SOON_SECONDS = 120;

/** The enemies who become hittable next, so you can be on their attack page when they do. */
export function NextOutPanel({ className }: { className?: string }) {
  const members = useGlobalStore((state) => state.enemyMembers);
  const now = useNowSeconds();
  const upcoming = members
    .filter((member) => member.status.state === "Hospital" && member.status.until > now)
    .sort((a, b) => a.status.until - b.status.until)
    .slice(0, SHOWN);

  if (!upcoming.length) return null;
  const tone = getStatusTone("Hospital");

  return (
    <Panel
      aria-label="Out of hospital next"
      // One line on tablets (title beside the names), a list in the desktop sidebar.
      className={cn(
        "gap-2 py-2 sm:py-2 xl:py-4",
        "md:flex-row md:items-center md:gap-4",
        "xl:flex-col xl:items-stretch xl:gap-2",
        className,
      )}
    >
      <h2 className="shrink-0 text-sm font-semibold">Out of hospital next</h2>
      <ol className="flex gap-x-10 overflow-hidden xl:flex-col xl:gap-x-0">
        {upcoming.map((member, index) => {
          const remaining = member.status.until - now;
          const soon = remaining <= RELEASE_SOON_SECONDS;
          const ff = member.ffs?.fair_fight;
          return (
            <li key={member.id} className={cn("xl:w-full", index >= 3 && "hidden xl:block")}>
              {/* The whole row opens the attack page, ready for the moment they are out. */}
              <a
                href={playerAttackLink(member.id)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open the attack page for ${member.name}`}
                className="group/next -mx-1.5 flex items-center gap-2 rounded-md xl:gap-3 px-1.5 py-1 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "shrink-0 rounded tabular-nums xl:w-[4.25rem]",
                    // Neutral until the release is close; colour means "get ready".
                    soon
                      ? cn("px-1.5 font-semibold ring-1 ring-inset", tone.pill)
                      : "text-foreground",
                  )}
                >
                  {formatClock(remaining)}
                </span>
                <span className="min-w-0 truncate font-medium xl:flex-1">{member.name}</span>
                {ff ? (
                  <span
                    className={cn(
                      "hidden text-xs tabular-nums xl:inline",
                      // Same rule as the roster: no FF colour until they can be hit.
                      "text-muted-foreground",
                    )}
                  >
                    FF {ff.toFixed(2)}
                  </span>
                ) : null}
                <span className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground group-hover/next:border-primary/60 group-hover/next:text-foreground">
                  <Swords className="size-3.5" aria-hidden />
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
