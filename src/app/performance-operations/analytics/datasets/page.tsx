import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { DATASET_DEFINITIONS, DATASET_EXPORT_VERSION } from "@/lib/analytics/exports/datasets";
import { FinalityBadge } from "../shared/comparison-badges";

export const metadata: Metadata = { title: "Analytics datasets" };

/**
 * Forecast-ready historical datasets: governed CSV exports of engine
 * output with stable versioned schemas. "Forecast-ready" means structured
 * HISTORY — nothing here projects a value.
 */
export default async function DatasetsPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Analytics datasets" />;
  }
  if (context.state === "ready" && !context.can("analytics_dataset:export")) {
    return <PermissionDenied title="Analytics datasets" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics datasets" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Dataset exports cover the selected period and its rolling history."
        />
      </div>
    );
  }
  const { window, actor, organizationId } = context;

  const { data: recentExports } = await actor.supabase
    .from("export_events")
    .select("export_type, metadata, created_at")
    .eq("organization_id", organizationId)
    .like("export_type", "analytics_dataset:%")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast-ready historical datasets"
        description={`Versioned schema ${DATASET_EXPORT_VERSION}. Structured historical engine output — machine currency stays integer cents; every row carries health, reason, and finality. No projected values.`}
        actions={<FinalityBadge window={window} />}
      />

      <ul className="space-y-3" data-testid="dataset-list">
        {DATASET_DEFINITIONS.map((dataset) => (
          <li
            key={dataset.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border border-border bg-surface px-4 py-3 shadow-sm"
            data-dataset={dataset.key}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{dataset.name}</p>
              <p className="text-xs text-ink-muted">{dataset.description}</p>
            </div>
            <a
              href={`/performance-operations/analytics/datasets/export?dataset=${dataset.key}`}
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
              data-testid={`dataset-export-${dataset.key}`}
            >
              Download CSV
            </a>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Recent dataset exports</h2>
        {(recentExports ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No dataset exports recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
            {(recentExports ?? []).map((event, index) => {
              const metadata = event.metadata as {
                sha256?: string;
                row_count?: number;
              } | null;
              return (
                <li key={index} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink">
                    {event.export_type.replace("analytics_dataset:", "")}
                    <span className="ml-2 font-mono text-[11px] text-ink-muted">
                      {metadata?.sha256?.slice(0, 12) ?? ""} · {metadata?.row_count ?? "?"} rows
                    </span>
                  </span>
                  <span className="text-xs text-ink-muted">
                    {event.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        Client-level datasets are deliberately absent; trainer payroll stays in the
        payroll domain&apos;s own exports. Every export records an audit event with its
        content hash.
      </p>
    </div>
  );
}
