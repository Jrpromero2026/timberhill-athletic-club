import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <PlaceholderPage
      title="Clients"
      description="Client registry scoped to the selected workspace."
      emptyTitle="No client data yet"
      emptyDescription="Clients are created in the Configuration phase and matched automatically during imports. Nothing is displayed until real client records exist."
      phase="Phase 2 · Configuration"
    />
  );
}
