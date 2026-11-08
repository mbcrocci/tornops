import { createFileRoute } from "@tanstack/react-router";
import { CredentialsCard } from "@/components/credentials";
import { FactionComparison } from "@/components/faction/faction-comparison";
import { EnemyChainPanel, OurChainPanel } from "@/components/war-room/chain-panel";
import { NextOutPanel } from "@/components/war-room/next-out-panel";
import { WarBar } from "@/components/war-room/war-bar";
import { YouPanel } from "@/components/war-room/you-panel";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { publicKey, isTornKeyValid, isFFScouterKeyValid } = useCredentialsStore();
  const collapsed = useGlobalStore((state) => state.collapsedCards);

  // Show credentials card if no key or Torn key is invalid
  const shouldShowCredentials = !publicKey || isTornKeyValid === false;

  if (shouldShowCredentials) {
    return (
      <div className="container mx-auto p-2 flex flex-col gap-4 items-center justify-center h-screen">
        <CredentialsCard showErrors={isTornKeyValid === false || isFFScouterKeyValid === false} />
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4">
      <h1 className="sr-only">War room</h1>
      <WarBar />
      {/* On wide screens your status and both chains sit beside the roster and stay in view. */}
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] items-start gap-3",
          // The roster is as wide as its columns; the sidebar takes whatever is left.
          !collapsed &&
            "xl:grid-cols-[minmax(0,1fr)_22rem] min-[87.5rem]:grid-cols-[minmax(0,1fr)_28rem]",
        )}
      >
        {!collapsed && (
          <aside
            aria-label="Your status and chains"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:sticky xl:top-3 xl:order-last xl:grid-cols-1"
          >
            <YouPanel />
            <OurChainPanel />
            <EnemyChainPanel />
            {/* A strip under the cards on tablets, a list in the sidebar on desktops. */}
            <NextOutPanel className="hidden md:col-span-3 md:flex xl:col-span-1" />
          </aside>
        )}
        <FactionComparison />
      </div>
    </main>
  );
}
