import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { NewDashboardForm } from "../dashboard-forms";

export const metadata: Metadata = { title: "New dashboard" };

/** Dedicated create route (the list page offers the same form inline). */
export default async function NewDashboardPage() {
  const context = await loadAnalyticsContext();
  if (context.state !== "ready" && context.state !== "no_period") {
    return <PermissionDenied title="New dashboard" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="New dashboard" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Pick a reporting period to see dashboards."
        />
      </div>
    );
  }
  if (!context.can("dashboard:create")) {
    return <PermissionDenied title="New dashboard" />;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="New dashboard"
        description="Dashboards are built from the existing metrics, goals and benchmarks."
      />
      <NewDashboardForm organizationId={context.organizationId} />
    </div>
  );
}
