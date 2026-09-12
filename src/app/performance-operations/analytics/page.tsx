import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { formatMetricValue } from "@/lib/intelligence/format";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { ComparisonBadge, FinalityBadge } from "./shared/comparison-badges";

export const metadata: Metadata = { title: "Analytics" };

const SECTIONS: {
  href: string;
  title: string;
  description: string;
  permission?: "analytics:presentation" | "cohort:read" | "goal:read" | "benchmark:read" | "analytics_dataset:export";
}[] = [
  {
    href: "/performance-operations/analytics/executive",
    title: "Executive analytics",
    description: "Organization scorecard, multi-period trends, department comparison.",
  },
  {
    href: "/performance-operations/analytics/scorecards",
    title: "Scorecards",
    description: "Organization, department, trainer, payroll, close, and integration scorecards.",
  },
  {
    href: "/performance-operations/analytics/goals",
    title: "Goals",
    description: "Governed targets against catalog metrics with approval and progress.",
    permission: "goal:read",
  },
  {
    href: "/performance-operations/analytics/benchmarks",
    title: "Benchmarks",
    description: "Evidence-backed reference values — internal history or approved standards.",
    permission: "benchmark:read",
  },
  {
    href: "/performance-operations/analytics/cohorts",
    title: "Cohorts",
    description: "First-visit client cohorts and monthly activity (counts only).",
    permission: "cohort:read",
  },
  {
    href: "/performance-operations/analytics/dashboards",
    title: "Dashboards",
    description: "Personal and shared dashboards built from governed widgets.",
  },
  {
    href: "/performance-operations/analytics/presentation",
    title: "Presentation",
    description: "Full-screen, print-ready executive view of the selected period.",
    permission: "analytics:presentation",
  },
  {
    href: "/performance-operations/analytics/datasets",
    title: "Datasets",
    description: "Forecast-ready historical dataset exports (no projected values).",
    permission: "analytics_dataset:export",
  },
];

/** Analytics landing: headline comparisons + section navigation. */
export default async function AnalyticsPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Analytics" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Business intelligence over the Performance Intelligence Engine."
        />
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header — every analytics surface is computed for that window."
        />
      </div>
    );
  }
  const { service, window, organizationName, can } = context;

  const headline = await service.getMultiPeriodComparison(
    ["appointments_completed", "revenue_listed_cents", "active_clients", "payroll_gross_cents"],
    window,
    ["previous_period"],
  );

  const visibleSections = SECTIONS.filter(
    (section) => !section.permission || can(section.permission),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`${organizationName} · ${window.label} (${window.dateFrom} – ${window.dateTo}) · analytics-v1 over engine intel-v1`}
        actions={<FinalityBadge window={window} />}
      />

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        data-testid="analytics-headline"
      >
        {Object.entries(headline).map(([metricId, comparisons]) => {
          const comparison = comparisons[0];
          return (
            <div
              key={metricId}
              className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
              data-metric={metricId}
              data-health={comparison.current.health}
            >
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {comparison.metricName}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold text-ink">
                {formatMetricValue(comparison.current.value, comparison.unit as MetricUnit)}
              </p>
              <ComparisonBadge comparison={comparison} />
              {comparison.current.health !== "healthy" && (
                <p className="mt-1 text-[11px] text-ink-muted">{comparison.current.reason}</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="analytics-sections">
        {visibleSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-sunken"
          >
            <p className="text-sm font-semibold text-ink">{section.title}</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{section.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
