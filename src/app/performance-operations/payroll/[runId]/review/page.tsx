import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { formatCents } from "@/lib/money/money";
import { loadRunStatementContext, loadTrainerStatement } from "@/lib/payroll/statements";
import { IssueResolutionForm, ReviewToggle } from "./review-actions";

export const metadata: Metadata = { title: "Payroll review" };

export default async function PayrollReviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Payroll review" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Payroll review" />;

  const statementContext = await loadRunStatementContext(actor, runId);
  if (!statementContext) notFound();
  const { run, summaries } = statementContext;
  if (!hasPermissionInOrganization(context.memberships, run.organization_id, "payroll:read")) {
    return <PermissionDenied title="Payroll review" />;
  }
  const canReview = hasPermissionInOrganization(
    context.memberships,
    run.organization_id,
    "payroll:review",
  );
  const canSeeTrace = hasPermissionInOrganization(
    context.memberships,
    run.organization_id,
    "payroll:view_calculation_trace",
  );
  const runMutable = ["draft", "calculating", "needs_review", "ready_for_approval", "reopened", "failed"].includes(
    run.status,
  );

  const { data: issues } = await actor.supabase
    .from("payroll_issues")
    .select("*")
    .eq("payroll_run_id", runId)
    .order("severity")
    .order("created_at");
  const openIssues = (issues ?? []).filter((i) => i.resolution_status === "open");
  const closedIssues = (issues ?? []).filter((i) => i.resolution_status !== "open");

  const statements = await Promise.all(
    summaries.map((s) => loadTrainerStatement(actor, runId, s.trainer_id)),
  );

  const severityClass: Record<string, string> = {
    blocking: "text-negative",
    warning: "text-warning",
    info: "text-info",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Review: ${run.name}`}
        description={`${statementContext.organizationName} · ${statementContext.periodLabel} · status ${run.status.replaceAll("_", " ")}`}
        actions={
          <Link
            href={`/performance-operations/payroll/${run.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Run overview
          </Link>
        }
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">
          Open issues ({openIssues.length})
        </h2>
        {openIssues.length === 0 ? (
          <p className="text-sm text-positive">No open issues.</p>
        ) : (
          <ul className="space-y-2">
            {openIssues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-[--radius-card] border border-border bg-surface p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-bold uppercase ${severityClass[issue.severity] ?? ""}`}>
                    {issue.severity}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">{issue.code}</span>
                </div>
                <p className="mt-1 text-sm text-ink">{issue.message}</p>
                {issue.suggested_action && (
                  <p className="mt-0.5 text-xs text-ink-secondary">→ {issue.suggested_action}</p>
                )}
                {canReview && runMutable && (
                  <div className="mt-2">
                    <IssueResolutionForm issueId={issue.id} severity={issue.severity} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {closedIssues.length > 0 && (
          <details className="text-sm text-ink-secondary">
            <summary className="cursor-pointer">Closed issues ({closedIssues.length})</summary>
            <ul className="mt-2 space-y-1">
              {closedIssues.map((issue) => (
                <li key={issue.id} className="text-xs">
                  <span className="font-mono">{issue.code}</span> — {issue.resolution_status}
                  {issue.resolution_reason ? `: ${issue.resolution_reason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Trainer calculations</h2>
        {summaries.length === 0 && (
          <p className="text-sm text-ink-muted">No trainer summaries yet — calculate the run first.</p>
        )}
        {summaries.map((summary, index) => {
          const statement = statements[index];
          if (!statement) return null;
          return (
            <details
              key={summary.id}
              id={`trainer-${summary.trainer_id}`}
              className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
            >
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-medium text-ink">
                  {summary.trainerName}
                  {summary.calculation_status === "blocked" && (
                    <span className="ml-2 text-xs font-semibold text-negative">blocked</span>
                  )}
                </span>
                <span className="flex items-center gap-4">
                  <span className="font-mono text-sm font-semibold text-ink">
                    {formatCents(summary.final_gross_compensation_cents)}
                  </span>
                  <span
                    className={`text-xs ${summary.review_status === "reviewed" ? "text-positive" : "text-ink-muted"}`}
                  >
                    {summary.review_status}
                  </span>
                </span>
              </summary>
              <div className="border-t border-border px-4 py-3">
                {canReview && runMutable && (
                  <div className="mb-3">
                    <ReviewToggle
                      summaryId={summary.id}
                      reviewed={summary.review_status === "reviewed"}
                    />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                        <th className="px-2 py-1.5 font-medium">Date</th>
                        <th className="px-2 py-1.5 font-medium">Type</th>
                        <th className="px-2 py-1.5 font-medium">Service</th>
                        <th className="px-2 py-1.5 font-medium">Session status</th>
                        <th className="px-2 py-1.5 text-right font-medium">Basis</th>
                        <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                        <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                        <th className="px-2 py-1.5 font-medium">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((line) => (
                        <tr key={line.id} className="border-b border-border align-top last:border-0">
                          <td className="px-2 py-1.5 font-mono text-xs">{line.appointmentDate ?? "—"}</td>
                          <td className="px-2 py-1.5 text-xs">{line.lineType.replaceAll("_", " ")}</td>
                          <td className="px-2 py-1.5 text-xs">{line.serviceName ?? "—"}</td>
                          <td className="px-2 py-1.5 text-xs">{line.canonicalStatus ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs">
                            {line.basisAmountCents === null ? "—" : formatCents(line.basisAmountCents)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs">
                            {line.rateAmountCents !== null
                              ? formatCents(line.rateAmountCents)
                              : line.rateBasisPoints !== null
                                ? `${(line.rateBasisPoints / 100).toFixed(2)}%`
                                : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">
                            {formatCents(line.roundedAmountCents)}
                          </td>
                          <td className="px-2 py-1.5 text-xs">
                            {line.calculationStatus === "calculated" ? (
                              <span className="text-positive">ok</span>
                            ) : (
                              <span
                                className={
                                  line.calculationStatus === "blocked" ? "text-negative" : "text-ink-muted"
                                }
                              >
                                {line.calculationStatus}
                                {line.exclusionReason ? `: ${line.exclusionReason}` : ""}
                              </span>
                            )}
                            {canSeeTrace && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[11px] text-accent">trace</summary>
                                <pre className="mt-1 max-w-md overflow-x-auto rounded bg-surface-sunken p-2 text-[11px] leading-4">
                                  {JSON.stringify(line.trace, null, 2)}
                                </pre>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
