import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { formatCents } from "@/lib/money/money";
import {
  AdjustmentDecisionForms,
  NewAdjustmentForm,
  VoidAdjustmentButton,
} from "./adjustment-forms";

export const metadata: Metadata = { title: "Payroll adjustments" };

const STATUS_CLASS: Record<string, string> = {
  submitted: "text-info",
  approved: "text-positive",
  included: "text-positive",
  rejected: "text-negative",
  voided: "text-ink-muted",
  draft: "text-ink-muted",
};

export default async function PayrollAdjustmentsPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Payroll adjustments" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll adjustments" description="Select a single workspace first." />
        <EmptyState title="Choose a workspace" description="Adjustments are managed per organization." />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  const canManage = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:manage_adjustments",
  );
  const canApprove = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:approve_adjustments",
  );
  if (!canManage && !canApprove) return <PermissionDenied title="Payroll adjustments" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Payroll adjustments" />;

  const period = await getPeriodContext(context);
  const selectedPeriod = period.selected;

  const { data: trainerRows } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("trainer_id, trainers ( id, display_name )")
    .eq("organization_id", organizationId)
    .is("effective_to", null);
  const trainers = (trainerRows ?? [])
    .flatMap((row) => {
      const t = row.trainers as unknown as { id: string; display_name: string } | null;
      return t ? [{ id: t.id, name: t.display_name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const trainerName = new Map(trainers.map((t) => [t.id, t.name]));

  const adjustmentsQuery = actor.supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: adjustments } = selectedPeriod
    ? await adjustmentsQuery.eq("reporting_period_id", selectedPeriod.id)
    : await adjustmentsQuery;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll adjustments"
        description="Bonuses, deductions, corrections, reimbursements, and carry-forwards — every one needs a reason and independent approval."
        actions={
          <Link
            href="/performance-operations/payroll"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Payroll
          </Link>
        }
      />

      {!selectedPeriod ? (
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header to manage adjustments for it."
        />
      ) : (
        <>
          {canManage && (
            <NewAdjustmentForm
              organizationId={organizationId}
              periodId={selectedPeriod.id}
              trainers={trainers}
            />
          )}

          {(adjustments ?? []).length === 0 ? (
            <EmptyState
              title="No adjustments in this period"
              description="Approved adjustments are picked up by the next payroll calculation for the period."
            />
          ) : (
            <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2 font-medium">Trainer</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium">Reference</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(adjustments ?? []).map((adj) => (
                    <tr key={adj.id} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {trainerName.get(adj.trainer_id) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{adj.adjustment_type.replaceAll("_", " ")}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {adj.adjustment_type === "deduction" ? "−" : ""}
                        {formatCents(adj.amount_cents)}
                      </td>
                      <td className="max-w-56 px-4 py-2.5 text-xs text-ink-secondary">{adj.reason}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">
                        {adj.supporting_reference ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${STATUS_CLASS[adj.status] ?? ""}`}>
                          {adj.status}
                        </span>
                        {adj.rejection_reason && (
                          <p className="text-[11px] text-ink-muted">{adj.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          {canApprove && adj.status === "submitted" && (
                            <AdjustmentDecisionForms adjustmentId={adj.id} />
                          )}
                          {canManage && ["draft", "submitted"].includes(adj.status) && (
                            <VoidAdjustmentButton adjustmentId={adj.id} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
