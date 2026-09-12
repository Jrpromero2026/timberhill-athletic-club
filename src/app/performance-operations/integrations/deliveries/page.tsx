import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { maskEmail } from "@/lib/integrations/alerts";
import {
  DeliveryChannelForm,
  IntegrationAction,
} from "../../configuration/integrations/integration-actions";

export const metadata: Metadata = { title: "Report deliveries" };

export default async function DeliveriesPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Deliveries" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "report_delivery:read")) {
    return <PermissionDenied title="Deliveries" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Deliveries" />;
  const canManagePolicy = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "email_policy:manage",
  );
  const canRetry = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "report_delivery:retry",
  );

  const [{ data: channel }, { data: events }] = await Promise.all([
    actor.supabase
      .from("delivery_channels")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("channel_type", "email")
      .maybeSingle(),
    actor.supabase
      .from("email_delivery_events")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report deliveries"
        description={`Channel: ${channel ? `${channel.provider} (${channel.status})` : "not configured — deliveries fail closed"}. States are honest: without provider confirmation we never claim final delivery.`}
        actions={
          <Link
            href="/performance-operations/integrations"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Automation
          </Link>
        }
      />

      {canManagePolicy && (
        <Widget title="Delivery channel & policy" testId="delivery-channel">
          <DeliveryChannelForm
            organizationId={organizationId}
            current={
              channel
                ? {
                    provider: channel.provider,
                    senderAddress: channel.sender_address,
                    allowExternal: channel.allow_external_recipients,
                    allowStatements: channel.allow_trainer_statements,
                  }
                : null
            }
          />
        </Widget>
      )}

      <Widget title="Delivery events" testId="delivery-events">
        {(events ?? []).length === 0 ? (
          <WidgetEmpty reason="No delivery events yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Recipient</th>
                  <th className="px-3 py-2 font-medium">Template</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Provider msg</th>
                  <th className="px-3 py-2 font-medium">Error</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(events ?? []).map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-border last:border-0"
                    data-delivery-status={event.status}
                    data-delivery-id={event.id}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {event.created_at.slice(5, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-xs">{maskEmail(event.recipient_email)}</td>
                    <td className="px-3 py-2 text-xs">{event.template_key}</td>
                    <td className="px-3 py-2 text-xs font-semibold">
                      <span
                        className={
                          ["accepted", "delivered_to_provider", "delivered"].includes(event.status)
                            ? "text-positive"
                            : ["failed", "bounced", "rejected"].includes(event.status)
                              ? "text-negative"
                              : "text-ink"
                        }
                      >
                        {event.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">
                      {event.provider_message_id ?? "—"}
                    </td>
                    <td className="max-w-56 px-3 py-2 text-xs text-ink-muted">
                      {event.last_error ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {canRetry && ["failed", "bounced", "rejected", "deferred"].includes(event.status) && (
                        <IntegrationAction
                          action="retry_delivery"
                          label="Retry"
                          pendingLabel="…"
                          fields={{ event_id: event.id }}
                          testId="retry-delivery"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>
    </div>
  );
}
