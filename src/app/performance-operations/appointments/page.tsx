import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { formatCents } from "@/lib/money/money";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Appointments" };

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    trainer?: string;
    status?: string;
    source?: string;
    state?: string;
    batch?: string;
    page?: string;
    period?: string;
  }>;
}) {
  const filters = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return (
      <div className="space-y-6">
        <PageHeader title="Appointments" description="Canonical appointment ledger." />
        <EmptyState title="Appointments require a live environment"
          description="Connect and sign in to view the ledger." />
      </div>
    );
  }

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);
  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "appointment:read")
  );
  if (!canRead) return <PermissionDenied title="Appointments" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Appointments" />;
  const periods = await getPeriodContext(context);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const pageSize = 50;

  // Reporting-period filter: selected header period bounds the date range.
  const activePeriod = filters.period === "current" ? periods.selected : null;

  let query = actor.supabase
    .from("appointments")
    .select(
      "id, appointment_date, start_at, duration_minutes, canonical_status, record_state, source, external_appointment_id, source_listed_price_cents, source_amount_paid_cents, department_id, import_batch_id, organizations ( name ), trainers ( display_name ), clients ( display_name ), services ( display_name ), departments ( name )",
      { count: "exact" }
    )
    .in("organization_id", orgIds)
    .order("start_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (activePeriod) {
    query = query
      .gte("appointment_date", activePeriod.startDate)
      .lte("appointment_date", activePeriod.endDate);
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    query = query.gte("appointment_date", filters.from);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    query = query.lte("appointment_date", filters.to);
  }
  if (filters.status) query = query.eq("canonical_status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.batch) query = query.eq("import_batch_id", filters.batch);
  query =
    filters.state === "all"
      ? query
      : filters.state === "reversed"
        ? query.eq("record_state", "reversed")
        : query.eq("record_state", "active");

  const [{ data, count }, statusesRes] = await Promise.all([
    query,
    actor.supabase.from("appointment_status_definitions").select("key, label").order("sort_order"),
  ]);

  interface LedgerRow {
    id: string;
    appointment_date: string;
    start_at: string;
    duration_minutes: number;
    canonical_status: string;
    record_state: string;
    source: string;
    external_appointment_id: string | null;
    source_listed_price_cents: number | null;
    source_amount_paid_cents: number | null;
    import_batch_id: string;
    organizations: { name: string } | null;
    trainers: { display_name: string } | null;
    clients: { display_name: string } | null;
    services: { display_name: string } | null;
    departments: { name: string } | null;
  }
  const appointments = (data ?? []) as unknown as LedgerRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const selectClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Canonical posted ledger. Source amounts are source-provided facts — not recognized revenue. Records change only through audited corrections; reversals never delete."
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="f-from" className="mb-1 block text-xs font-medium text-ink-muted">From</label>
          <input id="f-from" name="from" type="date" defaultValue={filters.from ?? ""} className={selectClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-xs font-medium text-ink-muted">To</label>
          <input id="f-to" name="to" type="date" defaultValue={filters.to ?? ""} className={selectClass} />
        </div>
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className={selectClass}>
          <option value="">All statuses</option>
          {(statusesRes.data ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} aria-label="Source" className={selectClass}>
          <option value="">All sources</option>
          <option value="setmore">Setmore</option>
          <option value="acuity">Acuity</option>
          <option value="manual_csv">Manual CSV</option>
        </select>
        <select name="state" defaultValue={filters.state ?? "active"} aria-label="Record state" className={selectClass}>
          <option value="active">Active</option>
          <option value="reversed">Reversed</option>
          <option value="all">All states</option>
        </select>
        {periods.selected && (
          <label className="flex h-9 items-center gap-1.5 text-sm text-ink-secondary">
            <input type="checkbox" name="period" value="current" defaultChecked={filters.period === "current"} className="h-4 w-4" />
            Limit to {periods.selected.label}
          </label>
        )}
        <button type="submit"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken">
          Filter
        </button>
      </form>

      {appointments.length === 0 ? (
        <EmptyState
          title="No posted appointments match"
          description="Appointments appear here after an import batch is reviewed, approved, and posted. Nothing is fabricated — the ledger only ever contains posted source data."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2 font-medium">Date / time</th>
                <th className="px-3 py-2 font-medium">Dur.</th>
                <th className="px-3 py-2 font-medium">Trainer</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Dept.</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Listed</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id}
                  className={`border-b border-border last:border-0 hover:bg-surface-subtle ${
                    appointment.record_state !== "active" ? "opacity-60" : ""
                  }`}>
                  <td className="px-3 py-2">
                    <Link href={`/performance-operations/appointments/${appointment.id}`} className="font-mono text-xs font-medium text-ink hover:text-accent">
                      {appointment.appointment_date} {appointment.start_at.slice(11, 16)}Z
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">{appointment.duration_minutes}m</td>
                  <td className="px-3 py-2 text-ink">{appointment.trainers?.display_name}</td>
                  <td className="px-3 py-2 text-ink-secondary">{appointment.clients?.display_name ?? "—"}</td>
                  <td className="max-w-52 truncate px-3 py-2 text-ink-secondary">{appointment.services?.display_name}</td>
                  <td className="px-3 py-2 text-ink-muted">{appointment.departments?.name ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={appointment.canonical_status === "completed" ? "active" : appointment.canonical_status === "cancelled" ? "closed" : "draft"} />
                    <span className="ml-1 text-xs text-ink-secondary">{appointment.canonical_status}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                    {appointment.source}
                    {appointment.external_appointment_id ? ` · ${appointment.external_appointment_id}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                    {appointment.source_listed_price_cents !== null
                      ? formatCents(appointment.source_listed_price_cents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink-muted">
                    {appointment.source_amount_paid_cents !== null
                      ? formatCents(appointment.source_amount_paid_cents) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      appointment.record_state === "active"
                        ? "bg-positive-soft text-positive"
                        : "bg-negative-soft text-negative"
                    }`}>
                      {appointment.record_state}
                    </span>
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
            <Link href={`/performance-operations/appointments?page=${page - 1}`} className="text-sm font-medium text-accent">← Previous</Link>
          )}
          <span className="text-xs text-ink-muted">Page {page} of {totalPages} ({count} records)</span>
          {page < totalPages && (
            <Link href={`/performance-operations/appointments?page=${page + 1}`} className="text-sm font-medium text-accent">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
