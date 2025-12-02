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
      <div className="container mx-auto p-4 flex flex-col gap-8 items-center justify-center h-screen">
        <CredentialsCard
          showErrors={isTornKeyValid === false || isFFScouterKeyValid === false}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col gap-8">
      <div className="flex justify-end absolute top-4 right-4">
        <SettingsSheet />
      </div>
      <div className="flex flex-row gap-4 w-full">
        <UserStatus />
        <Chains />
      </div>
      <EnemyFactionTable />
    </div>
  );
}
