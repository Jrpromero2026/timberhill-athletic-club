import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Reporting periods" };

export default async function ReportingPeriodsPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Reporting periods" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "period:read")
  );
  if (!canRead) return <PermissionDenied title="Reporting periods" />;
  const canManage = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "period:manage")
  );

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Reporting periods" />;

  const { data } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, period_type, start_date, end_date, payment_date, status, organizations ( name )")
    .in("organization_id", orgIds)
    .order("start_date", { ascending: false });

  interface PeriodRow {
    id: string;
    label: string;
    period_type: string;
    start_date: string;
    end_date: string;
    payment_date: string | null;
    status: string;
    organizations: { name: string } | null;
  }
  const periods = (data ?? []) as unknown as PeriodRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporting periods"
        description="Monthly reporting and semi-monthly/biweekly payroll windows per organization. Same-type periods never overlap; locked periods require platform-admin authorization to change."
        actions={
          canManage ? (
            <Link href="/performance-operations/configuration/reporting-periods/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
              Add period
            </Link>
          ) : undefined
        }
      />
      {periods.length === 0 ? (
        <EmptyState
          title="No reporting periods yet"
          description="Create the first reporting period once the payroll schedule rules are confirmed (docs/INPUTS_REQUIRED.md #11). The header period selector activates as soon as periods exist."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Dates</th>
                <th className="px-4 py-2 font-medium">Payment</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-2.5">
                    <Link href={`/performance-operations/configuration/reporting-periods/${period.id}`}
                      className="font-medium text-ink hover:text-accent">
                      {period.label}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{period.organizations?.name}</td>
                  <td className="px-4 py-2.5 text-ink-secondary">{period.period_type.replace("_", "-")}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                    {period.start_date} → {period.end_date}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                    {period.payment_date ?? "—"}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={period.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
