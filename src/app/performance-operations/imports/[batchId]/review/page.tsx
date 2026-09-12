import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { formatCents } from "@/lib/money/money";
import type { NormalizedRow } from "@/lib/imports/types";
import { getWorkspaceContext } from "@/lib/workspace/server";
import {
  ClientResolver,
  DuplicateResolver,
  ExcludeResolver,
  ServiceResolver,
  TrainerResolver,
} from "./row-resolver";
import { StatusMapper } from "./status-mapper";

export const metadata: Metadata = { title: "Import review" };

const QUEUES = [
  ["blocking", "Blocking"],
  ["warnings", "Warnings"],
  ["trainers", "Unmatched trainers"],
  ["services", "Unmatched services"],
  ["clients", "Unmatched clients"],
  ["statuses", "Unknown statuses"],
  ["duplicates", "Duplicates"],
  ["ready", "Ready"],
  ["excluded", "Excluded"],
  ["all", "All rows"],
] as const;

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ queue?: string; page?: string }>;
}) {
  const { batchId } = await params;
  const { queue = "blocking", page: rawPage } = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Import review" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Import review" />;

  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("id, organization_id, source, status, original_filename")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  if (!hasPermissionInOrganization(context.memberships, batch.organization_id, "import:read")) {
    return <PermissionDenied title="Import review" />;
  }
  const canResolve = hasPermissionInOrganization(
    context.memberships,
    batch.organization_id,
    "import:resolve"
  );
  const canCreateClients = hasPermissionInOrganization(
    context.memberships,
    batch.organization_id,
    "client:manage"
  );

  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 25;

  // Queue-driven row selection (server-side pagination — the client never
  // receives the whole batch).
  let rowQuery = actor.supabase
    .from("import_rows")
    .select("*", { count: "exact" })
    .eq("import_batch_id", batch.id)
    .order("source_row_number")
    .range((page - 1) * pageSize, page * pageSize - 1);
  switch (queue) {
    case "blocking":
      rowQuery = rowQuery.gt("blocking_issue_count", 0).neq("processing_status", "excluded");
      break;
    case "warnings":
      rowQuery = rowQuery.gt("warning_count", 0).neq("processing_status", "excluded");
      break;
    case "trainers":
      rowQuery = rowQuery.is("matched_trainer_id", null).neq("processing_status", "excluded");
      break;
    case "services":
      rowQuery = rowQuery.is("matched_service_id", null).neq("processing_status", "excluded");
      break;
    case "clients":
      rowQuery = rowQuery.is("matched_client_id", null).neq("processing_status", "excluded");
      break;
    case "statuses":
      rowQuery = rowQuery.eq("canonical_status", "unknown").neq("processing_status", "excluded");
      break;
    case "duplicates":
      rowQuery = rowQuery
        .not("duplicate_class", "is", null)
        .neq("duplicate_class", "new")
        .neq("processing_status", "excluded");
      break;
    case "ready":
      rowQuery = rowQuery.eq("processing_status", "ready");
      break;
    case "excluded":
      rowQuery = rowQuery.eq("processing_status", "excluded");
      break;
  }

  const [{ data: rows, count }, issuesRes, trainersRes, servicesRes, clientsRes, statusesRes] =
    await Promise.all([
      rowQuery,
      actor.supabase
        .from("import_row_issues")
        .select("import_row_id, code, severity, message, resolution_status")
        .eq("import_batch_id", batch.id)
        .eq("resolution_status", "open"),
      actor.supabase
        .from("trainer_organization_assignments")
        .select("trainers ( id, display_name )")
        .eq("organization_id", batch.organization_id)
        .is("effective_to", null),
      actor.supabase
        .from("services")
        .select("id, display_name")
        .eq("organization_id", batch.organization_id)
        .eq("status", "active")
        .order("display_name"),
      actor.supabase
        .from("client_organization_assignments")
        .select("clients ( id, display_name )")
        .eq("organization_id", batch.organization_id)
        .is("effective_to", null)
        .limit(500),
      actor.supabase
        .from("appointment_status_definitions")
        .select("key, label")
        .order("sort_order"),
    ]);

  const openIssuesByRow = new Map<string, { code: string; severity: string; message: string }[]>();
  for (const issue of issuesRes.data ?? []) {
    const list = openIssuesByRow.get(issue.import_row_id) ?? [];
    list.push(issue);
    openIssuesByRow.set(issue.import_row_id, list);
  }
  interface JoinedName {
    trainers?: { id: string; display_name: string } | null;
    clients?: { id: string; display_name: string } | null;
  }
  const trainerOptions = ((trainersRes.data ?? []) as unknown as JoinedName[])
    .flatMap((r) => (r.trainers ? [{ id: r.trainers.id, name: r.trainers.display_name }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
  const serviceOptions = (servicesRes.data ?? []).map((s) => ({ id: s.id, name: s.display_name }));
  const clientOptions = ((clientsRes.data ?? []) as unknown as JoinedName[])
    .flatMap((r) => (r.clients ? [{ id: r.clients.id, name: r.clients.display_name }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
  const statusOptions = statusesRes.data ?? [];

  // Unknown status values present in this queue view (for bulk mapping).
  const unknownStatusValues =
    queue === "statuses"
      ? [
          ...new Set(
            (rows ?? [])
              .map((r) => (r.normalized_row as unknown as NormalizedRow).sourceStatus ?? "")
              .filter((v) => v !== "")
          ),
        ]
      : [];

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const editable =
    canResolve && ["needs_review", "ready_for_approval", "validating"].includes(batch.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import review"
        description={`${batch.original_filename} — resolve mappings, duplicates, and issues. Original rows never change; every decision is audited.`}
        actions={
          <Link href={`/performance-operations/imports/${batch.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:border-border-strong">
            Batch summary
          </Link>
        }
      />

      <nav aria-label="Review queues" className="flex flex-wrap gap-1.5">
        {QUEUES.map(([key, label]) => (
          <Link key={key} href={`/performance-operations/imports/${batch.id}/review?queue=${key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              queue === key
                ? "bg-nav text-nav-fg"
                : "bg-surface-sunken text-ink-secondary hover:bg-border"
            }`}>
            {label}
          </Link>
        ))}
      </nav>

      {queue === "statuses" && unknownStatusValues.length > 0 && editable && (
        <section aria-label="Status mappings"
          className="space-y-2 rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Map unknown source statuses</h2>
          {unknownStatusValues.map((value) => (
            <StatusMapper key={value} batchId={batch.id} sourceValue={value} statuses={statusOptions} />
          ))}
        </section>
      )}

      {(rows ?? []).length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">
          No rows in this queue.
        </p>
      ) : (
        <div className="space-y-3">
          {(rows ?? []).map((row) => {
            const normalized = row.normalized_row as unknown as NormalizedRow;
            const issues = openIssuesByRow.get(row.id) ?? [];
            return (
              <details key={row.id}
                className="rounded-[--radius-card] border border-border bg-surface shadow-sm open:pb-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-ink-muted">#{row.source_row_number}</span>
                  <span className="font-mono text-xs text-ink">
                    {row.appointment_date ?? "no date"}
                    {row.start_at ? ` ${row.start_at.slice(11, 16)}Z` : ""}
                    {row.duration_minutes ? ` · ${row.duration_minutes}m` : ""}
                  </span>
                  <span className="font-medium text-ink">{normalized.sourceTrainerName ?? "—"}</span>
                  <span className="text-ink-secondary">{normalized.sourceClientName ?? "no client"}</span>
                  <span className="max-w-64 truncate text-ink-secondary">
                    {normalized.sourceServiceName ?? "—"}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    {row.canonical_status ?? "?"}
                    {row.listed_price_cents !== null ? ` · ${formatCents(row.listed_price_cents)}` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {row.duplicate_class && row.duplicate_class !== "new" && (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                        {row.duplicate_class.replaceAll("_", " ")}
                      </span>
                    )}
                    {row.processing_status === "excluded" ? (
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-muted">excluded</span>
                    ) : row.blocking_issue_count > 0 ? (
                      <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-semibold text-negative">
                        {row.blocking_issue_count} blocking
                      </span>
                    ) : row.warning_count > 0 ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                        {row.warning_count} warning{row.warning_count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-semibold text-positive">ready</span>
                    )}
                  </span>
                </summary>
                <div className="space-y-2.5 border-t border-border px-4 pt-3">
                  {issues.length > 0 && (
                    <ul className="space-y-1">
                      {issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
                            issue.severity === "blocking" ? "bg-negative-soft text-negative"
                              : issue.severity === "warning" ? "bg-warning-soft text-warning"
                                : "bg-surface-sunken text-ink-secondary"
                          }`}>
                            {issue.code}
                          </span>
                          <span className="text-ink-secondary">{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable && row.processing_status !== "excluded" && (
                    <div className="space-y-2">
                      {!row.matched_trainer_id && normalized.sourceTrainerName && (
                        <TrainerResolver batchId={batch.id} rowId={row.id}
                          trainers={trainerOptions} sourceName={normalized.sourceTrainerName} />
                      )}
                      {!row.matched_service_id && normalized.sourceServiceName && (
                        <ServiceResolver batchId={batch.id} rowId={row.id}
                          services={serviceOptions} sourceName={normalized.sourceServiceName} />
                      )}
                      {!row.matched_client_id && (normalized.sourceClientName || normalized.sourceClientEmail) && (
                        <ClientResolver batchId={batch.id} rowId={row.id}
                          clients={clientOptions} canCreate={canCreateClients} />
                      )}
                      {row.duplicate_class && !["new", "exact_duplicate"].includes(row.duplicate_class) && (
                        <DuplicateResolver batchId={batch.id} rowId={row.id} />
                      )}
                      <ExcludeResolver batchId={batch.id} rowId={row.id} />
                    </div>
                  )}
                  {row.exclusion_reason && (
                    <p className="text-xs text-ink-muted">Excluded: {row.exclusion_reason}</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link href={`/performance-operations/imports/${batch.id}/review?queue=${queue}&page=${page - 1}`}
              className="text-sm font-medium text-accent">← Previous</Link>
          )}
          <span className="text-xs text-ink-muted">Page {page} of {totalPages} ({count} rows)</span>
          {page < totalPages && (
            <Link href={`/performance-operations/imports/${batch.id}/review?queue=${queue}&page=${page + 1}`}
              className="text-sm font-medium text-accent">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
