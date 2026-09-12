import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { parseCsv } from "@/lib/imports/csv";
import { detectSensitiveColumns } from "@/lib/imports/adapters";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { MappingForm } from "./mapping-form";

export const metadata: Metadata = { title: "Column mapping" };

export default async function MappingPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Column mapping" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Column mapping" />;

  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("id, organization_id, source, status, original_filename, storage_path, metadata")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  if (!hasPermissionInOrganization(context.memberships, batch.organization_id, "import:manage")) {
    return <PermissionDenied title="Column mapping" />;
  }
  if (batch.status !== "uploaded") {
    return (
      <div className="space-y-6">
        <PageHeader title="Column mapping" description={batch.original_filename} />
        <p className="rounded-[--radius-card] border border-border bg-surface px-4 py-6 text-sm text-ink-secondary">
          This batch has already been parsed; the mapping can no longer be changed here.
        </p>
      </div>
    );
  }

  // Load a small preview from the preserved original (server-side only).
  const { data: file } = await actor.supabase.storage
    .from("performance-operations-imports")
    .download(batch.storage_path);
  const text = file ? await file.text() : "";
  const parsed = parseCsv(text, { maxRows: 5 });
  const metadata = batch.metadata as unknown as { headers?: string[] };
  const headers = metadata.headers ?? parsed.headers.map((h) => h.trim());
  const sensitive = detectSensitiveColumns(headers);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Column mapping"
        description={`${batch.original_filename} — map source columns to canonical fields. The saved mapping is versioned, audited, and reused for files with this exact header signature.`}
      />
      {sensitive.length > 0 && (
        <p className="rounded-[--radius-card] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          Potentially sensitive columns detected: {sensitive.join(", ")}. Map
          only what operations require; unmapped columns are preserved in raw
          evidence but not normalized.
        </p>
      )}
      <MappingForm
        batchId={batch.id}
        headers={headers}
        sampleRows={parsed.rows.slice(0, 3)}
        rawHeaders={parsed.headers}
      />
    </div>
  );
}
