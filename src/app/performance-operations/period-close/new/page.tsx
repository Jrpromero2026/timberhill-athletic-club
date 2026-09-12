import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { NewCloseForm } from "./close-form";

export const metadata: Metadata = { title: "Start period close" };

export default async function NewPeriodClosePage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Start period close" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "period_close:create")) {
    return <PermissionDenied title="Start period close" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Start period close" />;

  const { data: periods } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, start_date, end_date")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .order("start_date", { ascending: false })
    .limit(24);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Start period close"
        description="Creates a close run in review — nothing closes until readiness passes, warnings are acknowledged, and the close is approved and executed."
      />
      {(periods ?? []).length === 0 ? (
        <EmptyState
          title="No open reporting periods"
          description="Only open periods can enter close review."
        />
      ) : (
        <NewCloseForm
          organizationId={organizationId}
          organizationName={context.selected?.name ?? ""}
          periods={(periods ?? []).map((p) => ({
            id: p.id,
            label: p.label,
            range: `${p.start_date} – ${p.end_date}`,
          }))}
        />
      )}
    </div>
  );
}
