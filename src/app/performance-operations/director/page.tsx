import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { DirectorChat } from "@/components/director/director-chat";
import { isDirectorConfigured } from "@/lib/director/service";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "PT Director" };

/**
 * The Timberhill PT Director: read + analyze + recommend, nothing else.
 * Every answer is grounded in deterministic tools over the caller's own
 * permissions; the model cannot see anything the caller could not open
 * directly, and it cannot write anything at all.
 */
export default async function DirectorPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="PT Director" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="PT Director"
        description="Ask questions about the department in plain English. Read-only: the Director reports and recommends, and every number it quotes names its source and freshness."
      />
      {!isDirectorConfigured() ? (
        <p className="rounded-[--radius-control] bg-warning-soft px-3 py-2 text-sm text-warning">
          The Director is not configured in this environment — the model API key is
          missing. Add OPENAI_API_KEY and redeploy.
        </p>
      ) : (
        <DirectorChat organizationId={context.selection.organizationId} />
      )}
    </div>
  );
}
