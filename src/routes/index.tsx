import { Chains } from "@/components/chain";
import { EnemyFactionTable } from "@/components/enemy-faction";
import { UserStatus } from "@/components/user-status";
import { useUserFaction } from "@/hooks/use-torn";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  useUserFaction();

  return (
    <div className="container mx-auto p-4 flex flex-col gap-8">
      <div className="flex flex-row gap-4 w-full">
        <UserStatus />
        <Chains />
      </div>
      <EnemyFactionTable />
    </div>
  );
}
