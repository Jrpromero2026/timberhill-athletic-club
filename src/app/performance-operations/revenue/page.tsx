import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Revenue" };

export default function RevenuePage() {
  return (
    <PlaceholderPage
      title="Revenue"
      description="Revenue by department, service and trainer."
      emptyTitle="Waiting for imported data"
      emptyDescription="Revenue shows here once sessions are imported."
    />
  );
}
