import { formatMetricValue } from "@/lib/intelligence/format";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import type { AnalyticsWindow, MetricComparison } from "@/lib/analytics/shared/types";

/**
 * Comparison rendering — THE way a variance appears anywhere in analytics.
 * Direction meaning is text + arrow (never color alone); ineligible
 * comparisons show their reason instead of a number.
 */
export function ComparisonBadge({
  comparison,
}: {
  comparison: MetricComparison | null;
}) {
  if (!comparison) return <span className="text-xs text-ink-faint">—</span>;
  if (comparison.eligibility !== "eligible" || comparison.absoluteVariance === null) {
    return (
      <span
        className="text-xs text-ink-muted"
        title={comparison.eligibilityReason ?? undefined}
        data-comparison-eligibility={comparison.eligibility}
      >
        {comparison.eligibility === "point_in_time_metric"
          ? "point-in-time"
          : comparison.eligibility === "missing_comparison_period"
            ? "no comparison"
            : "unavailable"}
      </span>
    );
  }
  const variance = comparison.absoluteVariance;
  const arrow = variance > 0 ? "▲" : variance < 0 ? "▼" : "◆";
  const interpretation =
    comparison.interpretation === "improved"
      ? "text-positive"
      : comparison.interpretation === "declined"
        ? "text-negative"
        : "text-ink-secondary";
  const formatted = formatMetricValue(Math.abs(variance), comparison.unit as MetricUnit);
  const percent =
    comparison.percentVarianceBp !== null
      ? ` (${comparison.percentVarianceBp > 0 ? "+" : ""}${(comparison.percentVarianceBp / 100).toFixed(1)}%)`
      : "";
  return (
    <span
      className={`text-xs font-medium ${interpretation}`}
      data-comparison-eligibility="eligible"
      title={`${comparison.comparison?.window.label ?? ""}: ${formatMetricValue(comparison.comparison?.value ?? null, comparison.unit as MetricUnit)}`}
    >
      {arrow} {variance === 0 ? "no change" : `${variance > 0 ? "+" : "−"}${formatted}${percent}`}
      {comparison.interpretation && (
        <span className="sr-only">
          {" "}
          ({comparison.interpretation})
        </span>
      )}
    </span>
  );
}

export function FinalityBadge({ window }: { window: AnalyticsWindow }) {
  return window.finality === "final" ? (
    <span
      className="rounded bg-positive-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-positive"
      data-finality="final"
    >
      final
    </span>
  ) : (
    <span
      className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning"
      data-finality="not_final"
    >
      not final{window.partial ? " · in progress" : ""}
    </span>
  );
}
