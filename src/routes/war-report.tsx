import { createFileRoute } from "@tanstack/react-router";
import { WarReport } from "@/components/war-report";
import { CredentialsCard } from "@/components/credentials";
import { useCredentialsStore } from "@/lib/stores";

export const Route = createFileRoute("/war-report")({
  component: WarReportPage,
});

function WarReportPage() {
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
      <WarReport />
    </>
  );
}
