import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Widget } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { IntegrationAction } from "../../../configuration/integrations/integration-actions";

export const metadata: Metadata = { title: "Sync run" };

export default async function SyncRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Sync run" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Sync run" />;

  const { data: run } = await actor.supabase
    .from("integration_sync_runs")
    .select("*, integration_connections ( id, name, provider_key )")
    .eq("id", runId)
    .maybeSingle();
  if (
    !run ||
    !hasPermissionInOrganization(context.memberships, run.organization_id, "integration:read")
  ) {
    return <PermissionDenied title="Sync run" />;
  }
  const connection = run.integration_connections as unknown as {
    id: string;
    name: string;
    provider_key: string;
  } | null;

  const rows: [string, string][] = [
    ["Status", run.status],
    ["Trigger", run.trigger_source],
    ["Started", run.started_at.slice(0, 19).replace("T", " ")],
    ["Completed", run.completed_at?.slice(0, 19).replace("T", " ") ?? "—"],
    ["Requested window", JSON.stringify(run.requested_window)],
    ["Cursor before", run.cursor_before ?? "— (start)"],
    ["Cursor after", run.cursor_after ?? "—"],
    ["Pages fetched", String(run.pages_fetched)],
    ["Records fetched", String(run.records_fetched)],
    ["Records accepted (new evidence)", String(run.records_accepted)],
    ["Records unchanged (idempotent)", String(run.records_unchanged)],
    ["Records rejected", String(run.records_rejected)],
    ["Rate-limit state", JSON.stringify(run.rate_limit_state)],
    ["Failure", run.failure_code ? `${run.failure_code}: ${run.failure_message ?? ""}` : "—"],
    ["Correlation id", run.correlation_id],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sync run · ${connection?.name ?? "connection"}`}
        description={`${connection?.provider_key ?? ""} · ${run.started_at.slice(0, 16).replace("T", " ")}`}
        actions={
          <Link
            href="/performance-operations/integrations"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Automation
          </Link>
        }
      />
      <Widget title="Run detail" testId="sync-run-detail">
        <dl className="space-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="break-all text-right font-mono text-xs text-ink" data-run-field={label}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Widget>
      {run.import_batch_id && (
        <Widget title="Resulting import batch" testId="sync-run-batch">
          <p className="text-sm text-ink-secondary">
            Records were staged into{" "}
            <Link
              href={`/performance-operations/imports/${run.import_batch_id}`}
              className="font-medium text-accent hover:text-accent-strong"
              data-testid="open-sync-batch"
            >
              the import batch
            </Link>{" "}
            — the standard review, approval, and posting workflow applies
            (integrations never post to the ledger directly).
          </p>
          {hasPermissionInOrganization(
            context.memberships,
            run.organization_id,
            "import:manage",
          ) && (
            <div className="mt-3">
              <IntegrationAction
                action="discard_batch"
                label="Discard staged batch (evidence preserved)"
                pendingLabel="Discarding…"
                fields={{ batch_id: run.import_batch_id }}
                testId="discard-batch"
              />
            </div>
          )}
        </Widget>
      )}
    </div>
  );
}
