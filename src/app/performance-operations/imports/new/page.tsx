import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload import" };

export default async function NewImportPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Upload import" />;

  const uploadableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "import:upload")
  );
  if (uploadableOrgs.length === 0) return <PermissionDenied title="Upload import" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload import"
        description="Nothing is saved until you review and approve the file."
      />
      <UploadForm
        organizations={uploadableOrgs}
        defaultOrganizationId={
          context.selection.kind === "organization"
            ? context.selection.organizationId
            : undefined
        }
      />
    </div>
  );
}
