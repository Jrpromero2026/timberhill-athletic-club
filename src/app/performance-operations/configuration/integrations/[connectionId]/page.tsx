import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getProviderAdapter } from "@/lib/integrations/registry";
import {
  CredentialForm,
  IntegrationAction,
  NewSyncDefinitionForm,
  ReasonAction,
} from "../integration-actions";

export const metadata: Metadata = { title: "Integration connection" };

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

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Connection" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Connection" />;

  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return <PermissionDenied title="Connection" />;
  const organizationId = connection.organization_id;
  const can = (permission: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, organizationId, permission);
  if (!can("integration:read")) return <PermissionDenied title="Connection" />;

  const adapter = getProviderAdapter(connection.provider_key);
  const capabilities = adapter?.getCapabilities();

  const [{ data: definitions }, { data: cursors }] = await Promise.all([
    actor.supabase
      .from("integration_sync_definitions")
      .select("*")
      .eq("connection_id", connectionId)
      .order("created_at"),
    actor.supabase
      .from("integration_cursors")
      .select("*")
      .eq("connection_id", connectionId),
  ]);
  const cursorByDefinition = new Map((cursors ?? []).map((c) => [c.definition_id, c]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={connection.name}
        description={`${adapter?.displayName ?? connection.provider_key} · created ${connection.created_at.slice(0, 10)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={CONN_BADGE[connection.status] ?? "draft"} />
            <span className="text-sm text-ink-secondary" data-testid="connection-status">
              {connection.status.replaceAll("_", " ")}
            </span>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["History", `/performance-operations/configuration/integrations/${connectionId}/history`],
          ["Health", `/performance-operations/configuration/integrations/${connectionId}/health`],
          ["Mapping", `/performance-operations/configuration/integrations/${connectionId}/mapping`],
          ["Operations dashboard", "/performance-operations/integrations"],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href!}
            className="h-8 rounded-[--radius-control] border border-border bg-surface px-3 leading-8 text-ink hover:bg-surface-sunken"
          >
            {label}
          </Link>
        ))}
      </div>

      {adapter?.status === "blocked" && (
        <Widget title="Provider blocked — setup checklist" testId="blocked-checklist">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-secondary">
            {adapter.setupChecklist.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-warning">
            This connection cannot activate or sync until the checklist is
            complete and the adapter is implemented against verified data.
          </p>
          {connection.provider_key === "setmore_api" &&
            can("integration:manage_credentials") && (
              <p className="mt-3 text-xs text-ink-secondary">
                Credentials issued? The{" "}
                <Link
                  href={`/performance-operations/configuration/integrations/${connectionId}/verify`}
                  className="font-medium text-accent hover:underline"
                >
                  verification probe
                </Link>{" "}
                establishes what the live account actually returns — the evidence this
                checklist requires before the gate can be lifted.
              </p>
            )}
        </Widget>
      )}

      {can("integration:manage_credentials") && (
        <Widget title="Credentials" testId="connection-credentials">
          <p className="mb-2 text-xs text-ink-secondary">
            {connection.secret_fingerprint
              ? `Stored: ${connection.secret_fingerprint} (version ${connection.secret_version}, rotated ${connection.secret_rotated_at?.slice(0, 16).replace("T", " ") ?? "—"}). Submitting again rotates it.`
              : "No credential stored. Secrets go directly to Supabase Vault and are never displayed after submission."}
          </p>
          {connection.status !== "revoked" || true ? (
            <CredentialForm connectionId={connectionId} />
          ) : null}
          {connection.secret_ref && (
            <div className="mt-3">
              <ReasonAction
                action="revoke"
                label="Revoke credentials"
                confirmLabel="Confirm revoke"
                prompt="Why are the credentials being revoked?"
                fields={{ connection_id: connectionId }}
                testId="revoke-credentials"
              />
            </div>
          )}
        </Widget>
      )}

      {can("integration:update") && (
        <Widget title="Lifecycle" testId="connection-lifecycle">
          <div className="flex flex-wrap items-center gap-2">
            <IntegrationAction
              action="validate"
              label="Validate connection"
              pendingLabel="Validating…"
              fields={{ connection_id: connectionId }}
              primary
              testId="validate-connection"
            />
            {can("integration:disable") && connection.status !== "disabled" && (
              <IntegrationAction
                action="set_enabled"
                label="Disable"
                pendingLabel="Disabling…"
                fields={{ connection_id: connectionId, enable: "false" }}
                testId="disable-connection"
              />
            )}
            {can("integration:disable") && connection.status === "disabled" && (
              <IntegrationAction
                action="set_enabled"
                label="Re-enable (re-validation required)"
                pendingLabel="Enabling…"
                fields={{ connection_id: connectionId, enable: "true" }}
                testId="enable-connection"
              />
            )}
          </div>
          {connection.failure_reason && (
            <p className="mt-2 text-xs text-negative">Last failure: {connection.failure_reason}</p>
          )}
        </Widget>
      )}

      <Widget title="Capability matrix" testId="capability-matrix">
        {capabilities ? (
          <dl className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
            {Object.entries({
              "Appointments by date": capabilities.appointmentsByDate,
              "Incremental sync": capabilities.incrementalSync,
              "Cursor pagination": capabilities.cursorPagination,
              Staff: capabilities.staff,
              Services: capabilities.services,
              Clients: capabilities.clients,
              Webhooks: capabilities.webhooks,
            }).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className={value ? "text-positive" : "text-ink-muted"}>{value ? "✓" : "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <WidgetEmpty reason="Unknown provider." />
        )}
        {capabilities && capabilities.notes.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[11px] text-ink-muted">
            {capabilities.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget title="Sync definitions" testId="sync-definitions">
        {(definitions ?? []).length === 0 ? (
          <WidgetEmpty reason="No sync definitions yet." />
        ) : (
          <ul className="divide-y divide-border">
            {(definitions ?? []).map((definition) => {
              const cursor = cursorByDefinition.get(definition.id);
              return (
                <li key={definition.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {definition.data_type} · {definition.mode} ·{" "}
                        {definition.window_strategy === "fixed_range"
                          ? `${definition.window_start} → ${definition.window_end}`
                          : `trailing ${definition.window_days}d`}{" "}
                        · {definition.frequency}
                        {!definition.active && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-warning">paused</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Cursor: {cursor?.cursor_value ?? "— (from start)"} · last success:{" "}
                        {definition.last_successful_run_at?.slice(0, 16).replace("T", " ") ?? "never"} ·
                        auto-approve OFF · auto-post OFF
                      </p>
                    </div>
                    {can("integration:sync") && (
                      <div className="flex flex-wrap items-center gap-2">
                        <IntegrationAction
                          action="run_sync"
                          label="Run sync now"
                          pendingLabel="Syncing…"
                          fields={{ definition_id: definition.id }}
                          primary
                          testId="run-sync-now"
                        />
                        {can("integration:update") && (
                          <IntegrationAction
                            action="toggle_definition"
                            label={definition.active ? "Pause" : "Resume"}
                            pendingLabel="Saving…"
                            fields={{
                              definition_id: definition.id,
                              active: String(definition.active),
                            }}
                            testId="toggle-sync"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {can("integration:reset_cursor") && cursor?.cursor_value && (
                    <ReasonAction
                      action="reset_cursor"
                      label="Reset cursor"
                      confirmLabel="Confirm reset"
                      prompt="Reason (recorded permanently; min 10 chars)"
                      impactNote={`Impact: the next sync re-fetches the whole window from the provider instead of resuming at cursor "${cursor.cursor_value}". Already-stored records deduplicate by content hash, so no duplicates post — but the run will re-read every page.`}
                      fields={{ definition_id: definition.id }}
                      testId="reset-cursor"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {can("integration:update") && (
          <div className="mt-4 border-t border-border pt-4">
            <NewSyncDefinitionForm connectionId={connectionId} />
          </div>
        )}
      </Widget>
    </div>
  );
}
