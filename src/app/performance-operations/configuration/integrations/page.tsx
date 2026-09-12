import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { Widget } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { listProviderAdapters } from "@/lib/integrations/registry";

export const metadata: Metadata = { title: "Integrations" };

const CONN_BADGE: Record<string, string> = {
  draft: "draft",
  awaiting_credentials: "draft",
  validating: "open",
  active: "active",
  degraded: "locked",
  disabled: "inactive",
  revoked: "inactive",
  failed: "locked",
};

export default async function IntegrationsConfigPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Integrations" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "integration:read")) {
    return <PermissionDenied title="Integrations" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Integrations" />;
  const canCreate = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "integration:create",
  );

  const { data: connections } = await actor.supabase
    .from("integration_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const adapters = listProviderAdapters();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Provider connections feed the EXISTING import pipeline — synced data always goes through staging, review, and approval before posting."
        actions={
          canCreate ? (
            <Link
              href="/performance-operations/configuration/integrations/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              New connection
            </Link>
          ) : undefined
        }
      />

      <Widget title="Connections" testId="integration-connections">
        {(connections ?? []).length === 0 ? (
          <EmptyState
            title="No connections yet"
            description="Create a connection to a provider. Blocked providers show their setup checklist."
          />
        ) : (
          <ul className="divide-y divide-border">
            {(connections ?? []).map((connection) => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                data-connection-status={connection.status}
              >
                <div className="min-w-0">
                  <Link
                    href={`/performance-operations/configuration/integrations/${connection.id}`}
                    className="text-sm font-medium text-ink hover:text-accent"
                  >
                    {connection.name}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {connection.provider_key} ·{" "}
                    {connection.secret_fingerprint
                      ? `credential ${connection.secret_fingerprint} (v${connection.secret_version})`
                      : "no credential"}
                    {connection.last_health_status
                      ? ` · health: ${connection.last_health_status}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={CONN_BADGE[connection.status] ?? "draft"} />
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget title="Provider catalog" testId="provider-catalog">
        <ul className="space-y-3">
          {adapters.map((adapter) => (
            <li key={adapter.key} data-provider={adapter.key} data-provider-status={adapter.status}>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {adapter.displayName}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    adapter.status === "blocked"
                      ? "bg-negative-soft text-negative"
                      : "bg-positive-soft text-positive"
                  }`}
                >
                  {adapter.status}
                </span>
              </p>
              {adapter.status === "blocked" && (
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-secondary">
                  {adapter.blockedReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-muted">
          Manual CSV import remains the supported path for blocked providers.
        </p>
      </Widget>
    </div>
  );
}
