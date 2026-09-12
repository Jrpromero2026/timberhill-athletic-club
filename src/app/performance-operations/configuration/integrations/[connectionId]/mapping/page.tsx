import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Widget } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getProviderAdapter } from "@/lib/integrations/registry";

export const metadata: Metadata = { title: "Connection mapping" };

/**
 * Field mapping is FIXED per adapter version (provider fields → the
 * import staging model); trainer/service/client identity mapping happens
 * in the existing import review workflow (aliases learned there apply to
 * integration batches identically).
 */
export default async function ConnectionMappingPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Mapping" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Mapping" />;
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, name, provider_key, organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (
    !connection ||
    !hasPermissionInOrganization(context.memberships, connection.organization_id, "integration:read")
  ) {
    return <PermissionDenied title="Mapping" />;
  }
  const adapter = getProviderAdapter(connection.provider_key);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Mapping: ${connection.name}`}
        description="Adapter field mapping is versioned in code; identity matching (trainers, services, clients) uses the existing import review workflow and its learned aliases."
        actions={
          <Link
            href={`/performance-operations/configuration/integrations/${connectionId}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Connection
          </Link>
        }
      />
      <Widget title={`Adapter ${adapter?.adapterVersion ?? "unknown"}`} testId="mapping-info">
        {adapter?.status === "blocked" ? (
          <p className="text-sm text-warning">
            This provider is blocked — its field mapping will be defined against
            VERIFIED payloads once the setup checklist completes. No mapping is
            invented in advance.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink-secondary">
              Evidence CSV columns produced by this adapter (staged through the
              standard import pipeline):
            </p>
            <p className="font-mono text-xs text-ink">
              {adapter?.evidenceColumns.join(" · ")}
            </p>
          </>
        )}
      </Widget>
    </div>
  );
}
