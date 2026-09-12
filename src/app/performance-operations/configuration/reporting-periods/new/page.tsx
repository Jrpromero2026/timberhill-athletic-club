import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { PeriodForm } from "@/components/periods/period-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { createPeriod } from "@/lib/actions/periods";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Add reporting period" };

export default async function NewPeriodPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Add reporting period" />;

  const manageableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "period:manage")
  );
  if (manageableOrgs.length === 0) {
    return <PermissionDenied title="Add reporting period" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add reporting period"
        description="New periods open immediately. Close a period at its end; lock it once payroll is final."
      />
      <PeriodForm
        action={createPeriod}
        submitLabel="Create period"
        organizations={manageableOrgs}
        defaults={
          context.selection.kind === "organization"
            ? { organizationId: context.selection.organizationId }
            : {}
        }
      />
    </div>
  );
}
