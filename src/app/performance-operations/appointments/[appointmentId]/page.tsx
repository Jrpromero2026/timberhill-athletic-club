import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { formatCents } from "@/lib/money/money";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { StatusCorrectionForm } from "./correction-form";

export const metadata: Metadata = { title: "Appointment" };

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Appointment" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Appointment" />;

  const { data: appointment } = await actor.supabase
    .from("appointments")
    .select(
      "*, organizations ( name ), trainers ( display_name ), clients ( display_name ), services ( display_name ), departments ( name ), import_batches ( original_filename )"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) notFound();

  const canCorrect = hasPermissionInOrganization(
    context.memberships,
    appointment.organization_id,
    "appointment:correct"
  );

  const [rowRes, linksRes, historyRes, correctionsRes, statusesRes] = await Promise.all([
    actor.supabase
      .from("import_rows")
      .select("original_row, source_row_number, trainer_match_method, service_match_method, client_match_method")
      .eq("id", appointment.import_row_id)
      .maybeSingle(),
    actor.supabase
      .from("appointment_source_links")
      .select("link_type, source, external_appointment_id, created_at")
      .eq("appointment_id", appointmentId)
      .order("created_at"),
    actor.supabase
      .from("appointment_status_history")
      .select("previous_status, new_status, change_source, reason, created_at, profiles:changed_by ( full_name )")
      .eq("appointment_id", appointmentId)
      .order("created_at"),
    actor.supabase
      .from("appointment_corrections")
      .select("field, previous_value, new_value, reason, change_source, created_at, profiles:corrected_by ( full_name )")
      .eq("appointment_id", appointmentId)
      .order("created_at"),
    actor.supabase.from("appointment_status_definitions").select("key, label").order("sort_order"),
  ]);

  const importRow = rowRes.data;
  interface HistoryRow {
    previous_status: string | null;
    new_status: string;
    change_source: string;
    reason: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  }
  interface CorrectionRow {
    field: string;
    previous_value: string | null;
    new_value: string | null;
    reason: string;
    change_source: string;
    created_at: string;
    profiles: { full_name: string } | null;
  }
  const history = (historyRes.data ?? []) as unknown as HistoryRow[];
  const corrections = (correctionsRes.data ?? []) as unknown as CorrectionRow[];

  const joined = appointment as unknown as {
    organizations: { name: string } | null;
    trainers: { display_name: string } | null;
    clients: { display_name: string } | null;
    services: { display_name: string } | null;
    departments: { name: string } | null;
    import_batches: { original_filename: string } | null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${appointment.appointment_date} · ${joined.trainers?.display_name ?? ""}`}
        description={`${joined.organizations?.name ?? ""} · ${joined.services?.display_name ?? ""}`}
        actions={
          <span className="flex items-center gap-2">
            <StatusBadge status={appointment.record_state === "active" ? "active" : "inactive"} />
            <span className="text-sm font-medium text-ink">
              {appointment.record_state} · {appointment.canonical_status}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Canonical record" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">Canonical record</h2>
          <dl className="space-y-1.5 text-sm">
            {[
              ["Start", `${appointment.start_at.slice(0, 16).replace("T", " ")} UTC`],
              ["Duration", `${appointment.duration_minutes} minutes`],
              ["Timezone", appointment.timezone],
              ["Trainer", joined.trainers?.display_name ?? "—"],
              ["Client", joined.clients?.display_name ?? "— (no linked client)"],
              ["Service", joined.services?.display_name ?? "—"],
              ["Department", joined.departments?.name ?? "—"],
              ["Participants", String(appointment.participant_count)],
              ["Source listed price", appointment.source_listed_price_cents !== null ? formatCents(appointment.source_listed_price_cents) : "not provided"],
              ["Source amount paid", appointment.source_amount_paid_cents !== null ? formatCents(appointment.source_amount_paid_cents) : "not provided"],
              ["Payment status", appointment.payment_status ?? "not provided"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 rounded-[--radius-control] bg-info-soft px-3 py-2 text-xs text-info">
            Source amounts are source-provided facts. Recognized revenue and
            payroll-eligible amounts are defined in later phases.
          </p>
        </section>

        <section aria-label="Source evidence" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">Source evidence</h2>
          <dl className="space-y-1.5 text-sm">
            {[
              ["Source", appointment.source],
              ["External ID", appointment.external_appointment_id ?? "—"],
              ["Import batch", joined.import_batches?.original_filename ?? "—"],
              ["Source row", importRow ? `#${importRow.source_row_number}` : "—"],
              ["Trainer match", importRow?.trainer_match_method ?? "—"],
              ["Service match", importRow?.service_match_method ?? "—"],
              ["Client match", importRow?.client_match_method ?? "—"],
              ["Posted at", appointment.posted_at.slice(0, 16).replace("T", " ")],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-mono text-xs text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/performance-operations/imports/${appointment.import_batch_id}`}
            className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-strong">
            Open import batch →
          </Link>
          {importRow && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Original source row (verbatim, immutable)
              </summary>
              <div className="mt-2 max-h-64 overflow-auto rounded bg-surface-sunken p-2">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(importRow.original_row as Record<string, string>).map(
                      ([key, value]) => (
                        <tr key={key} className="border-b border-border last:border-0">
                          <td className="py-1 pr-2 font-mono text-ink-muted">{key}</td>
                          <td className="py-1 font-mono text-ink">{value || "(blank)"}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <ul className="mt-3 space-y-1">
            {(linksRes.data ?? []).map((link, i) => (
              <li key={i} className="text-xs text-ink-muted">
                {link.link_type} link · {link.source}
                {link.external_appointment_id ? ` · ${link.external_appointment_id}` : ""} ·{" "}
                {link.created_at.slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {canCorrect && appointment.record_state === "active" && (
        <section aria-label="Status correction" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">Status correction</h2>
          <StatusCorrectionForm
            appointmentId={appointment.id}
            currentStatus={appointment.canonical_status}
            statuses={statusesRes.data ?? []}
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Status history" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Status history</h2>
          </div>
          <ul className="divide-y divide-border">
            {history.map((entry, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink-muted">
                  {entry.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="text-ink">
                  {entry.previous_status ? `${entry.previous_status} → ` : ""}
                  <span className="font-medium">{entry.new_status}</span>
                </span>
                <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-secondary">
                  {entry.change_source}
                </span>
                <span className="text-xs text-ink-muted">{entry.profiles?.full_name}</span>
                {entry.reason && <span className="text-xs text-ink-secondary">— {entry.reason}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Correction history" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Correction history</h2>
          </div>
          {corrections.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-muted">No corrections.</p>
          ) : (
            <ul className="divide-y divide-border">
              {corrections.map((correction, i) => (
                <li key={i} className="px-4 py-2 text-sm">
                  <p className="text-ink">
                    <span className="font-mono text-xs">{correction.field}</span>:{" "}
                    {correction.previous_value ?? "—"} → <span className="font-medium">{correction.new_value ?? "—"}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {correction.created_at.slice(0, 16).replace("T", " ")} · {correction.profiles?.full_name} ·{" "}
                    {correction.change_source} — {correction.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
