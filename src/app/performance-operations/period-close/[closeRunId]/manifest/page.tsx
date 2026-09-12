import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { Widget } from "@/components/widgets/section";
import { loadCloseRunShell } from "../../run-shell";

export const metadata: Metadata = { title: "Close manifest" };

/**
 * The frozen close manifest — human-readable summary + machine-readable
 * JSON. Printer-friendly (chrome hidden on print); JSON download via the
 * close_manifest_json export on the Exports step.
 */
export default async function CloseManifestPage({
  params,
}: {
  params: Promise<{ closeRunId: string }>;
}) {
  const { closeRunId } = await params;
  const shell = await loadCloseRunShell(closeRunId);
  if (!shell) return <PermissionDenied title="Close manifest" />;
  const { run, period, organizationName, actor } = shell;

  const { data: manifest } = await actor.supabase
    .from("period_close_manifests")
    .select("*")
    .eq("period_close_run_id", run.id)
    .maybeSingle();

  if (!manifest) {
    return (
      <div className="space-y-6">
        <PageHeader title="Close manifest" description={period?.label ?? ""} />
        <EmptyState
          title="No manifest yet"
          description="The manifest is created atomically when the close executes."
        />
      </div>
    );
  }

  const payload = manifest.payload as Record<string, unknown>;
  const approvals = payload.approvals as Record<string, string | null> | undefined;
  const exports = (payload.exports ?? []) as {
    export_type: string;
    file_name: string;
    version: number;
    sha256: string;
    row_count: number;
  }[];
  const acks = (payload.warning_acknowledgements ?? []) as {
    check_code: string;
    note: string;
  }[];
  const readiness = (payload.readiness_results ?? []) as {
    code: string;
    severity: string;
    status: string;
    resolution_state: string;
  }[];
  const payroll = payload.payroll as {
    run_id?: string;
    snapshot_version?: number;
    snapshot_sha256?: string;
  } | null;
  const importBatches = payload.import_batches as {
    included?: string[];
    reversed?: string[];
  } | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      <div className="print:hidden">
        <PageHeader
          title={`Close manifest · v${run.close_version}`}
          description={`${organizationName} · ${period?.label ?? ""} · frozen ${manifest.created_at.slice(0, 16).replace("T", " ")}`}
          actions={
            <Link
              href={`/performance-operations/period-close/${run.id}`}
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              ← Close run
            </Link>
          }
        />
      </div>

      <header className="hidden border-b border-border pb-3 print:block">
        <h1 className="text-xl font-bold text-ink">Period Close Manifest</h1>
        <p className="text-sm text-ink-secondary">
          {organizationName} · {period?.label} · close v{run.close_version}
        </p>
      </header>

      <Widget title="Identity" testId="manifest-identity">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            ["Manifest SHA-256", manifest.manifest_sha256],
            ["Close run", run.id],
            ["Close version", `v${run.close_version}`],
            ["Period", `${period?.start_date} – ${period?.end_date}`],
            ["Source cutoff", String(payload.source_cutoff_at ?? "—")],
            ["Intelligence engine", String((payload.engine_versions as Record<string, unknown>)?.intelligence ?? "")],
            ["Payroll calc version", String((payload.engine_versions as Record<string, unknown>)?.payroll_calculation ?? "—")],
            ["Appointments", String(payload.appointment_count ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="break-all text-right font-mono text-xs text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Widget>

      <Widget title="Approvals" testId="manifest-approvals">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {Object.entries(approvals ?? {}).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{key.replaceAll("_", " ")}</dt>
              <dd className="break-all text-right font-mono text-xs text-ink">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Widget>

      {payroll && (
        <Widget title="Payroll reference" testId="manifest-payroll">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Payroll run</dt>
              <dd className="font-mono text-xs text-ink">{payroll.run_id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Snapshot</dt>
              <dd className="font-mono text-xs text-ink">
                v{payroll.snapshot_version} · {payroll.snapshot_sha256?.slice(0, 24)}…
              </dd>
            </div>
          </dl>
        </Widget>
      )}

      <Widget title={`Exports (${exports.length})`} testId="manifest-exports">
        <ul className="space-y-1 text-sm">
          {exports.map((e) => (
            <li key={e.export_type + e.version} className="flex justify-between gap-3">
              <span className="text-ink">{e.file_name}</span>
              <span className="font-mono text-[11px] text-ink-muted">
                v{e.version} · {e.row_count} rows · {e.sha256.slice(0, 16)}…
              </span>
            </li>
          ))}
        </ul>
      </Widget>

      <Widget title={`Warning acknowledgements (${acks.length})`} testId="manifest-acks">
        {acks.length === 0 ? (
          <p className="text-sm text-ink-muted">No warnings required acknowledgement.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {acks.map((a) => (
              <li key={a.check_code}>
                <span className="font-mono text-xs text-ink">{a.check_code}</span>
                <span className="ml-2 text-xs text-ink-secondary">{a.note}</span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget title={`Readiness results (${readiness.length})`} testId="manifest-readiness">
        <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {readiness.map((r) => (
            <li key={r.code} className="flex justify-between gap-2">
              <span className="font-mono text-ink-secondary">{r.code}</span>
              <span
                className={
                  r.status === "pass"
                    ? "text-positive"
                    : r.resolution_state === "acknowledged"
                      ? "text-warning"
                      : "text-negative"
                }
              >
                {r.status === "pass" ? "pass" : r.resolution_state}
              </span>
            </li>
          ))}
        </ul>
      </Widget>

      <Widget title="Import batches" testId="manifest-imports">
        <p className="text-sm text-ink-secondary">
          {importBatches?.included?.length ?? 0} batch(es) included ·{" "}
          {importBatches?.reversed?.length ?? 0} with reversed appointments in the period.
        </p>
      </Widget>

      <details className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm print:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Machine-readable JSON
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-surface-sunken p-3 text-[11px] leading-4">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <p className="text-xs text-ink-muted">
        This manifest is immutable. Download the exact JSON via the
        close_manifest_json export; print this page for the PDF record.
      </p>
    </div>
  );
}
