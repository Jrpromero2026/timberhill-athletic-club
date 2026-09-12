import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { loadCloseRunShell } from "../../run-shell";
import { SimpleCloseAction } from "../../close-actions";

export const metadata: Metadata = { title: "Close exports" };

const EXPORT_TYPES: [string, string][] = [
  ["payroll_register_csv", "Payroll register CSV (required)"],
  ["payroll_detail_csv", "Payroll detail CSV"],
  ["department_summary_csv", "Department summary CSV"],
  ["executive_summary_csv", "Executive metric CSV (required)"],
  ["trainer_statement_register_csv", "Trainer statement register CSV"],
];

export default async function CloseExportsPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close exports" />;
  const { run, period, can, actor } = shell;
  const mutable = ["close_review", "ready_to_close"].includes(run.status);

  const { data: exports } = await actor.supabase
    .from("close_exports")
    .select("*")
    .eq("organization_id", run.organization_id)
    .eq("reporting_period_id", run.reporting_period_id)
    .order("export_type")
    .order("version", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Exports: ${period?.label ?? "?"}`}
        description="Accounting-friendly exports generated from frozen sources. Every file's identity (name, version, hash, rows) is recorded in the export manifest; downloads regenerate and VERIFY the hash."
        actions={
          <Link
            href={`/performance-operations/period-close/${run.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            ← Close run
          </Link>
        }
      />

      {mutable && can("period_close:export") && (
        <section className="space-y-2" data-testid="export-generators">
          <h2 className="text-sm font-semibold text-ink">Generate</h2>
          <div className="flex flex-wrap gap-2">
            {EXPORT_TYPES.map(([type, label]) => (
              <SimpleCloseAction
                key={type}
                action="generate_export"
                runId={run.id}
                label={label}
                pendingLabel="Generating…"
                tone="neutral"
                extraFields={{ export_type: type }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2" data-testid="export-manifest">
        <h2 className="text-sm font-semibold text-ink">Export manifest</h2>
        {(exports ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No exports generated yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">Rows</th>
                  <th className="px-4 py-2 font-medium">Bytes</th>
                  <th className="px-4 py-2 font-medium">SHA-256</th>
                  <th className="px-4 py-2 font-medium">Generated</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Download</th>
                </tr>
              </thead>
              <tbody>
                {(exports ?? []).map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border last:border-0"
                    data-export={e.export_type}
                    data-superseded={e.superseded}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">{e.file_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">v{e.version}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.row_count}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.byte_size}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-ink-muted">
                      {e.sha256.slice(0, 16)}…
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {e.created_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.superseded ? (
                        <span className="text-[10px] font-bold uppercase text-warning">superseded</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase text-positive">current</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/performance-operations/period-close/${run.id}/exports/${e.id}/download`}
                        className="text-xs font-medium text-accent hover:text-accent-strong"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-ink-muted">
        Superseded versions remain accessible for audit. CSV cells are
        formula-injection protected; integer cents are exported raw with USD
        presentation columns alongside.
      </p>
    </div>
  );
}
