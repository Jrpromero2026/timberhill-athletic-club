import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { PlanForm } from "@/components/compensation/plan-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "New compensation plan" };

export default async function NewCompensationPlanPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="New compensation plan" />;

  const manageableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "compensation:manage")
  );
  if (manageableOrgs.length === 0) {
    return <PermissionDenied title="New compensation plan" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New compensation plan"
        description="Creates the plan container and a draft version 1. Configure rules and tiers before publishing."
      />
      <PlanForm
        organizations={manageableOrgs}
        defaultOrganizationId={
          context.selection.kind === "organization"
            ? context.selection.organizationId
            : undefined
        }
      />
    </div>
  );
}
