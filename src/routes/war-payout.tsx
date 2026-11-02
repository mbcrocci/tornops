import { createFileRoute } from "@tanstack/react-router";
import { CredentialsCard } from "@/components/credentials";
import { WarPayout } from "@/components/war-payout";
import { useCredentialsStore } from "@/lib/stores";

type WarPayoutSearch = { wars?: number[] };

export const Route = createFileRoute("/war-payout")({
  // The war report links here with the wars it has selected.
  validateSearch: (search: Record<string, unknown>): WarPayoutSearch => ({
    wars: Array.isArray(search.wars)
      ? search.wars.filter((id): id is number => Number.isSafeInteger(id))
      : undefined,
  }),
  component: WarPayoutPage,
});

function WarPayoutPage() {
  const { publicKey, isTornKeyValid, isFFScouterKeyValid } = useCredentialsStore();
  const { wars } = Route.useSearch();
  const navigate = Route.useNavigate();

  if (!publicKey || isTornKeyValid === false) {
    return (
      <div className="container mx-auto flex h-screen flex-col items-center justify-center gap-4 p-2">
        <CredentialsCard showErrors={isTornKeyValid === false || isFFScouterKeyValid === false} />
      </div>
    );
  }

  return (
    <WarPayout
      selectedWarIds={wars}
      onSelectWars={(ids) => void navigate({ search: { wars: ids }, replace: true })}
    />
  );
}
