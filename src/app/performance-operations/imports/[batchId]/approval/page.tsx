import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { ApproveButton } from "../batch-actions";
import { AcknowledgeWarningsButton } from "./acknowledge-button";

export const maxDuration = 120;

export const metadata: Metadata = { title: "Import approval" };

export default async function ImportApprovalPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Import approval" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Import approval" />;

  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("*, organizations ( name )")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  if (!hasPermissionInOrganization(context.memberships, batch.organization_id, "import:approve")) {
    return <PermissionDenied title="Import approval" />;
  }

  const [{ count: openBlocking }, { count: openWarnings }, excludedRes, dupResolvedRes] =
    await Promise.all([
      actor.supabase
        .from("import_row_issues")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", batch.id)
        .eq("severity", "blocking")
        .eq("resolution_status", "open"),
      actor.supabase
        .from("import_row_issues")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", batch.id)
        .eq("severity", "warning")
        .eq("resolution_status", "open"),
      actor.supabase
        .from("import_rows")
        .select("source_row_number, exclusion_reason")
        .eq("import_batch_id", batch.id)
        .eq("processing_status", "excluded")
        .order("source_row_number"),
      actor.supabase
        .from("import_resolutions")
        .select("action", { count: "exact", head: true })
        .eq("import_batch_id", batch.id)
        .in("action", ["duplicate_confirmed_not", "row_excluded"]),
    ]);

  const orgName = (batch.organizations as unknown as { name: string } | null)?.name ?? "";
  const readiness = [
    {
      label: "Zero open blocking issues",
      ok: (openBlocking ?? 0) === 0,
      detail: `${openBlocking ?? 0} open`,
    },
    {
      label: "All warnings acknowledged",
      ok: (openWarnings ?? 0) === 0,
      detail: `${openWarnings ?? 0} open`,
    },
    {
      label: "Duplicate classifications resolved",
      ok: batch.duplicate_row_count === 0,
      detail: `${batch.duplicate_row_count} unresolved`,
    },
    {
      label: "Batch is in ready_for_approval state",
      ok: batch.status === "ready_for_approval",
      detail: batch.status,
    },
  ];
  const allReady = readiness.every((r) => r.ok);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval summary"
        description={`${batch.original_filename} · ${orgName} · ${batch.source}`}
        actions={
          <Link href={`/performance-operations/imports/${batch.id}/review`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:border-border-strong">
            Back to review
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Posting summary">
        {[
          ["Will post", batch.accepted_row_count],
          ["Excluded", batch.excluded_row_count],
          ["Total rows", batch.total_row_count],
          ["With acknowledged warnings", batch.warning_row_count],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-[--radius-card] border border-border bg-surface p-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Approval readiness"
        className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">Approval requirements</h2>
        <ul className="space-y-1.5">
          {readiness.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-sm">
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                item.ok ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"
              }`}>
                {item.ok ? "✓" : "✗"}
              </span>
              <span className={item.ok ? "text-ink" : "text-ink-secondary"}>{item.label}</span>
              <span className="ml-auto font-mono text-xs text-ink-muted">{item.detail}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {(openWarnings ?? 0) > 0 && (
            <AcknowledgeWarningsButton batchId={batch.id} count={openWarnings ?? 0} />
          )}
          {allReady && <ApproveButton batchId={batch.id} />}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Approval is immutable once recorded; any later row, mapping, or
          resolution change automatically revokes it and returns the batch to
          review. Posting is a separate step requiring import:post. Excluded
          rows and duplicate decisions are summarized below and permanently
          logged. ({dupResolvedRes.count ?? 0} duplicate/exclusion decisions recorded.)
        </p>
      </section>

      {(excludedRes.data ?? []).length > 0 && (
        <section aria-label="Excluded rows"
          className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Excluded rows</h2>
          </div>
          <ul className="divide-y divide-border">
            {(excludedRes.data ?? []).map((row) => (
              <li key={row.source_row_number} className="flex gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink-muted">#{row.source_row_number}</span>
                <span className="text-ink-secondary">{row.exclusion_reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
