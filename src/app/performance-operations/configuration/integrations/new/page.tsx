import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { listProviderAdapters } from "@/lib/integrations/registry";
import { NewConnectionForm } from "../integration-actions";

export const metadata: Metadata = { title: "New integration connection" };

export default async function NewConnectionPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="New connection" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "integration:create")) {
    return <PermissionDenied title="New connection" />;
  }
  const providers = listProviderAdapters().map((adapter) => ({
    key: adapter.key,
    name: adapter.displayName,
    blocked: adapter.status === "blocked",
  }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="New integration connection"
        description={`${context.selected?.name ?? ""} · a connection starts as a draft; credentials and validation come next.`}
      />
      <NewConnectionForm organizationId={organizationId} providers={providers} />
    </div>
  );
}
