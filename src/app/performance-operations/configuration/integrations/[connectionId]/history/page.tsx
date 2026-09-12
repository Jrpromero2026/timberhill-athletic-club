import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Connection history" };

export default async function ConnectionHistoryPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="History" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="History" />;
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, name, organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (
    !connection ||
    !hasPermissionInOrganization(context.memberships, connection.organization_id, "integration:read")
  ) {
    return <PermissionDenied title="History" />;
  }

  const { data: runs } = await actor.supabase
    .from("integration_sync_runs")
    .select("*")
    .eq("connection_id", connectionId)
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sync history: ${connection.name}`}
        description="Every run with its cursor movement, page/record statistics, and resulting import batch."
        actions={
          <Link
            href={`/performance-operations/configuration/integrations/${connectionId}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Connection
          </Link>
        }
      />
      {(runs ?? []).length === 0 ? (
        <EmptyState title="No sync runs yet" description="Run a sync from the connection page." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-sm" data-testid="sync-run-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Pages</th>
                <th className="px-4 py-2 font-medium">Fetched</th>
                <th className="px-4 py-2 font-medium">Accepted</th>
                <th className="px-4 py-2 font-medium">Unchanged</th>
                <th className="px-4 py-2 font-medium">Batch</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0" data-run-status={run.status}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/performance-operations/integrations/runs/${run.id}`} className="text-accent hover:text-accent-strong">
                      {run.started_at.slice(0, 16).replace("T", " ")}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">{run.trigger_source}</td>
                  <td className="px-4 py-2 text-xs font-semibold">
                    <span className={run.status === "succeeded" ? "text-positive" : run.status === "failed" ? "text-negative" : "text-ink"}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{run.pages_fetched}</td>
                  <td className="px-4 py-2 font-mono text-xs">{run.records_fetched}</td>
                  <td className="px-4 py-2 font-mono text-xs">{run.records_accepted}</td>
                  <td className="px-4 py-2 font-mono text-xs">{run.records_unchanged}</td>
                  <td className="px-4 py-2 text-xs">
                    {run.import_batch_id ? (
                      <Link href={`/performance-operations/imports/${run.import_batch_id}`} className="font-medium text-accent">
                        open batch
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-muted">
                    {run.failure_code ?? ""}
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
