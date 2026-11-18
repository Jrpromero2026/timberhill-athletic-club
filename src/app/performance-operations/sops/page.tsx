import type { Metadata } from "next";
import { HubLibrary } from "@/components/hub/hub-library";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "SOPs" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="SOPs" />
      <HubLibrary section="trainers" />
    </div>
  );
}
