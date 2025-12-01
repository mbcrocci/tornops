import { Chains } from "@/components/chain";
import { CredentialsCard } from "@/components/credentials";
import { EnemyFactionTable } from "@/components/enemy-faction";
import { SettingsSheet } from "@/components/settings";
import { UserStatus } from "@/components/user-status";
import { useCredentialsStore } from "@/lib/stores";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const key = useCredentialsStore((state) => state.publicKey);
  if (!key) {
    return (
      <div className="container mx-auto p-4 flex flex-col gap-8 items-center justify-center h-screen">
        <CredentialsCard />
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
