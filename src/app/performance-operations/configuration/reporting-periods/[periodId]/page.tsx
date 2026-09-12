import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PeriodForm,
  StatusTransitionButtons,
} from "@/components/periods/period-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { changePeriodStatus, updatePeriod } from "@/lib/actions/periods";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Reporting period" };

export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Reporting period" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Reporting period" />;

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("*, organizations ( name )")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) notFound();

  const canManage = hasPermissionInOrganization(
    context.memberships,
    period.organization_id,
    "period:manage"
  );
  const canReopen = hasPermissionInOrganization(
    context.memberships,
    period.organization_id,
    "payroll:reopen"
  );
  const locked = period.status === "locked";
  const orgName =
    (period.organizations as unknown as { name: string } | null)?.name ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={period.label}
        description={`${orgName} · ${period.period_type.replace("_", "-")} period`}
        actions={<StatusBadge status={period.status} />}
      />

      {canManage && (
        <section aria-label="Status" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">Period status</h2>
          <StatusTransitionButtons
            periodId={period.id}
            status={period.status}
            canReopen={canReopen}
            action={changePeriodStatus}
          />
        </section>
      )}

      <section aria-label="Details" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          {canManage && !locked ? "Edit period" : "Period details"}
        </h2>
        <PeriodForm
          action={updatePeriod}
          submitLabel="Save changes"
          periodId={period.id}
          organizationLocked
          organizations={[{ id: period.organization_id, name: orgName }]}
          disabled={!canManage || (locked && !canReopen)}
          defaults={{
            organizationId: period.organization_id,
            label: period.label,
            periodType: period.period_type,
            startDate: period.start_date,
            endDate: period.end_date,
            paymentDate: period.payment_date ?? "",
            notes: period.notes,
          }}
        />
      </section>
    </div>
  );
}
