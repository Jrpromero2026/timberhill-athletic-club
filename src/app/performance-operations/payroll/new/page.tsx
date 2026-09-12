import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { NewRunForm } from "./run-form";

export const metadata: Metadata = { title: "New payroll run" };

export default async function NewPayrollRunPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="New payroll run" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="New payroll run" description="Select a single workspace first." />
        <EmptyState
          title="Choose a workspace"
          description="Payroll runs are created per organization. Pick an organization in the workspace selector."
        />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "payroll:create")) {
    return <PermissionDenied title="New payroll run" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="New payroll run" />;

  const { data: periods } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, start_date, end_date, status")
    .eq("organization_id", organizationId)
    .neq("status", "locked")
    .order("start_date", { ascending: false })
    .limit(36);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New payroll run"
        description="A draft run for one organization and reporting period. Calculation reads only the canonical appointment ledger."
      />
      {(periods ?? []).length === 0 ? (
        <EmptyState
          title="No usable reporting periods"
          description="Create a reporting period in Configuration first (locked periods cannot receive payroll runs)."
        />
      ) : (
        <NewRunForm
          organizationId={organizationId}
          organizationName={context.selected?.name ?? ""}
          periods={(periods ?? []).map((p) => ({
            id: p.id,
            label: p.label,
            range: `${p.start_date} – ${p.end_date}`,
            status: p.status,
          }))}
        />
      )}
    </div>
  );
}
