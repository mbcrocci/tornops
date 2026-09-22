import { Link } from "@tanstack/react-router";
import { Activity, Radio, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "War room", icon: Swords },
  { to: "/chain-watcher", label: "Chain watcher", icon: Activity },
  { to: "/attack-history", label: "Attack history", icon: Swords },
  { to: "/online-activity", label: "Online activity", icon: Radio },
] as const;

export default function Header() {
  return (
    <header className="border-b bg-background/95 pr-14 backdrop-blur">
      <nav
        className="mx-auto flex h-12 max-w-[1500px] items-center gap-1 overflow-x-auto px-3 sm:px-6"
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
    </header>
  );
}
