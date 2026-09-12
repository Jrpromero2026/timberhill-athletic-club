import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { formatCents } from "@/lib/money/money";
import { RUN_BADGE } from "./run-badge";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Payroll" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Payroll" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);
  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "payroll:read"),
  );
  const canReadSelf = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "payroll:read_self"),
  );
  if (!canRead && !canReadSelf) return <PermissionDenied title="Payroll" />;

  // Trainer self-service: posted/locked statements only.
  if (!canRead) {
    const { data: trainer } = await actor.supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", actor.userId)
      .maybeSingle();
    const { data: summaries } = trainer
      ? await actor.supabase
          .from("payroll_trainer_summaries")
          .select("payroll_run_id, final_gross_compensation_cents, payroll_runs ( name, status, organization_id )")
          .eq("trainer_id", trainer.id)
      : { data: [] };
    interface SelfRow {
      payroll_run_id: string;
      final_gross_compensation_cents: number;
      payroll_runs: { name: string; status: string } | null;
    }
    const rows = ((summaries ?? []) as unknown as SelfRow[]).filter((r) =>
      ["posted", "locked"].includes(r.payroll_runs?.status ?? ""),
    );
    return (
      <div className="space-y-6">
        <PageHeader
          title="My payroll statements"
          description="Your finalized payroll preparation statements (gross compensation, before taxes and withholdings)."
        />
        {rows.length === 0 || !trainer ? (
          <EmptyState
            title="No posted statements yet"
            description="Statements appear here once a payroll run including you is posted."
          />
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Run</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Final gross</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.payroll_run_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/performance-operations/payroll/${row.payroll_run_id}/statements/${trainer.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {row.payroll_runs?.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={RUN_BADGE[row.payroll_runs?.status ?? ""] ?? "draft"} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(row.final_gross_compensation_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const canCreate = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "payroll:create"),
  );
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const pageSize = 25;

  let query = actor.supabase
    .from("payroll_runs")
    .select(
      "id, name, run_number, status, final_compensation_total_cents, trainer_count, appointment_count, blocking_issue_count, warning_count, created_at, posted_at, organizations ( name ), reporting_periods ( label )",
      { count: "exact" },
    )
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, count } = await query;

  interface RunRow {
    id: string;
    name: string;
    run_number: number;
    status: string;
    final_compensation_total_cents: number;
    trainer_count: number;
    appointment_count: number;
    blocking_issue_count: number;
    warning_count: number;
    created_at: string;
    posted_at: string | null;
    organizations: { name: string } | null;
    reporting_periods: { label: string } | null;
  }
  const runs = (data ?? []) as unknown as RunRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const selectClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Payroll preparation runs: calculate → review → approve → post → lock. Totals here are TRAINER PAY before taxes — not department revenue."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/performance-operations/payroll/time"
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              Time entries
            </Link>
            <Link
              href="/performance-operations/payroll/adjustments"
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              Adjustments
            </Link>
            {canCreate && (
              <Link
                href="/performance-operations/payroll/new"
                className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                New run
              </Link>
            )}
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Status filter" className={selectClass}>
          <option value="">All statuses</option>
          {Object.keys(RUN_BADGE).map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          Filter
        </button>
      </form>

      {runs.length === 0 ? (
        <EmptyState
          title="No payroll runs"
          description={
            canCreate
              ? "Create a run for an organization and reporting period to begin payroll preparation."
              : "No runs are visible for your access in this workspace."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Trainers</th>
                <th className="px-4 py-2 font-medium">Appointments</th>
                <th className="px-4 py-2 font-medium">Issues</th>
                <th className="px-4 py-2 text-right font-medium">Final total</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-2.5">
                    <Link href={`/performance-operations/payroll/${run.id}`} className="font-medium text-ink hover:text-accent">
                      {run.name}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      run #{run.run_number}
                      {run.posted_at ? ` · posted ${run.posted_at.slice(0, 10)}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{run.organizations?.name}</td>
                  <td className="px-4 py-2.5 text-ink-secondary">{run.reporting_periods?.label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{run.trainer_count}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{run.appointment_count}</td>
                  <td className="px-4 py-2.5">
                    {run.blocking_issue_count > 0 ? (
                      <span className="font-mono text-xs font-semibold text-negative">
                        {run.blocking_issue_count} blocking
                      </span>
                    ) : run.warning_count > 0 ? (
                      <span className="font-mono text-xs text-warning">{run.warning_count} warning</span>
                    ) : (
                      <span className="font-mono text-xs text-ink-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatCents(run.final_compensation_total_cents)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={RUN_BADGE[run.status] ?? "draft"} />
                    <span className="ml-1.5 text-xs text-ink-secondary">{run.status.replaceAll("_", " ")}</span>
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
            <Link href={`/performance-operations/payroll?page=${page - 1}`} className="text-sm font-medium text-accent">
              ← Previous
            </Link>
          )}
          <span className="text-xs text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/performance-operations/payroll?page=${page + 1}`} className="text-sm font-medium text-accent">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
