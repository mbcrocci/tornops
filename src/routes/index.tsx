import { createFileRoute } from "@tanstack/react-router";
import { Chains } from "@/components/chain";
import { CredentialsCard } from "@/components/credentials";
import { EnemyFactionTable } from "@/components/enemy-faction";
import { SettingsSheet } from "@/components/settings";
import { UserStatus } from "@/components/user-status";
import { useCredentialsStore } from "@/lib/stores";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { publicKey, isTornKeyValid, isFFScouterKeyValid } =
    useCredentialsStore();

  // Show credentials card if no key or Torn key is invalid
  const shouldShowCredentials = !publicKey || isTornKeyValid === false;

  if (shouldShowCredentials) {
    return (
      <div className="container mx-auto p-2 flex flex-col gap-4 items-center justify-center h-screen">
        <CredentialsCard
          showErrors={isTornKeyValid === false || isFFScouterKeyValid === false}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-2 flex flex-col gap-2">
      <div className="flex justify-end absolute top-2 right-2">
        <SettingsSheet />
      </div>
      <div className="flex flex-col md:flex-row gap-2 w-full">
        <UserStatus />
        <Chains />
      </div>
      <EnemyFactionTable />
    </div>
  );
}
