import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { loadCloseRunShell } from "../../run-shell";
import {
  ExecuteCloseButton,
  ReasonCloseAction,
  SimpleCloseAction,
} from "../../close-actions";

export const metadata: Metadata = { title: "Close approval" };

export default async function CloseApprovalPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close approval" />;
  const { run, period, can, actor } = shell;

  const [{ data: policy }, { data: profiles }] = await Promise.all([
    actor.supabase
      .from("organization_close_policies")
      .select("allow_self_approval, payroll_required_state")
      .eq("organization_id", run.organization_id)
      .maybeSingle(),
    actor.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        [run.initiated_by, run.reviewed_by, run.approved_by, run.closed_by].filter(
          (id): id is string => id !== null,
        ),
      ),
  ]);
  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const profile = profiles?.find((p) => p.id === id);
    return profile?.full_name || profile?.email || id;
  };
  const allowSelf = policy?.allow_self_approval ?? false;

  const requirements = [
    {
      label: "Readiness evaluated with zero open blocking issues",
      ok: run.blocking_issue_count === 0 && Boolean((run.readiness_snapshot as { evaluated_at?: string })?.evaluated_at),
      detail: `${run.blocking_issue_count} blocking open`,
    },
    {
      label: "All warnings acknowledged",
      ok: ((run.readiness_snapshot as { warnings_open?: number })?.warnings_open ?? 1) === 0,
      detail: `${(run.readiness_snapshot as { warnings_open?: number })?.warnings_open ?? "?"} unacknowledged`,
    },
    {
      label: "Review completed",
      ok: run.status !== "close_review",
      detail: run.reviewed_by ? `by ${nameOf(run.reviewed_by)}` : "not completed",
    },
    {
      label: `Approved${allowSelf ? "" : " (by someone other than the preparer — policy)"}`,
      ok: Boolean(run.approved_by),
      detail: run.approved_by ? `by ${nameOf(run.approved_by)}` : "not approved",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Approval: ${period?.label ?? "?"} · close v${run.close_version}`}
        description={`Payroll policy: ${policy?.payroll_required_state ?? "posted"} required · self-approval ${allowSelf ? "allowed by organization policy" : "FORBIDDEN (fails closed)"}`}
        actions={
          <Link
            href={`/performance-operations/period-close/${run.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Close run
          </Link>
        }
      />

      <Widget title="Requirements" testId="approval-requirements">
        <ul className="space-y-2">
          {requirements.map((req) => (
            <li key={req.label} className="flex items-start gap-2 text-sm">
              <span className={req.ok ? "text-positive" : "text-negative"}>
                {req.ok ? "✓" : "✗"}
              </span>
              <span className="text-ink">
                {req.label}
                <span className="ml-2 text-xs text-ink-muted">{req.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Widget>

      <Widget title="Actors" testId="approval-actors">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            ["Prepared by", nameOf(run.initiated_by), run.initiated_at],
            ["Reviewed by", nameOf(run.reviewed_by), run.reviewed_at],
            ["Approved by", nameOf(run.approved_by), run.approved_at],
            ["Closed by", nameOf(run.closed_by), run.closed_at],
          ].map(([label, name, at]) => (
            <div key={label as string} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right text-ink">
                {name}
                {at && (
                  <span className="ml-1 font-mono text-[11px] text-ink-muted">
                    {(at as string).slice(0, 16).replace("T", " ")}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Widget>

      {["close_review", "ready_to_close"].includes(run.status) ? (
        <div className="space-y-3" data-testid="approval-actions">
          {run.status === "close_review" && can("period_close:review") && (
            <SimpleCloseAction
              action="complete_review"
              runId={run.id}
              label="Complete review"
              pendingLabel="Verifying…"
              tone="positive"
            />
          )}
          {run.status === "ready_to_close" && !run.approved_by && can("period_close:approve") && (
            <SimpleCloseAction
              action="approve"
              runId={run.id}
              label="Approve close"
              pendingLabel="Approving…"
              tone="positive"
            />
          )}
          {run.status === "ready_to_close" && run.approved_by && can("period_close:approve") && (
            <ReasonCloseAction
              action="revoke_approval"
              runId={run.id}
              label="Revoke approval"
              confirmLabel="Confirm revoke"
              pendingLabel="Revoking…"
              prompt="Why is the approval being revoked?"
            />
          )}
          {run.status === "ready_to_close" && run.approved_by && can("period_close:execute") && (
            <ExecuteCloseButton runId={run.id} />
          )}
        </div>
      ) : run.status === "closed" ? (
        <Widget>
          <p className="text-sm text-positive">
            Closed {run.closed_at?.slice(0, 16).replace("T", " ")} · manifest{" "}
            <Link href={`/performance-operations/period-close/${run.id}/manifest`} className="font-medium text-accent">
              {run.manifest_sha256?.slice(0, 16)}…
            </Link>
          </p>
        </Widget>
      ) : (
        <Widget>
          <WidgetEmpty reason={`This close run is ${run.status}.`} />
        </Widget>
      )}
    </div>
  );
}
