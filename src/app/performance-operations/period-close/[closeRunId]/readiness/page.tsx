import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { evaluateCloseReadiness } from "@/lib/close/readiness";
import type { CloseCheck } from "@/lib/close/checks";
import { loadCloseRunShell } from "../../run-shell";
import { AcknowledgeForm, SimpleCloseAction } from "../../close-actions";

export const metadata: Metadata = { title: "Close readiness" };

const CATEGORY_LABEL: Record<CloseCheck["category"], string> = {
  reporting_period: "Reporting period",
  imports: "Imports",
  appointments: "Appointments",
  payroll: "Payroll",
  configuration: "Configuration",
  reporting: "Reporting",
};

const SEVERITY_CLASS: Record<CloseCheck["severity"], string> = {
  blocking: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export default async function CloseReadinessPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close readiness" />;
  const { run, period, can, actor } = shell;
  const mutable = ["close_review", "ready_to_close"].includes(run.status);

  // Every visit re-evaluates against live state (persisting only while the
  // run is still mutable) — the page can never show stale completion.
  const evaluation = await evaluateCloseReadiness(actor, closeRunId, {
    persist: mutable && can("period_close:review"),
  });
  if (!evaluation) return <PermissionDenied title="Close readiness" />;

  const byCategory = new Map<string, CloseCheck[]>();
  for (const check of evaluation.checks) {
    const list = byCategory.get(check.category) ?? [];
    list.push(check);
    byCategory.set(check.category, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Readiness: ${period?.label ?? "?"}`}
        description={`${evaluation.summary.blockingOpen} blocking · ${evaluation.summary.warningsOpen} unacknowledged warning(s) · ${evaluation.summary.warningsAcknowledged} acknowledged`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/performance-operations/period-close/${run.id}`}
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              ← Close run
            </Link>
            {mutable && can("period_close:review") && (
              <SimpleCloseAction
                action="evaluate"
                runId={run.id}
                label="Re-evaluate"
                pendingLabel="Evaluating…"
                tone="neutral"
              />
            )}
          </div>
        }
      />

      {[...byCategory.entries()].map(([category, checks]) => (
        <section key={category} className="space-y-2" data-testid={`readiness-${category}`}>
          <h2 className="text-sm font-semibold text-ink">
            {CATEGORY_LABEL[category as CloseCheck["category"]]}
          </h2>
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[860px] text-sm">
              <tbody>
                {checks.map((check) => (
                  <tr
                    key={check.code}
                    className="border-b border-border align-top last:border-0"
                    data-check={check.code}
                    data-status={check.status}
                    data-resolution={check.resolutionState}
                  >
                    <td className="w-24 px-3 py-2.5">
                      {check.status === "pass" ? (
                        <span className="text-xs font-semibold text-positive">pass</span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CLASS[check.severity]}`}
                        >
                          {check.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{check.definition}</p>
                      <p className="mt-0.5 text-xs text-ink-secondary">{check.explanation}</p>
                      {check.status === "fail" && (
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          → {check.action}{" "}
                          <Link href={check.link} className="font-medium text-accent hover:text-accent-strong">
                            Open workflow
                          </Link>
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                        {check.code} · {check.source}
                        {check.waivable ? " · waivable" : " · non-waivable"} · evaluated{" "}
                        {check.lastEvaluatedAt.slice(0, 19).replace("T", " ")}
                      </p>
                    </td>
                    <td className="w-72 px-3 py-2.5">
                      {check.status === "fail" && check.waivable && mutable && (
                        check.acknowledged ? (
                          <span className="text-xs font-semibold text-positive">
                            acknowledged
                          </span>
                        ) : can("period_close:review") ? (
                          <AcknowledgeForm runId={run.id} checkCode={check.code} />
                        ) : (
                          <span className="text-xs text-ink-muted">
                            Awaiting reviewer acknowledgement
                          </span>
                        )
                      )}
                      {check.status === "fail" && check.acknowledged && !mutable && (
                        <span className="text-xs text-positive">acknowledged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
