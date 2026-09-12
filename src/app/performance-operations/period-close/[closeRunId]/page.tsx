import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { Widget } from "@/components/widgets/section";
import { CLOSE_STATUS_LABEL, type CloseStatus } from "@/lib/close/transitions";
import { CLOSE_BADGE, loadCloseRunShell } from "../run-shell";
import { ReasonCloseAction } from "../close-actions";

export const metadata: Metadata = { title: "Close run" };

interface StepState {
  key: string;
  title: string;
  role: string;
  href: string;
  state: "done" | "current" | "pending" | "blocked";
  detail: string;
}

/**
 * Wizard hub — every step state is derived from SERVER data (run row,
 * persisted readiness snapshot, package/export presence). Nothing is
 * marked complete from UI state.
 */
export default async function CloseRunPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close run" />;
  const { run, period, organizationName, can, actor } = shell;

  const [{ data: pkg }, { data: exportsRows }, { data: events }] = await Promise.all([
    run.report_package_id
      ? actor.supabase
          .from("report_packages")
          .select("id, status, version, package_type")
          .eq("id", run.report_package_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    actor.supabase
      .from("close_exports")
      .select("export_type")
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("organization_id", run.organization_id)
      .eq("superseded", false),
    actor.supabase
      .from("period_close_events")
      .select("from_status, to_status, reason, created_at, profiles:actor_id ( full_name, email )")
      .eq("period_close_run_id", run.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const exportTypes = new Set((exportsRows ?? []).map((e) => e.export_type));
  const snapshot = run.readiness_snapshot as {
    evaluated_at?: string;
    blocking_open?: number;
    warnings_open?: number;
  };
  const evaluated = Boolean(snapshot?.evaluated_at);
  const blockingClear = evaluated && run.blocking_issue_count === 0;
  const warningsClear = evaluated && (snapshot?.warnings_open ?? 1) === 0;
  const packageReady = pkg !== null && ["ready", "finalized"].includes(pkg?.status ?? "");
  const requiredExportsPresent =
    exportTypes.has("payroll_register_csv") && exportTypes.has("executive_summary_csv");
  const isClosed = run.status === "closed";
  const isTerminal = ["superseded", "voided"].includes(run.status);

  const steps: StepState[] = [
    {
      key: "readiness",
      title: "Evaluate readiness & resolve blockers",
      role: "Close reviewer (period_close:review)",
      href: `/performance-operations/period-close/${run.id}/readiness`,
      state: isClosed || blockingClear ? "done" : evaluated ? "blocked" : "current",
      detail: !evaluated
        ? "Not evaluated yet."
        : `${run.blocking_issue_count} blocking issue(s) open · evaluated ${snapshot.evaluated_at?.slice(0, 16).replace("T", " ")}.`,
    },
    {
      key: "warnings",
      title: "Acknowledge warnings",
      role: "Close reviewer (period_close:review)",
      href: `/performance-operations/period-close/${run.id}/readiness`,
      state: isClosed || warningsClear ? "done" : evaluated ? "current" : "pending",
      detail: evaluated
        ? `${snapshot.warnings_open ?? 0} warning(s) unacknowledged.`
        : "Evaluate readiness first.",
    },
    {
      key: "reports",
      title: "Generate report packages",
      role: "Package generator (report_package:create)",
      href: `/performance-operations/period-close/${run.id}/reports`,
      state: isClosed || packageReady ? "done" : "current",
      detail: pkg
        ? `Executive package v${pkg.version} is ${pkg.status}.`
        : "Executive package not generated.",
    },
    {
      key: "exports",
      title: "Generate required exports",
      role: "Exporter (period_close:export)",
      href: `/performance-operations/period-close/${run.id}/exports`,
      state: isClosed || requiredExportsPresent ? "done" : "current",
      detail: `${exportTypes.size} export type(s) present · payroll register ${exportTypes.has("payroll_register_csv") ? "✓" : "✗"} · executive summary ${exportTypes.has("executive_summary_csv") ? "✓" : "✗"}.`,
    },
    {
      key: "approval",
      title: "Complete review, approve, and execute",
      role: "Reviewer → Approver → Executor (separated per policy)",
      href: `/performance-operations/period-close/${run.id}/approval`,
      state: isClosed
        ? "done"
        : run.status === "ready_to_close"
          ? "current"
          : "pending",
      detail: isClosed
        ? `Closed ${run.closed_at?.slice(0, 16).replace("T", " ")}.`
        : run.status === "ready_to_close"
          ? run.approved_by
            ? "Approved — awaiting execution."
            : "Review complete — awaiting approval."
          : "Complete readiness first.",
    },
    {
      key: "manifest",
      title: "Review the frozen manifest",
      role: "Anyone with period_close:read",
      href: `/performance-operations/period-close/${run.id}/manifest`,
      state: isClosed ? "current" : "pending",
      detail: isClosed
        ? `Manifest ${run.manifest_sha256?.slice(0, 16)}… frozen.`
        : "Available after the close executes.",
    },
  ];

  const stepBadge: Record<StepState["state"], string> = {
    done: "active",
    current: "open",
    pending: "draft",
    blocked: "locked",
  };

  interface EventRow {
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
    profiles: { full_name: string | null; email: string } | null;
  }
  const eventRows = (events ?? []) as unknown as EventRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Close: ${period?.label ?? "?"} · v${run.close_version}`}
        description={`${organizationName} · ${period?.start_date ?? ""} – ${period?.end_date ?? ""}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={CLOSE_BADGE[run.status] ?? "draft"} />
            <span className="text-sm text-ink-secondary" data-testid="close-status">
              {CLOSE_STATUS_LABEL[run.status as CloseStatus] ?? run.status}
            </span>
          </div>
        }
      />

      {run.supersedes_close_run_id && (
        <p className="text-sm text-ink-secondary">
          Re-close cycle — supersedes{" "}
          <Link href={`/performance-operations/period-close/${run.supersedes_close_run_id}`} className="font-medium text-accent">
            close v{run.close_version - 1}
          </Link>
          {run.reopen_reason ? ` (reopened: ${run.reopen_reason})` : ""}
        </p>
      )}
      {run.superseded_by_close_run_id && (
        <p className="text-sm text-warning">
          This close was superseded by{" "}
          <Link href={`/performance-operations/period-close/${run.superseded_by_close_run_id}`} className="font-medium text-accent">
            a newer close cycle
          </Link>
          . Its manifest and artifacts remain frozen for history.
        </p>
      )}

      <ol className="space-y-2" data-testid="close-steps">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex items-start justify-between gap-3 rounded-[--radius-card] border border-border bg-surface px-4 py-3 shadow-sm"
            data-step={step.key}
            data-state={step.state}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                <span className="mr-2 font-mono text-xs text-ink-muted">{index + 1}.</span>
                <Link href={step.href} className="hover:text-accent">
                  {step.title}
                </Link>
              </p>
              <p className="mt-0.5 text-xs text-ink-secondary">{step.detail}</p>
              <p className="text-[11px] text-ink-muted">{step.role}</p>
            </div>
            <StatusBadge status={stepBadge[step.state]} />
          </li>
        ))}
      </ol>

      {!isTerminal && (
        <div className="flex flex-wrap gap-3">
          {isClosed && can("period_close:reopen") && (
            <ReasonCloseAction
              action="reopen"
              runId={run.id}
              label="Reopen period"
              confirmLabel="Confirm reopen"
              pendingLabel="Reopening…"
              prompt="Reopen reason (recorded permanently; prior close stays frozen and becomes superseded)"
              destructive
            />
          )}
          {!isClosed && can("period_close:review") && (
            <ReasonCloseAction
              action="void"
              runId={run.id}
              label="Void close run"
              confirmLabel="Confirm void"
              pendingLabel="Voiding…"
              prompt="Void reason (recorded permanently)"
              destructive
            />
          )}
        </div>
      )}

      <Widget title="Close history" testId="close-history">
        <ul className="space-y-1.5">
          {eventRows.map((e, i) => (
            <li key={i} className="text-sm text-ink-secondary">
              <span className="font-mono text-xs text-ink-muted">
                {e.created_at.slice(0, 16).replace("T", " ")}
              </span>{" "}
              {e.from_status ? `${e.from_status} → ` : ""}
              <span className="font-medium text-ink">{e.to_status}</span>
              {" · "}
              {e.profiles?.full_name || e.profiles?.email || "system"}
              {e.reason ? <span className="text-ink-muted"> — {e.reason}</span> : null}
            </li>
          ))}
        </ul>
      </Widget>
    </div>
  );
}
