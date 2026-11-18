import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <PlaceholderPage
      title="Clients"
      emptyTitle="No client data yet"
      emptyDescription="Clients show here once sessions are imported."
    />
  );
}
