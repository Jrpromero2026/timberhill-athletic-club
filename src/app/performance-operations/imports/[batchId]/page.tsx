import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { revokeApproval, rerunMatching } from "@/lib/actions/imports";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import {

  DownloadOriginalButton,
  PostButton,
  ReverseForm,
} from "./batch-actions";

/**
 * Server actions invoked from this page (re-run matching, resolutions)
 * sweep every row of the batch. A real Timberhill month is ~2,900 rows,
 * which does not fit the default function budget.
 */
export const maxDuration = 120;

export const metadata: Metadata = { title: "Import batch" };

export default async function ImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Import batch" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Import batch" />;

  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("*, organizations ( name ), uploader:profiles!import_batches_uploaded_by_fkey ( full_name, email ), approver:profiles!import_batches_approved_by_fkey ( full_name )")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  const orgId = batch.organization_id;
  const can = (p: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, orgId, p);
  if (!can("import:read")) return <PermissionDenied title="Import batch" />;

  const [issuesRes, eventsRes, resolutionsRes] = await Promise.all([
    actor.supabase
      .from("import_row_issues")
      .select("code, severity, resolution_status")
      .eq("import_batch_id", batchId),
    actor.supabase
      .from("import_batch_events")
      .select("from_status, to_status, reason, created_at, profiles:actor_id ( full_name )")
      .eq("import_batch_id", batchId)
      .order("created_at"),
    actor.supabase
      .from("import_resolutions")
      .select("action, affected_row_count, created_at, profiles:actor_id ( full_name )")
      .eq("import_batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const issues = issuesRes.data ?? [];
  const openBlocking = issues.filter((i) => i.severity === "blocking" && i.resolution_status === "open").length;
  const openWarnings = issues.filter((i) => i.severity === "warning" && i.resolution_status === "open").length;
  const issueByCode = new Map<string, { open: number; total: number; severity: string }>();
  for (const issue of issues) {
    const entry = issueByCode.get(issue.code) ?? { open: 0, total: 0, severity: issue.severity };
    entry.total++;
    if (issue.resolution_status === "open") entry.open++;
    issueByCode.set(issue.code, entry);
  }

  interface EventRow {
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  }
  const events = (eventsRes.data ?? []) as unknown as EventRow[];
  interface ResolutionRow {
    action: string;
    affected_row_count: number;
    created_at: string;
    profiles: { full_name: string } | null;
  }
  const resolutions = (resolutionsRes.data ?? []) as unknown as ResolutionRow[];

  const uploader = batch.uploader as unknown as { full_name: string; email: string } | null;
  const approver = batch.approver as unknown as { full_name: string } | null;

  // Phase 4 dependency guard: a posted batch referenced by approved/posted/
  // locked payroll cannot be reversed — surface the dependency BEFORE the
  // user attempts it (the RPC also fails closed).
  let payrollDependencies: { payroll_run_id: string; run_name: string; run_status: string }[] = [];
  if (batch.status === "posted" && can("import:reverse")) {
    const { data: deps } = await actor.supabase.rpc("payroll_dependencies_for_batch", {
      p_batch_id: batch.id,
    });
    payrollDependencies = deps ?? [];
  }
  const orgName = (batch.organizations as unknown as { name: string } | null)?.name ?? "";
  const metadata = batch.metadata as unknown as {
    detected_adapter?: string | null;
    detection_confidence?: number;
    timezone_assumption?: string;
    header_signature?: string;
  };

  const inReview = ["needs_review", "ready_for_approval", "validating"].includes(batch.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.original_filename}
        description={`${orgName} · ${batch.source} · uploaded by ${uploader?.full_name || uploader?.email || "—"} at ${batch.uploaded_at.slice(0, 16).replace("T", " ")}`}
        actions={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={batch.status === "posted" ? "active" : batch.status === "failed" ? "locked" : "open"} />
            <span className="text-sm font-medium text-ink">{batch.status.replaceAll("_", " ")}</span>
          </span>
        }
      />

      {batch.sanitized_failure_message && (
        <div className="rounded-[--radius-card] border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
          <strong className="font-semibold">Failure:</strong> {batch.sanitized_failure_message}
          {batch.failure_code && <span className="ml-2 font-mono text-xs">({batch.failure_code})</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {batch.status === "uploaded" && can("import:manage") && (
          <Link href={`/performance-operations/imports/${batch.id}/mapping`}
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
            Map columns
          </Link>
        )}
        {inReview && (
          <Link href={`/performance-operations/imports/${batch.id}/review`}
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
            Open review queue
          </Link>
        )}
        {batch.status === "ready_for_approval" && can("import:approve") && (
          <Link href={`/performance-operations/imports/${batch.id}/approval`}
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-positive px-4 text-sm font-semibold text-white hover:opacity-90">
            Approval summary
          </Link>
        )}
        {inReview && can("import:resolve") && (
          <form action={rerunMatching}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button type="submit"
              className="h-9 rounded-[--radius-control] border border-border px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken">
              Re-run matching
            </button>
          </form>
        )}
        {batch.status === "approved" && can("import:approve") && (
          <form action={revokeApproval}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button type="submit"
              className="h-9 rounded-[--radius-control] border border-border px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken">
              Revoke approval
            </button>
          </form>
        )}
        {batch.status === "approved" && can("import:post") && (
          <PostButton batchId={batch.id} expectedCount={batch.accepted_row_count} />
        )}
        {batch.status === "posted" && can("import:reverse") && payrollDependencies.length === 0 && (
          <ReverseForm batchId={batch.id} />
        )}
        {can("import:download") && <DownloadOriginalButton batchId={batch.id} />}
      </div>

      {payrollDependencies.length > 0 && (
        <div className="rounded-[--radius-card] border border-warning bg-warning-soft p-3 text-sm text-warning">
          <p className="font-semibold">Reversal blocked by payroll</p>
          <p>
            Appointments from this batch are referenced by approved, posted, or locked payroll.
            Reopen or supersede the dependent run(s) before reversing this import:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {payrollDependencies.map((dep) => (
              <li key={dep.payroll_run_id}>
                <Link href={`/performance-operations/payroll/${dep.payroll_run_id}`} className="font-medium underline">
                  {dep.run_name}
                </Link>{" "}
                ({dep.run_status})
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6" aria-label="Row counts">
        {[
          ["Total rows", batch.total_row_count, ""],
          ["Ready", batch.accepted_row_count, "text-positive"],
          ["Blocked", batch.blocked_row_count, batch.blocked_row_count > 0 ? "text-negative" : ""],
          ["With warnings", batch.warning_row_count, ""],
          ["Duplicates", batch.duplicate_row_count, ""],
          ["Excluded", batch.excluded_row_count, ""],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="rounded-[--radius-card] border border-border bg-surface p-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
            <p className={`mt-1 font-mono text-xl font-semibold text-ink ${cls}`}>{value}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="File and adapter" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">File & adapter</h2>
          <dl className="space-y-1.5 text-sm">
            {[
              ["File hash (sha256)", batch.file_hash.slice(0, 16) + "…"],
              ["Size", `${(batch.file_size / 1024).toFixed(1)} KB`],
              ["Adapter", batch.adapter_version || metadata.detected_adapter || "pending mapping"],
              ["Detection confidence", metadata.detection_confidence != null ? `${Math.round((metadata.detection_confidence ?? 0) * 100)}%` : "—"],
              ["Timezone assumption", metadata.timezone_assumption ?? "—"],
              ["Header signature", (metadata.header_signature ?? "").slice(0, 16) + "…"],
              ["Approved by", approver?.full_name ?? "—"],
              ["Posted", batch.posted_at ? `${batch.posted_row_count} rows at ${batch.posted_at.slice(0, 16).replace("T", " ")}` : "—"],
              ["Reversed", batch.reversed_at ? batch.reversed_at.slice(0, 16).replace("T", " ") : "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-mono text-xs text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Issue breakdown" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            Issues <span className="font-normal text-ink-muted">({openBlocking} blocking · {openWarnings} warnings open)</span>
          </h2>
          {issueByCode.size === 0 ? (
            <p className="text-sm text-ink-muted">No issues recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {[...issueByCode.entries()]
                  .sort((a, b) => b[1].open - a[1].open)
                  .map(([code, entry]) => (
                    <tr key={code} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-2 font-mono text-xs text-ink">{code}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          entry.severity === "blocking" ? "bg-negative-soft text-negative"
                            : entry.severity === "warning" ? "bg-warning-soft text-warning"
                              : "bg-surface-sunken text-ink-secondary"
                        }`}>
                          {entry.severity}
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs text-ink-muted">
                        {entry.open} open / {entry.total}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Processing timeline" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Processing timeline</h2>
          </div>
          <ul className="divide-y divide-border">
            {events.map((event, i) => (
              <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink-muted">
                  {event.created_at.slice(0, 19).replace("T", " ")}
                </span>
                <span className="text-ink">
                  {event.from_status ? `${event.from_status} → ` : ""}
                  <span className="font-medium">{event.to_status}</span>
                </span>
                <span className="text-xs text-ink-muted">{event.profiles?.full_name}</span>
                {event.reason && <span className="text-xs text-ink-secondary">— {event.reason}</span>}
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-4 py-4 text-sm text-ink-muted">No transitions recorded.</li>
            )}
          </ul>
        </section>

        <section aria-label="Recent resolutions" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Recent resolutions</h2>
          </div>
          <ul className="divide-y divide-border">
            {resolutions.map((resolution, i) => (
              <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink-muted">
                  {resolution.created_at.slice(0, 19).replace("T", " ")}
                </span>
                <span className="text-ink">{resolution.action.replaceAll("_", " ")}</span>
                <span className="font-mono text-xs text-ink-muted">×{resolution.affected_row_count}</span>
                <span className="text-xs text-ink-muted">{resolution.profiles?.full_name}</span>
              </li>
            ))}
            {resolutions.length === 0 && (
              <li className="px-4 py-4 text-sm text-ink-muted">No resolutions yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
