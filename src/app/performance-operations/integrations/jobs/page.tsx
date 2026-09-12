import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { IntegrationAction, ReasonAction } from "../../configuration/integrations/integration-actions";

export const metadata: Metadata = { title: "Background jobs" };

export default async function JobQueuePage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Background jobs" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "job:read")) {
    return <PermissionDenied title="Background jobs" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Background jobs" />;
  const can = (permission: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, organizationId, permission);

  const { data: jobs } = await actor.supabase
    .from("background_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(60);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Background jobs"
        description="Atomic claiming, lease recovery, exponential backoff, dead-letter. All manual actions are audited."
        actions={
          <Link
            href="/performance-operations/integrations"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Automation
          </Link>
        }
      />
      {(jobs ?? []).length === 0 ? (
        <EmptyState title="No jobs yet" description="Jobs appear when syncs, schedules, or deliveries run." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[980px] text-sm" data-testid="job-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Next available</th>
                <th className="px-4 py-2 font-medium">Last error</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((job) => (
                <tr key={job.id} className="border-b border-border align-top last:border-0" data-job-status={job.status} data-job-type={job.job_type}>
                  <td className="px-4 py-2 font-mono text-xs">{job.created_at.slice(5, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2 text-xs">{job.job_type.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2 text-xs font-semibold">
                    <span
                      className={
                        job.status === "succeeded"
                          ? "text-positive"
                          : ["permanently_failed", "dead_lettered"].includes(job.status)
                            ? "text-negative"
                            : job.status === "retryable_failed"
                              ? "text-warning"
                              : "text-ink"
                      }
                    >
                      {job.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {job.attempt_count}/{job.max_attempts}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {["queued", "retryable_failed"].includes(job.status)
                      ? job.available_at.slice(11, 19)
                      : "—"}
                  </td>
                  <td className="max-w-64 px-4 py-2 text-xs text-ink-muted">
                    {job.last_error_code ? `${job.last_error_code}: ${job.last_error ?? ""}`.slice(0, 120) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {can("job:retry") &&
                        ["retryable_failed", "permanently_failed"].includes(job.status) && (
                          <IntegrationAction
                            action="retry_job"
                            label="Retry"
                            pendingLabel="…"
                            fields={{ job_id: job.id }}
                            testId="retry-job"
                          />
                        )}
                      {can("job:cancel") && ["queued", "retryable_failed"].includes(job.status) && (
                        <IntegrationAction
                          action="cancel_job"
                          label="Cancel"
                          pendingLabel="…"
                          fields={{ job_id: job.id, reason: "cancelled from job queue" }}
                        />
                      )}
                      {can("job:manage_dead_letter") && job.status === "permanently_failed" && (
                        <IntegrationAction
                          action="dead_letter_job"
                          label="Dead-letter"
                          pendingLabel="…"
                          fields={{ job_id: job.id, reason: "moved from job queue" }}
                          testId="dead-letter-job"
                        />
                      )}
                      {can("job:manage_dead_letter") && job.status === "dead_lettered" && (
                        <ReasonAction
                          action="requeue_dead_letter"
                          label="Requeue"
                          confirmLabel="Confirm requeue"
                          prompt="Why is this job being requeued?"
                          fields={{ job_id: job.id }}
                          testId="requeue-dead-letter"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
