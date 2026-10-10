import { createFileRoute } from "@tanstack/react-router";
import { ChainWatcher } from "@/components/chain-watcher";
import { CredentialsCard } from "@/components/credentials";
import { useCredentialsStore } from "@/lib/stores";

export const Route = createFileRoute("/chain-watcher")({
  component: ChainWatcherPage,
});

function ChainWatcherPage() {
  const { publicKey, isTornKeyValid, isFFScouterKeyValid } = useCredentialsStore();

  if (!publicKey || isTornKeyValid === false) {
    return (
      <div className="container mx-auto flex h-screen flex-col items-center justify-center gap-4 p-2">
        <CredentialsCard showErrors={isTornKeyValid === false || isFFScouterKeyValid === false} />
      </div>
    );
  }

  return (
    <>
      <ChainWatcher />
    </>
  );
}
