import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { formatMetricValue } from "@/lib/intelligence/format";
import { METRIC_DEFINITIONS, listDefinitions } from "@/lib/intelligence/catalog";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { getMetricAnalyticsMetadata } from "@/lib/analytics/shared/metadata";
import { FinalityBadge } from "../shared/comparison-badges";
import { BenchmarkForms, BenchmarkRowActions } from "./benchmark-forms";

export const metadata: Metadata = { title: "Benchmarks" };

const SOURCE_LABEL: Record<string, string> = {
  org_historical_median: "Internal historical (org median)",
  org_historical_best: "Internal historical (org best)",
  department_historical_median: "Internal historical (department median)",
  trainer_historical_baseline: "Internal historical (trainer baseline)",
  internal_standard: "Internal approved standard",
  external_reference: "External approved reference",
};

/**
 * Benchmarks: governed reference values with explicit sources and
 * evidence. Internal-historical values are computed by the engine from a
 * cited period range; nothing here invents an industry number.
 */
export default async function BenchmarksPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Benchmarks" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Benchmarks" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Benchmark comparisons are evaluated against the selected period."
        />
      </div>
    );
  }
  const { service, window, actor, organizationId, can } = context;

  const { data: benchmarks } = await actor.supabase
    .from("performance_benchmarks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const rows = [];
  for (const benchmark of benchmarks ?? []) {
    let currentValue: number | null = null;
    let currentHealth = "unavailable";
    let comparisonNote: string | null = null;
    const definition = METRIC_DEFINITIONS.get(benchmark.metric_id);
    if (!definition) {
      comparisonNote = "Metric no longer exists in the catalog.";
    } else if (definition.version !== benchmark.metric_version) {
      comparisonNote = `Metric version changed (${benchmark.metric_version} → ${definition.version}) — comparison flagged.`;
    } else if (
      window.dateFrom < benchmark.effective_from ||
      (benchmark.effective_to && window.dateTo > benchmark.effective_to)
    ) {
      comparisonNote = "The selected period is outside the benchmark's effective dates.";
    } else if (benchmark.status === "approved") {
      const result = await service.getMetricResult(benchmark.metric_id, window, {
        departmentId: benchmark.department_id ?? undefined,
        trainerId: benchmark.trainer_id ?? undefined,
      });
      currentValue = result.value;
      currentHealth = result.health;
      if (result.value === null) comparisonNote = result.reasons[0] ?? "Value unavailable.";
    } else {
      comparisonNote = "Comparisons use approved benchmarks only.";
    }
    rows.push({ benchmark, currentValue, currentHealth, comparisonNote });
  }

  const metricOptions = listDefinitions()
    .filter((d) => getMetricAnalyticsMetadata(d.id)?.benchmarkCompatible)
    .map((d) => ({ id: d.id, name: d.name, unit: d.unit }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const { data: departments } = await actor.supabase
    .from("departments")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benchmarks"
        description={`Approved reference values compared against ${window.label}. Sources are explicit — internal history, internal standards, or owner-cited external references.`}
        actions={<FinalityBadge window={window} />}
      />

      {can("benchmark:create") && (
        <BenchmarkForms
          organizationId={organizationId}
          metricOptions={metricOptions}
          departments={departments ?? []}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No benchmarks"
          description="Create one from organization history or an approved standard — never from invented industry numbers."
        />
      ) : (
        <ul className="space-y-3" data-testid="benchmark-list">
          {rows.map(({ benchmark, currentValue, currentHealth, comparisonNote }) => {
            const unit = (benchmark.metric_unit ?? "count") as MetricUnit;
            const variance =
              currentValue !== null ? currentValue - benchmark.value : null;
            return (
              <li
                key={benchmark.id}
                className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
                data-testid={`benchmark-${benchmark.id}`}
                data-benchmark-status={benchmark.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {benchmark.name}
                      <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
                        {benchmark.status}
                      </span>
                      <span className="rounded bg-info-soft px-1.5 text-[10px] uppercase text-info">
                        {SOURCE_LABEL[benchmark.source_type] ?? benchmark.source_type}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {METRIC_DEFINITIONS.get(benchmark.metric_id)?.name ?? benchmark.metric_id} ·
                      benchmark {formatMetricValue(benchmark.value, unit)} · effective{" "}
                      {benchmark.effective_from}
                      {benchmark.effective_to ? ` – ${benchmark.effective_to}` : " onward"}
                    </p>
                    <p className="mt-1 max-w-2xl text-xs text-ink-secondary">
                      Evidence: {benchmark.evidence}
                    </p>
                  </div>
                  <div className="text-right">
                    {benchmark.status === "approved" && currentValue !== null ? (
                      <>
                        <p className="font-mono text-sm text-ink" data-testid="benchmark-current">
                          {formatMetricValue(currentValue, unit)}
                          <span className="ml-1 text-[10px] uppercase text-ink-muted">
                            {currentHealth !== "healthy" ? currentHealth.replaceAll("_", " ") : ""}
                          </span>
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {variance === 0
                            ? "matches the benchmark"
                            : `${variance! > 0 ? "+" : "−"}${formatMetricValue(Math.abs(variance!), unit)} vs benchmark`}
                        </p>
                      </>
                    ) : (
                      <p className="max-w-[260px] text-[11px] text-ink-muted">{comparisonNote}</p>
                    )}
                    <BenchmarkRowActions
                      benchmarkId={benchmark.id}
                      status={benchmark.status}
                      canApprove={can("benchmark:approve")}
                      canArchive={can("benchmark:archive")}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-muted">
        Internal targets are never described as industry standards. Deprecated benchmarks
        remain on record with their evidence.
      </p>
    </div>
  );
}
