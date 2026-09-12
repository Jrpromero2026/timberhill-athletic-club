import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { formatCents } from "@/lib/money/money";
import { loadRunStatementContext } from "@/lib/payroll/statements";

export const metadata: Metadata = { title: "Payroll statements" };

export default async function PayrollStatementsPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Payroll statements" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Payroll statements" />;

  const data = await loadRunStatementContext(actor, runId);
  if (!data) notFound();
  const { run, summaries } = data;
  if (!hasPermissionInOrganization(context.memberships, run.organization_id, "payroll:read")) {
    return <PermissionDenied title="Payroll statements" />;
  }
  const canExport = hasPermissionInOrganization(
    context.memberships,
    run.organization_id,
    "payroll:export",
  );
  const finalized = ["posted", "locked"].includes(run.status);

  const total = summaries.reduce((n, s) => n + s.final_gross_compensation_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Statements: ${run.name}`}
        description={`${data.organizationName} · ${data.periodLabel} (${data.periodRange}) · status ${run.status.replaceAll("_", " ")}`}
        actions={
          <Link
            href={`/performance-operations/payroll/${run.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Run overview
          </Link>
        }
      />

      {!finalized && (
        <div className="rounded-[--radius-card] border border-warning bg-warning-soft p-3 text-sm text-warning">
          This run is not posted yet — statements below are DRAFT preparation figures and may
          change on recalculation.
        </div>
      )}

      {canExport && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`/performance-operations/payroll/${run.id}/export`}
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Download department summary CSV
          </a>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Department summary</h2>
        {summaries.length === 0 ? (
          <p className="text-sm text-ink-muted">No trainer results — calculate the run first.</p>
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Trainer</th>
                  <th className="px-4 py-2 font-medium">Sessions</th>
                  <th className="px-4 py-2 font-medium">Minutes</th>
                  <th className="px-4 py-2 text-right font-medium">Basis</th>
                  <th className="px-4 py-2 text-right font-medium">Commission</th>
                  <th className="px-4 py-2 text-right font-medium">Flat</th>
                  <th className="px-4 py-2 text-right font-medium">Hourly</th>
                  <th className="px-4 py-2 text-right font-medium">Team</th>
                  <th className="px-4 py-2 text-right font-medium">Adjust.</th>
                  <th className="px-4 py-2 text-right font-medium">Final gross</th>
                  <th className="px-4 py-2 font-medium">Statement</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-2.5 font-medium text-ink">{s.trainerName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {s.completed_session_count}/{s.appointment_count}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.compensated_minutes}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.eligible_basis_total_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.commission_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.flat_rate_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.hourly_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.team_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.adjustment_total_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                      {formatCents(s.final_gross_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/performance-operations/payroll/${run.id}/statements/${s.trainer_id}`}
                        className="text-xs font-medium text-accent hover:text-accent-strong"
                      >
                        View statement
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-subtle">
                  <td className="px-4 py-2.5 text-sm font-semibold text-ink">TOTAL</td>
                  <td colSpan={8} />
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold">
                    {formatCents(total)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        All figures are gross compensation preparation only — never net pay. Taxes and
        withholdings are handled outside this system. Statements identify sessions by date and
        service; client identities are never included.
      </p>
    </div>
  );
}
