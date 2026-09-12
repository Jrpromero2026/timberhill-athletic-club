import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { deriveIntegrationAlerts, maskEmail } from "@/lib/integrations/alerts";

export const metadata: Metadata = { title: "Automation" };

/**
 * Integration & automation operations dashboard: connection health, sync
 * activity, job queue state, delivery state — pipeline STATES only, no
 * business metrics. Every alert deep-links to its subject.
 */
export default async function IntegrationsDashboardPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Automation" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "integration:read")) {
    return <PermissionDenied title="Automation" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Automation" />;

  const [
    { data: connections },
    { data: runs },
    { data: jobs },
    { data: deliveries },
    { data: reviewBatches },
    { data: scheduledRuns },
  ] = await Promise.all([
    actor.supabase
      .from("integration_connections")
      .select("id, name, status, last_health_status, last_health_check_at, provider_key")
      .eq("organization_id", organizationId),
    actor.supabase
      .from("integration_sync_runs")
      .select("id, status, failure_code, started_at, records_accepted, import_batch_id, connection_id")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(15),
    actor.supabase
      .from("background_jobs")
      .select("id, job_type, status, attempt_count, available_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    actor.supabase
      .from("email_delivery_events")
      .select("id, status, recipient_email, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(25),
    actor.supabase
      .from("import_batches")
      .select("id, original_filename, status")
      .eq("organization_id", organizationId)
      .eq("created_via", "integration")
      .in("status", ["needs_review", "ready_for_approval"])
      .limit(10),
    actor.supabase
      .from("scheduled_report_runs")
      .select("id, status, intended_run_at, trigger_source, is_final")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const connectionName = new Map((connections ?? []).map((c) => [c.id, c.name]));
  const alerts = deriveIntegrationAlerts({
    connections: (connections ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      lastHealthStatus: c.last_health_status,
    })),
    recentRuns: (runs ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      failureCode: r.failure_code,
      connectionName: connectionName.get(r.connection_id) ?? "connection",
    })),
    jobs: (jobs ?? []).map((j) => ({
      id: j.id,
      status: j.status,
      jobType: j.job_type,
      attemptCount: j.attempt_count,
    })),
    deliveries: (deliveries ?? []).map((d) => ({
      id: d.id,
      status: d.status,
      recipientMasked: maskEmail(d.recipient_email),
    })),
    batchesAwaitingReview: (reviewBatches ?? []).map((b) => ({
      id: b.id,
      filename: b.original_filename,
    })),
  });

  const queueDepth = (jobs ?? []).filter((j) =>
    ["queued", "retryable_failed"].includes(j.status),
  ).length;
  const oldestQueued = (jobs ?? [])
    .filter((j) => ["queued", "retryable_failed"].includes(j.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const deadLetterCount = (jobs ?? []).filter((j) => j.status === "dead_lettered").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
        description={`${context.selected?.name ?? ""} · integration and background-job operations. Synced data always flows through the import review workflow.`}
        actions={
          <div className="flex gap-2 text-sm">
            <Link href="/performance-operations/integrations/jobs" className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 leading-9 text-ink hover:bg-surface-sunken">
              Job queue
            </Link>
            <Link href="/performance-operations/integrations/deliveries" className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 leading-9 text-ink hover:bg-surface-sunken">
              Deliveries
            </Link>
            <Link href="/performance-operations/configuration/integrations" className="h-9 rounded-[--radius-control] bg-accent px-3.5 leading-9 font-semibold text-white hover:bg-accent-strong">
              Configure
            </Link>
          </div>
        }
      />

      <Widget title={`Alerts (${alerts.length})`} testId="integration-alerts">
        {alerts.length === 0 ? (
          <WidgetEmpty reason="No integration or automation alerts." />
        ) : (
          <ul className="space-y-1.5">
            {alerts.slice(0, 12).map((alert) => (
              <li key={alert.id} className="flex items-start gap-2 text-sm" data-alert-code={alert.code}>
                <span
                  className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    alert.severity === "critical"
                      ? "bg-negative"
                      : alert.severity === "warning"
                        ? "bg-warning"
                        : "bg-info"
                  }`}
                />
                <span className="min-w-0">
                  <Link href={alert.link} className="font-medium text-ink hover:text-accent">
                    {alert.title}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">{alert.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Widget title="Connection health" testId="connection-health">
          {(connections ?? []).length === 0 ? (
            <WidgetEmpty reason="No connections configured." />
          ) : (
            <ul className="divide-y divide-border">
              {(connections ?? []).map((connection) => (
                <li key={connection.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <Link
                      href={`/performance-operations/configuration/integrations/${connection.id}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {connection.name}
                    </Link>
                    <span className="ml-2 text-xs text-ink-muted">
                      {connection.last_health_check_at
                        ? `checked ${connection.last_health_check_at.slice(0, 16).replace("T", " ")}`
                        : "never checked"}
                    </span>
                  </span>
                  <StatusBadge
                    status={
                      connection.status === "active"
                        ? "active"
                        : ["failed", "degraded"].includes(connection.status)
                          ? "locked"
                          : "draft"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Job queue" testId="job-queue-summary">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Queued", queueDepth],
              ["Dead-letter", deadLetterCount],
              [
                "Oldest queued",
                oldestQueued ? oldestQueued.created_at.slice(11, 16) + " UTC" : "—",
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-border px-2 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Widget>

        <Widget title="Recent sync runs" testId="recent-sync-runs">
          {(runs ?? []).length === 0 ? (
            <WidgetEmpty reason="No sync runs yet." />
          ) : (
            <ul className="divide-y divide-border">
              {(runs ?? []).slice(0, 8).map((run) => (
                <li key={run.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                  <span>
                    <Link href={`/performance-operations/integrations/runs/${run.id}`} className="font-medium text-ink hover:text-accent">
                      {connectionName.get(run.connection_id) ?? "connection"}
                    </Link>
                    <span className="ml-2 text-xs text-ink-muted">
                      {run.started_at.slice(0, 16).replace("T", " ")} · {run.records_accepted} accepted
                    </span>
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      run.status === "succeeded"
                        ? "text-positive"
                        : run.status === "failed"
                          ? "text-negative"
                          : "text-ink"
                    }`}
                  >
                    {run.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Scheduled report runs" testId="scheduled-run-summary">
          {(scheduledRuns ?? []).length === 0 ? (
            <WidgetEmpty reason="No scheduled report executions yet." />
          ) : (
            <ul className="divide-y divide-border">
              {(scheduledRuns ?? []).map((run) => (
                <li key={run.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                  <span className="text-xs text-ink-secondary">
                    {run.intended_run_at.slice(0, 16).replace("T", " ")} · {run.trigger_source}
                    {run.is_final ? " · FINAL" : " · not final"}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      run.status === "succeeded"
                        ? "text-positive"
                        : run.status === "failed"
                          ? "text-negative"
                          : "text-ink"
                    }`}
                  >
                    {run.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
}
