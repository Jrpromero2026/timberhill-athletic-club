import Link from "next/link";
import { formatMetricValue } from "@/lib/intelligence/format";
import type { WidgetView } from "@/lib/analytics/dashboards/render";
import {
  ChartShell,
  GoalProgressBar,
  HorizontalBarSvg,
  LineChartSvg,
  SparklineSvg,
} from "@/components/charts/charts";
import { ComparisonBadge } from "../../shared/comparison-badges";
import { WidgetOwnerControls } from "../dashboard-forms";

/** One rendered dashboard widget (server component). */
export function DashboardWidgetView({
  widgetId,
  widgetType,
  width,
  view,
  isOwner,
}: {
  widgetId: string;
  widgetType: string;
  width: number;
  view: WidgetView;
  isOwner: boolean;
}) {
  const span =
    width >= 4
      ? "md:col-span-2 xl:col-span-4"
      : width === 3
        ? "md:col-span-2 xl:col-span-3"
        : width === 2
          ? "md:col-span-2"
          : "";
  return (
    <div
      className={`relative rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm ${span}`}
      data-widget-id={widgetId}
      data-widget-type={widgetType}
      data-widget-kind={view.kind}
    >
      {isOwner && <WidgetOwnerControls widgetId={widgetId} />}
      <WidgetBody view={view} />
    </div>
  );
}

function WidgetBody({ view }: { view: WidgetView }) {
  switch (view.kind) {
    case "unavailable":
      return (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Unavailable</p>
          <p className="mt-1 text-sm text-ink-secondary">{view.reason}</p>
        </div>
      );
    case "metric":
    case "comparison":
      return (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">{view.label}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">
            {formatMetricValue(view.comparison.current.value, view.unit)}
          </p>
          <ComparisonBadge comparison={view.comparison} />
          {view.comparison.current.health !== "healthy" && (
            <p className="mt-1 text-[11px] text-ink-muted">{view.comparison.current.reason}</p>
          )}
        </div>
      );
    case "trend": {
      const points = view.series.points.map((p) => ({
        key: p.window.label,
        label: p.window.label,
        value: p.value,
        health: p.health,
      }));
      return (
        <ChartShell
          title={view.label}
          description="Engine values per rolling reporting period."
          unit={view.series.unit}
          points={points}
        >
          {view.chart === "sparkline" ? (
            <SparklineSvg points={points} width={220} height={40} />
          ) : (
            <LineChartSvg points={points} unit={view.series.unit} area={view.chart === "area"} />
          )}
        </ChartShell>
      );
    }
    case "breakdown": {
      const rows = view.breakdown.rows.map((r) => ({
        key: r.key,
        label: r.label,
        value: r.currentValue,
      }));
      if (view.chart === "bar") {
        return (
          <ChartShell
            title={view.label}
            description={
              view.breakdown.eligibility === "eligible"
                ? "Current window; comparison values in the data table."
                : (view.breakdown.eligibilityReason ?? "")
            }
            unit={view.breakdown.unit}
            health={view.breakdown.health}
            points={rows}
          >
            <HorizontalBarSvg rows={rows} unit={view.breakdown.unit} />
          </ChartShell>
        );
      }
      return (
        <div className="overflow-x-auto">
          <p className="text-xs uppercase tracking-wide text-ink-muted">{view.label}</p>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-medium">Group</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">Value</th>
                {view.breakdown.comparisonWindow && (
                  <th scope="col" className="py-1 text-right font-medium">Change</th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.breakdown.rows.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">
                    {row.label}
                  </th>
                  <td className="py-1 pr-2 text-right font-mono text-ink">
                    {formatMetricValue(row.currentValue, view.breakdown.unit)}
                  </td>
                  {view.breakdown.comparisonWindow && (
                    <td className="py-1 text-right font-mono text-ink-secondary">
                      {row.absoluteVariance === null
                        ? "—"
                        : `${row.absoluteVariance > 0 ? "+" : ""}${formatMetricValue(row.absoluteVariance, view.breakdown.unit)}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "goal":
      return (
        <div data-goal-status={view.progress.status}>
          <p className="text-xs uppercase tracking-wide text-ink-muted">{view.goalName}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">
            {formatMetricValue(view.progress.currentValue, view.unit)}
            <span className="ml-2 text-xs font-normal text-ink-secondary">
              {view.progress.status.replaceAll("_", " ")}
            </span>
          </p>
          <div className="mt-2">
            <GoalProgressBar
              percentToTargetBp={view.progress.percentToTargetBp}
              timeElapsedBp={view.progress.timeElapsedBp}
              label={`Progress for ${view.goalName}`}
            />
          </div>
          {view.progress.reason && (
            <p className="mt-1 text-[11px] text-ink-muted">{view.progress.reason}</p>
          )}
        </div>
      );
    case "benchmark":
      return (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">{view.benchmarkName}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">
            {formatMetricValue(view.currentValue, view.unit)}
          </p>
          <p className="text-[11px] text-ink-secondary">
            benchmark {formatMetricValue(view.benchmarkValue, view.unit)}
            {view.currentValue !== null && (
              <>
                {" · "}
                {view.currentValue === view.benchmarkValue
                  ? "matches"
                  : `${view.currentValue > view.benchmarkValue ? "+" : "−"}${formatMetricValue(Math.abs(view.currentValue - view.benchmarkValue), view.unit)}`}
              </>
            )}
          </p>
          {view.note && <p className="mt-1 text-[11px] text-ink-muted">{view.note}</p>}
        </div>
      );
    case "text":
      return <p className="whitespace-pre-wrap text-sm text-ink">{view.text}</p>;
    case "link":
      return (
        <Link href={view.path} className="text-sm font-medium text-accent hover:text-accent-strong">
          {view.label} →
        </Link>
      );
  }
}
