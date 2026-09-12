import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { assessDataQuality, summarizeDataQuality } from "@/lib/freshness/data-quality";
import { loadDataQualityCounts, loadFreshnessReport } from "@/lib/freshness/service";

export const metadata: Metadata = { title: "Data health" };

/**
 * The operations health panel: what data exists, how current it is, and
 * what is keeping data out of reports. Deliberately short — every row is
 * something a manager can act on, and nothing here is for engineers.
 */
export default async function DataHealthPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Data health" />;

  const organizationId =
    context.selection.kind === "organization"
      ? context.selection.organizationId
      : (context.options[0]?.id ?? null);
  if (!organizationId) return <PermissionDenied title="Data health" />;

  if (!hasPermissionInOrganization(context.memberships, organizationId, "import:read")) {
    return <PermissionDenied title="Data health" />;
  }

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Data health" />;

  const today = new Date().toISOString().slice(0, 10);
  const [freshness, counts] = await Promise.all([
    loadFreshnessReport(actor, organizationId, today),
    loadDataQualityCounts(actor, organizationId),
  ]);
  const checks = assessDataQuality(counts, freshness);
  const summary = summarizeDataQuality(checks);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data health"
        description="Where Timberhill PT data comes from, how current each source is, and what is currently keeping data out of reports."
      />

      <p
        className={`rounded-[--radius-control] px-3 py-2 text-sm ${
          summary.severity === "blocking"
            ? "bg-negative-soft text-negative"
            : summary.severity === "attention"
              ? "bg-warning-soft text-warning"
              : "bg-positive-soft text-positive"
        }`}
      >
        {summary.message}
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Sources</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {freshness.sources.map((source) => (
            <article
              key={source.key}
              className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{source.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">{source.summary}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={source.state.replace(/_/g, " ")} />
                  {/* Manual data is never shown as if it were live. */}
                  <span className="text-[11px] text-ink-muted">
                    {source.ingest === "automated"
                      ? "Automated"
                      : source.ingest === "manual_snapshot"
                        ? "Manual entry"
                        : "Not connected"}
                  </span>
                </div>
              </div>
              {source.detail && (
                <p className="mt-2 text-xs text-ink-muted">{source.detail}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Checks</h2>
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Check</th>
                <th className="px-4 py-2 font-medium">Count</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">What it means</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">
                    {check.href ? (
                      <Link href={check.href} className="hover:text-accent">
                        {check.label}
                      </Link>
                    ) : (
                      check.label
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-ink">
                    {check.count > 0 ? check.count.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={check.severity} />
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
