import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Revenue" };

export default function RevenuePage() {
  return (
    <PlaceholderPage
      title="Revenue"
      description="Revenue reporting by organization, department, service, and trainer."
      emptyTitle="Waiting for imported data"
      emptyDescription="Revenue is calculated from posted appointments and the revenue-recognition rules in docs/INPUTS_REQUIRED.md. No figures are shown until real data is imported and approved."
      phase="Phase 5 · Analytics"
    />
  );
}
