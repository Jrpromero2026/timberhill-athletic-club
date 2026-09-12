import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Imports" };

const BATCH_BADGE: Record<string, string> = {
  uploaded: "draft",
  parsing: "draft",
  validating: "draft",
  needs_review: "closed",
  ready_for_approval: "open",
  approved: "open",
  posting: "open",
  posted: "active",
  failed: "locked",
  reversed: "inactive",
};

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; status?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Imports" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);
  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "import:read")
  );
  if (!canRead) return <PermissionDenied title="Imports" />;
  const canUpload = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "import:upload")
  );

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Imports" />;

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const pageSize = 25;

  let query = actor.supabase
    .from("import_batches")
    .select(
      "id, source, original_filename, status, total_row_count, blocked_row_count, warning_row_count, posted_row_count, uploaded_at, posted_at, organizations ( name ), uploader:profiles!import_batches_uploaded_by_fkey ( full_name, email ), approver:profiles!import_batches_approved_by_fkey ( full_name )",
      { count: "exact" }
    )
    .in("organization_id", orgIds)
    .order("uploaded_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filters.source && ["setmore", "acuity", "manual_csv"].includes(filters.source)) {
    query = query.eq("source", filters.source);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) query = query.ilike("original_filename", `%${filters.q}%`);

  const { data, count } = await query;

  interface BatchRow {
    id: string;
    source: string;
    original_filename: string;
    status: string;
    total_row_count: number;
    blocked_row_count: number;
    warning_row_count: number;
    posted_row_count: number;
    uploaded_at: string;
    posted_at: string | null;
    organizations: { name: string } | null;
    uploader: { full_name: string; email: string } | null;
    approver: { full_name: string } | null;
  }
  const batches = (data ?? []) as unknown as BatchRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const selectClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Staged appointment imports: upload → review → approval → transactional posting to the canonical ledger."
        actions={
          canUpload ? (
            <Link href="/performance-operations/imports/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
              Upload file
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={filters.q ?? ""} placeholder="Search filename…"
          aria-label="Search filename" className={`${selectClass} w-56`} />
        <select name="source" defaultValue={filters.source ?? ""} aria-label="Source filter" className={selectClass}>
          <option value="">All sources</option>
          <option value="setmore">Setmore</option>
          <option value="acuity">Acuity</option>
          <option value="manual_csv">Manual CSV</option>
        </select>
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Status filter" className={selectClass}>
          <option value="">All statuses</option>
          {["uploaded", "needs_review", "ready_for_approval", "approved", "posted", "failed", "reversed"].map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </select>
        <button type="submit"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken">
          Filter
        </button>
      </form>

      {batches.length === 0 ? (
        <EmptyState
          title="No import batches"
          description={
            canUpload
              ? "Upload a Setmore CSV export (save the .xlsx report as CSV first) or a manual CSV to begin."
              : "No batches are visible for your access in this workspace."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Rows</th>
                <th className="px-4 py-2 font-medium">Blocking</th>
                <th className="px-4 py-2 font-medium">Warnings</th>
                <th className="px-4 py-2 font-medium">Uploaded</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-2.5">
                    <Link href={`/performance-operations/imports/${batch.id}`} className="font-medium text-ink hover:text-accent">
                      {batch.original_filename}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      by {batch.uploader?.full_name || batch.uploader?.email || "—"}
                      {batch.posted_at ? ` · posted ${batch.posted_at.slice(0, 10)}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{batch.organizations?.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{batch.source}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{batch.total_row_count}</td>
                  <td className="px-4 py-2.5">
                    {batch.blocked_row_count > 0 ? (
                      <span className="font-mono text-xs font-semibold text-negative">{batch.blocked_row_count}</span>
                    ) : (
                      <span className="font-mono text-xs text-ink-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{batch.warning_row_count}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                    {batch.uploaded_at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={BATCH_BADGE[batch.status] ?? "draft"} />
                    <span className="ml-1.5 text-xs text-ink-secondary">{batch.status.replaceAll("_", " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link href={`/performance-operations/imports?page=${page - 1}`} className="text-sm font-medium text-accent">← Previous</Link>
          )}
          <span className="text-xs text-ink-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/performance-operations/imports?page=${page + 1}`} className="text-sm font-medium text-accent">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
