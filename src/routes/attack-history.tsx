import { createFileRoute, redirect } from "@tanstack/react-router";

// The page was renamed to War report. Old bookmarks still land on it.
export const Route = createFileRoute("/attack-history")({
  beforeLoad: () => {
    throw redirect({ to: "/war-report", replace: true });
  },
});
