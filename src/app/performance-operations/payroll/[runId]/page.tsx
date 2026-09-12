import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { formatCents } from "@/lib/money/money";
import { RUN_BADGE } from "../run-badge";
import { RunLifecycleActions } from "./run-actions";

export const metadata: Metadata = { title: "Payroll run" };

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Payroll run" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Payroll run" />;

  const { data: run } = await actor.supabase
    .from("payroll_runs")
    .select("*, organizations ( name ), reporting_periods ( label, start_date, end_date )")
    .eq("id", runId)
    .maybeSingle();
  if (!run) notFound();

  // Self-referential links loaded separately (a self-join embed is ambiguous
  // to PostgREST because each FK matches in both directions).
  async function runLink(id: string | null) {
    if (!id) return null;
    const { data } = await actor!.supabase
      .from("payroll_runs")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    return data;
  }
  const [supersedesRun, supersededByRun] = await Promise.all([
    runLink(run.supersedes_payroll_run_id),
    runLink(run.superseded_by_payroll_run_id),
  ]);
  const orgId = run.organization_id;
  if (!hasPermissionInOrganization(context.memberships, orgId, "payroll:read")) {
    return <PermissionDenied title="Payroll run" />;
  }

  const perm = (p: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, orgId, p);

  const [{ data: summaries }, { data: issues }, { data: events }, { data: snapshots }] =
    await Promise.all([
      actor.supabase
        .from("payroll_trainer_summaries")
        .select("*")
        .eq("payroll_run_id", runId),
      actor.supabase
        .from("payroll_issues")
        .select("id, severity, resolution_status")
        .eq("payroll_run_id", runId),
      actor.supabase
        .from("payroll_run_events")
        .select("from_status, to_status, reason, created_at, actor:profiles ( full_name, email )")
        .eq("payroll_run_id", runId)
        .order("created_at", { ascending: false })
        .limit(20),
      actor.supabase
        .from("payroll_snapshots")
        .select("snapshot_version, kind, lines_sha256, created_at")
        .eq("payroll_run_id", runId)
        .order("snapshot_version", { ascending: false }),
    ]);

  const trainerNames = new Map<string, string>();
  const trainerIds = (summaries ?? []).map((s) => s.trainer_id);
  if (trainerIds.length > 0) {
    const { data: trainers } = await actor.supabase
      .from("trainers")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const t of trainers ?? []) trainerNames.set(t.id, t.display_name);
  }
  const sortedSummaries = (summaries ?? []).sort((a, b) =>
    (trainerNames.get(a.trainer_id) ?? "").localeCompare(trainerNames.get(b.trainer_id) ?? ""),
  );

  const openBlocking = (issues ?? []).filter(
    (i) => i.severity === "blocking" && i.resolution_status === "open",
  ).length;
  const openWarnings = (issues ?? []).filter(
    (i) => i.severity === "warning" && i.resolution_status === "open",
  ).length;

  const org = run.organizations as unknown as { name: string } | null;
  const period = run.reporting_periods as unknown as {
    label: string;
    start_date: string;
    end_date: string;
  } | null;
  const supersedes = supersedesRun;
  const supersededBy = supersededByRun;
  interface EventRow {
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
    actor: { full_name: string | null; email: string } | null;
  }
  const eventRows = (events ?? []) as unknown as EventRow[];

  const stat = (label: string, value: string) => (
    <div className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-ink">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={run.name}
        description={`${org?.name ?? ""} · ${period?.label ?? ""} (${period?.start_date ?? ""} – ${period?.end_date ?? ""}) · run #${run.run_number} · engine ${run.calculation_version}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={RUN_BADGE[run.status] ?? "draft"} />
            <span className="text-sm text-ink-secondary">{run.status.replaceAll("_", " ")}</span>
          </div>
        }
      />

      {run.status === "failed" && (
        <div className="rounded-[--radius-card] border border-negative bg-negative-soft p-4 text-sm text-negative">
          <p className="font-semibold">Calculation failed ({run.failure_code ?? "unknown"})</p>
          <p>{run.sanitized_failure_message}</p>
        </div>
      )}
      {supersedes && (
        <p className="text-sm text-ink-secondary">
          Supersedes{" "}
          <Link href={`/performance-operations/payroll/${supersedes.id}`} className="font-medium text-accent">
            {supersedes.name}
          </Link>
        </p>
      )}
      {supersededBy && (
        <p className="text-sm text-ink-secondary">
          Superseded by{" "}
          <Link href={`/performance-operations/payroll/${supersededBy.id}`} className="font-medium text-accent">
            {supersededBy.name}
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Trainer pay total (before taxes — NOT revenue)", formatCents(run.final_compensation_total_cents))}
        {stat("Trainers", String(run.trainer_count))}
        {stat("Appointments", String(run.appointment_count))}
        {stat(
          "Open issues",
          `${openBlocking} blocking · ${openWarnings} warn`,
        )}
      </div>

      <RunLifecycleActions
        runId={run.id}
        status={run.status}
        can={{
          calculate: perm("payroll:calculate"),
          review: perm("payroll:review"),
          approve: perm("payroll:approve"),
          post: perm("payroll:post"),
          lock: perm("payroll:lock"),
          reopen: perm("payroll:reopen"),
          voidRun: perm("payroll:void"),
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/performance-operations/payroll/${run.id}/review`}
          className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          Review workspace ({openBlocking + openWarnings} open issues)
        </Link>
        <Link
          href={`/performance-operations/payroll/${run.id}/statements`}
          className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          Statements & exports
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Trainer summaries</h2>
        {sortedSummaries.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No calculation results yet — run the calculation to populate trainer summaries.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Trainer</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Review</th>
                  <th className="px-4 py-2 font-medium">Sessions</th>
                  <th className="px-4 py-2 text-right font-medium">Commission</th>
                  <th className="px-4 py-2 text-right font-medium">Flat</th>
                  <th className="px-4 py-2 text-right font-medium">Hourly</th>
                  <th className="px-4 py-2 text-right font-medium">Team</th>
                  <th className="px-4 py-2 text-right font-medium">Adjust.</th>
                  <th className="px-4 py-2 text-right font-medium">Trainer pay</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummaries.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/performance-operations/payroll/${run.id}/review#trainer-${s.trainer_id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {trainerNames.get(s.trainer_id) ?? s.trainer_id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.calculation_status === "blocked" ? (
                        <span className="text-xs font-semibold text-negative">
                          blocked ({s.blocking_issue_count})
                        </span>
                      ) : (
                        <span className="text-xs text-positive">calculated</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-secondary">{s.review_status}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {s.completed_session_count}/{s.appointment_count}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.commission_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.flat_rate_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.hourly_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.team_compensation_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatCents(s.adjustment_total_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                      {formatCents(s.final_gross_compensation_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(snapshots ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Posted snapshots</h2>
          <ul className="space-y-1 text-sm text-ink-secondary">
            {(snapshots ?? []).map((s) => (
              <li key={s.snapshot_version} className="font-mono text-xs">
                v{s.snapshot_version} · {s.kind} · {s.created_at.slice(0, 19).replace("T", " ")} ·
                sha256 {s.lines_sha256.slice(0, 16)}…
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">History</h2>
        <ul className="space-y-1.5">
          {eventRows.map((e, i) => (
            <li key={i} className="text-sm text-ink-secondary">
              <span className="font-mono text-xs text-ink-muted">
                {e.created_at.slice(0, 16).replace("T", " ")}
              </span>{" "}
              {e.from_status ? `${e.from_status} → ` : ""}
              <span className="font-medium text-ink">{e.to_status}</span>
              {" · "}
              {e.actor?.full_name || e.actor?.email || "system"}
              {e.reason ? <span className="text-ink-muted"> — {e.reason}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
