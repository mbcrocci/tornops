import { Link } from "@tanstack/react-router";
import { Activity, Radio, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserData } from "@/hooks/use-torn";
import { useCredentialsStore } from "@/lib/stores";
import { SettingsSheet } from "@/components/settings";

const links = [
  { to: "/", label: "War room", icon: Swords },
  { to: "/chain-watcher", label: "Chain watcher", icon: Activity },
  { to: "/attack-history", label: "Attack history", icon: Swords },
  { to: "/online-activity", label: "Online activity", icon: Radio },
] as const;

function UserIdentification() {
  const { data: user } = useUserData();

  if (!user?.name || !user.player_id) return null;

  const activityStatus = user.last_action?.status ?? "Unknown";
  const statusColor =
    activityStatus === "Online"
      ? "bg-green-500"
      : activityStatus === "Idle"
        ? "bg-yellow-500"
        : "bg-gray-400";

  return (
    <div className="max-w-28 rounded-md border bg-muted/30 px-2.5 py-1 text-left leading-tight sm:max-w-48">
      <div className="flex items-center justify-between gap-1.5 text-xs font-medium">
        <span className="truncate" title={user.name}>
          {user.name}
        </span>
        <span
          className={cn("size-2 shrink-0 rounded-full", statusColor)}
          role="img"
          aria-label={activityStatus}
          title={activityStatus}
        />
      </div>
      <div className="text-[10px] text-muted-foreground">ID: {user.player_id}</div>
    </div>
  );
}

export default function Header() {
  const { publicKey, isTornKeyValid } = useCredentialsStore();
  const isLoggedIn = Boolean(publicKey) && isTornKeyValid !== false;

  return (
    <header className="flex items-center border-b bg-background/95 backdrop-blur">
      <nav
        className="mx-auto flex h-12 min-w-0 max-w-[1500px] flex-1 items-center gap-1 overflow-x-auto px-3 sm:px-6"
        aria-label="Main navigation"
      >
        <span className="mr-3 hidden font-mono text-xs font-bold tracking-[0.18em] sm:inline">
          TORNOPS
        </span>
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: cn("bg-primary/10 text-primary") }}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      {isLoggedIn && (
        <div className="flex shrink-0 items-center gap-3 pr-2">
          <UserIdentification />
          <SettingsSheet />
        </div>
      )}
    </header>
  );
}
