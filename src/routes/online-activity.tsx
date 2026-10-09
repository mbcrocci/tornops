import { createFileRoute } from "@tanstack/react-router";
import { CredentialsCard } from "@/components/credentials";
import { FFScouterActivityHistory } from "@/components/ffscouter-activity-history";
import { useCredentialsStore } from "@/lib/stores";

export const Route = createFileRoute("/online-activity")({
  component: OnlineActivityPage,
});

function OnlineActivityPage() {
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
      <FFScouterActivityHistory />
    </>
  );
}
