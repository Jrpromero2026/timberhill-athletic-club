import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Connection health" };

export default async function ConnectionHealthPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Health" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Health" />;
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (
    !connection ||
    !hasPermissionInOrganization(context.memberships, connection.organization_id, "integration:read")
  ) {
    return <PermissionDenied title="Health" />;
  }
  const canViewFailures = hasPermissionInOrganization(
    context.memberships,
    connection.organization_id,
    "integration:view_failures",
  );

  const { data: failures } = canViewFailures
    ? await actor.supabase
        .from("integration_failures")
        .select("*")
        .eq("connection_id", connectionId)
        .order("last_seen_at", { ascending: false })
        .limit(30)
    : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Health: ${connection.name}`}
        description={`Status ${connection.status} · last check ${connection.last_health_check_at?.slice(0, 16).replace("T", " ") ?? "never"} · ${connection.last_health_status ?? "no result"}`}
        actions={
          <Link
            href={`/performance-operations/configuration/integrations/${connectionId}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Connection
          </Link>
        }
      />
      <Widget title="Failure log" testId="connection-failures">
        {!canViewFailures ? (
          <WidgetEmpty reason="Requires integration:view_failures." />
        ) : (failures ?? []).length === 0 ? (
          <WidgetEmpty reason="No failures on record." />
        ) : (
          <ul className="divide-y divide-border">
            {(failures ?? []).map((failure) => (
              <li key={failure.id} className="py-2.5 first:pt-0 last:pb-0" data-failure-code={failure.failure_code}>
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="font-mono text-xs">{failure.failure_code}</span>
                  {failure.resolved ? (
                    <span className="text-[10px] font-bold uppercase text-positive">resolved</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-negative">open</span>
                  )}
                  {failure.retryable && (
                    <span className="text-[10px] uppercase text-ink-muted">retryable</span>
                  )}
                </p>
                <p className="text-xs text-ink-secondary">{failure.message}</p>
                <p className="text-[11px] text-ink-muted">
                  → {failure.recommended_action} · seen ×{failure.attempt_count} · last{" "}
                  {failure.last_seen_at.slice(0, 16).replace("T", " ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </div>
  );
}
