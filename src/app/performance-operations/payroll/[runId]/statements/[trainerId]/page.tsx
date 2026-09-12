import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { formatCents } from "@/lib/money/money";
import {
  loadRunStatementContext,
  loadTrainerStatement,
  recordExport,
} from "@/lib/payroll/statements";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Trainer statement" };

export default async function TrainerStatementPage({
  params,
}: {
  params: Promise<{ runId: string; trainerId: string }>;
}) {
  const { runId, trainerId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Trainer statement" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Trainer statement" />;

  const runContext = await loadRunStatementContext(actor, runId);
  if (!runContext) notFound();
  const { run } = runContext;

  const canReadAll = hasPermissionInOrganization(
    context.memberships,
    run.organization_id,
    "payroll:read",
  );
  // Trainer self-access: own statement, finalized runs only (RLS enforces the
  // same rule on the underlying rows).
  let selfAccess = false;
  if (!canReadAll) {
    const { data: self } = await actor.supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", actor.userId)
      .maybeSingle();
    selfAccess =
      self?.id === trainerId && ["posted", "locked"].includes(run.status);
  }
  if (!canReadAll && !selfAccess) {
    return <PermissionDenied title="Trainer statement" />;
  }

  const statement = await loadTrainerStatement(actor, runId, trainerId);
  if (!statement) notFound();
  await recordExport(actor, run, "statement_view", trainerId);

  const finalized = ["posted", "locked"].includes(run.status);
  const s = statement.summary;
  const totalRows: [string, number][] = [
    ["Commission", s.commission_compensation_cents],
    ["Flat-rate sessions", s.flat_rate_compensation_cents],
    ["Hourly & approved time", s.hourly_compensation_cents],
    ["Team roles", s.team_compensation_cents],
    ["Bonuses", s.bonus_total_cents],
    ["Deductions", -s.deduction_total_cents],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/performance-operations/payroll/${run.id}/statements`}
          className="text-sm font-medium text-accent hover:text-accent-strong"
        >
          ← All statements
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={`/performance-operations/payroll/${run.id}/statements/${trainerId}/export`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Download CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <h1 className="text-xl font-bold text-ink">Payroll Preparation Statement</h1>
        <p className="text-sm text-ink-secondary">
          {statement.trainerName} · {runContext.organizationName}
        </p>
        <p className="text-sm text-ink-secondary">
          {runContext.periodLabel} ({runContext.periodRange}) · {run.name}
        </p>
        <p className="text-xs text-ink-muted">
          Status: {run.status.replaceAll("_", " ")} · engine {run.calculation_version}
          {!finalized && " · DRAFT — figures may change until the run is posted"}
        </p>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-1.5 pr-2 font-medium">Date</th>
            <th className="py-1.5 pr-2 font-medium">Type</th>
            <th className="py-1.5 pr-2 font-medium">Service</th>
            <th className="py-1.5 pr-2 font-medium">Status</th>
            <th className="py-1.5 pr-2 text-right font-medium">Basis</th>
            <th className="py-1.5 pr-2 text-right font-medium">Rate</th>
            <th className="py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line) => (
            <tr key={line.id} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2 font-mono text-xs">{line.appointmentDate ?? "—"}</td>
              <td className="py-1.5 pr-2 text-xs">{line.lineType.replaceAll("_", " ")}</td>
              <td className="py-1.5 pr-2 text-xs">{line.serviceName ?? "—"}</td>
              <td className="py-1.5 pr-2 text-xs">
                {line.calculationStatus === "calculated"
                  ? (line.canonicalStatus ?? "—")
                  : `${line.calculationStatus}${line.exclusionReason ? `: ${line.exclusionReason}` : ""}`}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono text-xs">
                {line.basisAmountCents === null ? "—" : formatCents(line.basisAmountCents)}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono text-xs">
                {line.rateAmountCents !== null
                  ? formatCents(line.rateAmountCents)
                  : line.rateBasisPoints !== null
                    ? `${(line.rateBasisPoints / 100).toFixed(2)}%`
                    : "—"}
              </td>
              <td className="py-1.5 text-right font-mono text-xs font-semibold">
                {formatCents(line.roundedAmountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto max-w-sm space-y-1">
        {totalRows.map(([label, cents]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">{label}</span>
            <span className="font-mono">{formatCents(cents)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1 text-sm">
          <span className="text-ink-secondary">Adjustments (net)</span>
          <span className="font-mono">{formatCents(s.adjustment_total_cents)}</span>
        </div>
        <div className="flex items-center justify-between border-t-2 border-ink pt-2 text-base font-bold">
          <span>FINAL GROSS</span>
          <span className="font-mono">{formatCents(s.final_gross_compensation_cents)}</span>
        </div>
      </section>

      <footer className="border-t border-border pt-3 text-xs text-ink-muted">
        Gross compensation preparation only — not net pay. Taxes and withholdings are out of
        scope of this system. Sessions are identified by date and service; client identities are
        never included in statements.
      </footer>
    </div>
  );
}
