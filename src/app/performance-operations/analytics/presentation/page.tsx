import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { formatMetricValue } from "@/lib/intelligence/format";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { composeScorecard } from "@/lib/analytics/scorecards/compose";
import { ORGANIZATION_EXECUTIVE_SCORECARD } from "@/lib/analytics/scorecards/definitions";
import { loadGoalRecords } from "@/lib/analytics/presentations/packages";
import {
  summarizeComparison,
  summarizeFinality,
} from "@/lib/analytics/presentations/summaries";
import { BarChartSvg, HorizontalBarSvg } from "@/components/charts/charts";
import { PresentationChrome } from "./presentation-chrome";

export const metadata: Metadata = { title: "Presentation" };

/**
 * Presentation mode: full-screen, print-ready rendering of the SAVED
 * executive scorecard composition for the selected period. Same analytics
 * service, same numbers — no separate calculation path. Print/PDF via the
 * browser print dialog with page-break-aware sections.
 */
export default async function PresentationPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Presentation" />;
  }
  if (context.state === "ready" && !context.can("analytics:presentation")) {
    return <PermissionDenied title="Presentation" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6 p-8">
        <EmptyState
          title="Select a reporting period"
          description="Presentation mode renders the executive scorecard for the selected period."
        />
        <Link href="/performance-operations/analytics" className="text-sm text-accent hover:text-accent-strong">
          ← Back to analytics
        </Link>
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
  const rolling = service.rollingPeriods(window, 6);
  const trend = rolling.ok
    ? await service.getMetricSeries("appointments_completed", [...rolling.windows].reverse())
    : null;
  const departments = await service.getBreakdownComparison(
    "appointments_completed",
    "department",
    window,
    "previous_period",
  );
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

  const flatComparisons = scorecard.sections.flatMap((s) =>
    s.rows.flatMap((r) => (r.previousPeriod ? [r.previousPeriod] : [])),
  );
  const summaries = [
    summarizeFinality(window),
    ...flatComparisons.slice(0, 5).flatMap((c) => {
      const s = summarizeComparison(c);
      return s ? [s] : [];
    }),
  ];

  return (
    <PresentationChrome>
      <div className="mx-auto max-w-5xl space-y-8 p-8 print:p-0" data-testid="presentation-root">
        {/* Title slide */}
        <header className="border-b-4 border-accent pb-6 print:break-after-avoid">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            Confidential — internal use only
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">{organizationName}</h1>
          <p className="mt-1 text-lg text-ink-secondary">
            Executive performance review · {window.label}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            {window.dateFrom} – {window.dateTo} ·{" "}
            <span className="font-semibold uppercase">
              {window.finality === "final" ? "Final (closed period)" : "Not final — figures may change"}
            </span>{" "}
            · generated {generatedAt} · engine intel-v1 / analytics-v1
          </p>
        </header>

        {/* Analytical summaries */}
        <section className="print:break-inside-avoid">
          <h2 className="text-lg font-semibold text-ink">Analytical summaries</h2>
          <ul className="mt-2 space-y-1.5">
            {summaries.map((summary) => (
              <li key={summary.code + summary.statement} className="text-sm text-ink-secondary">
                — {summary.statement}
              </li>
            ))}
          </ul>
        </section>

        {/* Scorecard sections */}
        {scorecard.sections.map((section) => (
          <section key={section.title} className="print:break-inside-avoid">
            <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border-strong text-left text-xs uppercase text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Metric</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Current</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Previous period</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Prior year</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.metricId} className="border-b border-border">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                      {row.label}
                      {row.current.health !== "healthy" && (
                        <span className="ml-2 text-[10px] uppercase text-ink-muted">
                          ({row.current.health.replaceAll("_", " ")})
                        </span>
                      )}
                    </th>
                    <td className="py-1.5 pr-3 text-right font-mono font-semibold text-ink">
                      {formatMetricValue(row.current.value, row.unit as MetricUnit)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-ink-secondary">
                      {formatMetricValue(
                        row.previousPeriod?.comparison?.value ?? null,
                        row.unit as MetricUnit,
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono text-ink-secondary">
                      {formatMetricValue(
                        row.priorYear?.comparison?.value ?? null,
                        row.unit as MetricUnit,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {/* Trend + departments */}
        {trend && (
          <section className="print:break-inside-avoid">
            <h2 className="text-lg font-semibold text-ink">Completed sessions — rolling periods</h2>
            <div className="mt-2">
              <BarChartSvg
                unit={trend.unit}
                points={trend.points.map((p) => ({
                  key: p.window.label,
                  label: p.window.label,
                  value: p.value,
                  health: p.health,
                }))}
              />
            </div>
          </section>
        )}
        <section className="print:break-inside-avoid">
          <h2 className="text-lg font-semibold text-ink">Departments — completed sessions</h2>
          <div className="mt-2">
            <HorizontalBarSvg
              unit={departments.unit}
              rows={departments.rows.map((r) => ({
                key: r.key,
                label: r.label,
                value: r.currentValue,
              }))}
            />
          </div>
        </section>

        <footer className="border-t border-border pt-4 text-xs text-ink-muted print:break-inside-avoid">
          Values are Performance Intelligence Engine output rendered verbatim; unavailable
          metrics are labeled, never zero-filled. Confidential — internal use only.
        </footer>
      </div>
    </PresentationChrome>
  );
}
