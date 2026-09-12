import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { BarChartSvg, ChartShell, HorizontalBarSvg } from "@/components/charts/charts";
import { formatMetricValue } from "@/lib/intelligence/format";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { loadGoalRecords } from "@/lib/analytics/presentations/packages";
import { composeScorecard } from "@/lib/analytics/scorecards/compose";
import { ORGANIZATION_EXECUTIVE_SCORECARD } from "@/lib/analytics/scorecards/definitions";
import {
  summarizeComparison,
  summarizeFinality,
  summarizeGoalStates,
  summarizeUnavailability,
} from "@/lib/analytics/presentations/summaries";
import { ComparisonBadge, FinalityBadge } from "../shared/comparison-badges";

export const metadata: Metadata = { title: "Executive analytics" };

/**
 * Executive analytics: organization scorecard with previous-period and
 * prior-year comparisons, multi-period trend, department comparison, goal
 * status, and deterministic analytical summaries. Everything composes the
 * analytics service — no page-side math.
 */
export default async function ExecutiveAnalyticsPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace") return <PermissionDenied title="Executive analytics" />;
  if (context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Executive analytics" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Executive analytics"
          description="Select a reporting period in the header — analytics are computed per period."
        />
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period to open the executive scorecard."
        />
      </div>
    );
  }
  const { service, window, organizationName, actor, organizationId } = context;

  const goals = await loadGoalRecords(actor, organizationId);
  const scorecard = await composeScorecard(
    service,
    ORGANIZATION_EXECUTIVE_SCORECARD,
    window,
    {},
    goals,
  );

  // Multi-period trend over the last 6 reporting periods (when available).
  const rolling = service.rollingPeriods(window, 6);
  const trendSeries = rolling.ok
    ? await service.getMetricSeries(
        "appointments_completed",
        [...rolling.windows].reverse(),
      )
    : null;

  const departmentComparison = await service.getBreakdownComparison(
    "appointments_completed",
    "department",
    window,
    "previous_period",
  );

  // Deterministic analytical summaries (never AI).
  const flatComparisons = scorecard.sections.flatMap((s) =>
    s.rows.flatMap((r) => (r.previousPeriod ? [r.previousPeriod] : [])),
  );
  const summaries = [
    summarizeFinality(window),
    ...flatComparisons.slice(0, 4).flatMap((c) => {
      const s = summarizeComparison(c);
      return s ? [s] : [];
    }),
    ...(summarizeUnavailability(flatComparisons) ? [summarizeUnavailability(flatComparisons)!] : []),
    ...summarizeGoalStates(
      goals
        .filter((g) => g.status === "active")
        .map((g) => ({ name: g.name, progress: scorecard.sections
          .flatMap((s) => s.rows)
          .find((r) => r.goal?.goalId === g.id)?.goal?.progress ?? {
            status: "unavailable" as const,
            reason: null, currentValue: null, metricHealth: null,
            absoluteGap: null, percentToTargetBp: null, timeElapsedBp: 0, onTrack: null,
          } })),
    ),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive analytics"
        description={`${organizationName} · ${window.label} (${window.dateFrom} – ${window.dateTo})`}
        actions={
          <span className="flex items-center gap-2">
            <FinalityBadge window={window} />
            <Link
              href="/performance-operations/analytics/presentation"
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              Presentation mode
            </Link>
          </span>
        }
      />

      <section
        className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
        data-testid="analytical-summaries"
      >
        <h2 className="text-sm font-semibold text-ink">Analytical summaries</h2>
        <p className="text-xs text-ink-muted">
          Deterministic comparison statements from engine results — no AI, no projections.
        </p>
        <ul className="mt-2 space-y-1">
          {summaries.map((summary) => (
            <li key={summary.code + summary.statement} className="text-sm text-ink-secondary">
              {summary.statement}
            </li>
          ))}
        </ul>
      </section>

      {scorecard.sections.map((section) => (
        <section key={section.title} className="space-y-2" data-testid="executive-scorecard-section">
          <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-muted">
                  <th scope="col" className="px-3 py-2 font-medium">Metric</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Current</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">vs previous period</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">vs prior year</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Goal</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr
                    key={row.metricId}
                    className="border-b border-border/60"
                    data-metric={row.metricId}
                    data-health={row.current.health}
                  >
                    <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                      <Link href={row.deepLink} className="hover:text-accent">
                        {row.label}
                      </Link>
                    </th>
                    <td className="px-3 py-2 text-right font-mono text-ink">
                      {formatMetricValue(row.current.value, row.unit as never)}
                      {row.current.health !== "healthy" && (
                        <span className="ml-1 text-[10px] uppercase text-ink-muted">
                          {row.current.health.replaceAll("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ComparisonBadge comparison={row.previousPeriod} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ComparisonBadge comparison={row.priorYear} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {row.goal ? (
                        <span data-goal-status={row.goal.progress.status}>
                          {row.goal.progress.status.replaceAll("_", " ")}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {trendSeries && (
        <ChartShell
          title="Completed sessions — rolling periods"
          description={`Engine values per reporting period, oldest to newest. ${trendSeries.points.some((p) => p.window.partial) ? "The newest period is partial." : ""}`}
          unit={trendSeries.unit}
          points={trendSeries.points.map((p) => ({
            key: p.window.label,
            label: p.window.label,
            value: p.value,
            health: p.health,
          }))}
          testId="executive-trend"
        >
          <BarChartSvg
            unit={trendSeries.unit}
            points={trendSeries.points.map((p) => ({
              key: p.window.label,
              label: p.window.label,
              value: p.value,
              health: p.health,
            }))}
          />
        </ChartShell>
      )}

      <ChartShell
        title="Departments — completed sessions"
        description={
          departmentComparison.eligibility === "eligible"
            ? "Current period per department (previous period in the data table)."
            : `Comparison not shown: ${departmentComparison.eligibilityReason ?? ""}`
        }
        unit={departmentComparison.unit}
        health={departmentComparison.health}
        points={departmentComparison.rows.map((r) => ({
          key: r.key,
          label: r.label,
          value: r.currentValue,
        }))}
        testId="executive-departments"
      >
        <HorizontalBarSvg
          unit={departmentComparison.unit}
          rows={departmentComparison.rows.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.currentValue,
          }))}
        />
      </ChartShell>

      {/* drill-down affordance */}
      <p className="text-xs text-ink-muted">
        Drill down: open a department from{" "}
        <Link href="/performance-operations/analytics/scorecards" className="text-accent hover:text-accent-strong">
          Scorecards
        </Link>{" "}
        or review goals in{" "}
        <Link href="/performance-operations/analytics/goals" className="text-accent hover:text-accent-strong">
          Goals
        </Link>
        .
      </p>
    </div>
  );
}
