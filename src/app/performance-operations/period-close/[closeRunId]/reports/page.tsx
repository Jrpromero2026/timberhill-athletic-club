import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadCloseRunShell } from "../../run-shell";
import { SimpleCloseAction } from "../../close-actions";

export const metadata: Metadata = { title: "Close report packages" };

const PACKAGE_TYPES: [string, string, string][] = [
  ["executive", "Executive period package", "Engine metrics, readiness, breakdowns, summaries — required for close."],
  ["department", "Department packages", "One package per active department (scoped access)."],
  ["payroll", "Payroll close package", "Register, adjustments, time, history, reconciliation from the frozen snapshot."],
  ["trainer_statements", "Trainer statement bundle", "Versioned statement register with per-statement hashes."],
  ["import_reconciliation", "Import reconciliation", "Every batch touching the period with counts and history."],
];

const PKG_BADGE: Record<string, string> = {
  draft: "draft",
  generating: "draft",
  ready: "open",
  failed: "locked",
  finalized: "active",
  superseded: "inactive",
  voided: "inactive",
};

export default async function CloseReportsPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close report packages" />;
  const { run, period, can, actor } = shell;
  const mutable = ["close_review", "ready_to_close"].includes(run.status);

  const { data: packages } = await actor.supabase
    .from("report_packages")
    .select(
      "id, package_type, department_id, version, status, generated_at, package_sha256, failure_reason, intelligence_version, payroll_snapshot_version, warnings, departments ( name )",
    )
    .eq("organization_id", run.organization_id)
    .eq("reporting_period_id", run.reporting_period_id)
    .order("package_type")
    .order("version", { ascending: false });

  interface PackageRow {
    id: string;
    package_type: string;
    department_id: string | null;
    version: number;
    status: string;
    generated_at: string;
    package_sha256: string | null;
    failure_reason: string | null;
    intelligence_version: string | null;
    payroll_snapshot_version: number | null;
    warnings: unknown;
    departments: { name: string } | null;
  }
  const rows = (packages ?? []) as unknown as PackageRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Report packages: ${period?.label ?? "?"}`}
        description="Versioned, hash-frozen packages. Regeneration creates a new version; the close finalizes exactly one executive package version."
        actions={
          <Link
            href={`/performance-operations/period-close/${run.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Close run
          </Link>
        }
      />

      {mutable && can("report_package:create") && (
        <section className="space-y-2" data-testid="package-generators">
          <h2 className="text-sm font-semibold text-ink">Generate</h2>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TYPES.map(([type, label]) => (
              <SimpleCloseAction
                key={type}
                action="generate_package"
                runId={run.id}
                label={label}
                pendingLabel="Generating…"
                tone="neutral"
                extraFields={{ package_type: type }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2" data-testid="package-list">
        <h2 className="text-sm font-semibold text-ink">Package versions</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No packages generated yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Package</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Generated</th>
                  <th className="px-4 py-2 font-medium">Hash / notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0" data-package={row.package_type} data-package-status={row.status}>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {row.package_type.replaceAll("_", " ")}
                      {row.departments && (
                        <span className="ml-1 text-xs text-ink-muted">· {row.departments.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">v{row.version}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={PKG_BADGE[row.status] ?? "draft"} />
                      <span className="ml-1.5 text-xs text-ink-secondary">{row.status}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {row.generated_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-ink-muted">
                      {row.status === "failed"
                        ? (row.failure_reason ?? "failed")
                        : row.package_sha256
                          ? `${row.package_sha256.slice(0, 16)}… · ${row.intelligence_version ?? ""}${row.payroll_snapshot_version != null ? ` · payroll snap v${row.payroll_snapshot_version}` : ""}`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-ink-muted">
        Package content freezes at generation (hash recorded); the executive
        package&apos;s web/print rendering and CSV appendix derive from the
        frozen payload. Unavailable metrics keep their health and reason —
        never $0.00.
      </p>
    </div>
  );
}
