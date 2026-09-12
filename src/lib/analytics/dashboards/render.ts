/**
 * Dashboard widget resolution — turns a stored widget row into a
 * presentation view FOR THE CURRENT VIEWER. Stored config is re-validated
 * on every render; every data reference resolves through the analytics
 * service (metrics/comparisons/trends), goal progress derivation, or
 * RLS-guarded reads (goals/benchmarks) — an inaccessible or invalid
 * widget renders unavailable with a reason, never partial data.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import type { BreakdownGroup } from "@/lib/intelligence/shared/breakdowns";
import { deriveGoalProgress, type GoalProgress } from "../goals/progress";
import type { GoalRecord } from "../scorecards/compose";
import type { AnalyticsService } from "../queries/service";
import type {
  AnalyticsWindow,
  BreakdownComparison,
  MetricComparison,
  MetricSeries,
} from "../shared/types";
import { validateWidgetConfig } from "./widgets";

export type WidgetView =
  | { kind: "unavailable"; reason: string }
  | { kind: "metric"; label: string; unit: MetricUnit; comparison: MetricComparison }
  | { kind: "comparison"; label: string; unit: MetricUnit; comparison: MetricComparison }
  | { kind: "trend"; label: string; series: MetricSeries; chart: string }
  | {
      kind: "breakdown";
      label: string;
      chart: "table" | "bar";
      breakdown: BreakdownComparison;
    }
  | {
      kind: "goal";
      label: string;
      unit: MetricUnit;
      goalName: string;
      progress: GoalProgress;
    }
  | {
      kind: "benchmark";
      label: string;
      unit: MetricUnit;
      benchmarkName: string;
      benchmarkValue: number;
      currentValue: number | null;
      note: string | null;
    }
  | { kind: "text"; text: string }
  | { kind: "link"; label: string; path: string };

interface WidgetConfigShape {
  metricId?: string;
  comparison?: string;
  granularity?: "daily" | "weekly" | "monthly" | "quarterly";
  chart?: string;
  groupBy?: string;
  goalId?: string;
  benchmarkId?: string;
  text?: string;
  label?: string;
  path?: string;
  limit?: number;
  scope?: { departmentId?: string; trainerId?: string; serviceId?: string };
}

export async function renderDashboardWidget(
  service: AnalyticsService,
  actor: ActorContext,
  window: AnalyticsWindow,
  widget: Tables<"analytics_dashboard_widgets">,
  goals: readonly GoalRecord[],
): Promise<WidgetView> {
  const validation = validateWidgetConfig(widget.widget_type, widget.config);
  if (!validation.ok) {
    return { kind: "unavailable", reason: `Invalid widget configuration: ${validation.error}` };
  }
  const config = (widget.config ?? {}) as WidgetConfigShape;
  const scope = config.scope ?? {};

  switch (widget.widget_type) {
    case "metric":
    case "comparison": {
      const metricId = config.metricId!;
      const definition = METRIC_DEFINITIONS.get(metricId);
      if (!definition) return { kind: "unavailable", reason: `Unknown metric ${metricId}.` };
      const comparison = await service.getMetricComparison(
        metricId,
        window,
        (config.comparison as never) ?? "previous_period",
        scope,
      );
      return {
        kind: widget.widget_type === "metric" ? "metric" : "comparison",
        label: definition.name,
        unit: definition.unit,
        comparison,
      };
    }
    case "trend": {
      const metricId = config.metricId!;
      const definition = METRIC_DEFINITIONS.get(metricId);
      if (!definition) return { kind: "unavailable", reason: `Unknown metric ${metricId}.` };
      // Trend buckets inside the window at the configured granularity.
      const rolling = service.rollingPeriods(window, 6);
      const windows = rolling.ok ? [...rolling.windows].reverse() : [window];
      const series = await service.getMetricSeries(metricId, windows, scope);
      return {
        kind: "trend",
        label: definition.name,
        series,
        chart: config.chart ?? "line",
      };
    }
    case "breakdown_table":
    case "breakdown_chart": {
      const metricId = config.metricId!;
      const definition = METRIC_DEFINITIONS.get(metricId);
      if (!definition) return { kind: "unavailable", reason: `Unknown metric ${metricId}.` };
      const breakdown = await service.getBreakdownComparison(
        metricId,
        config.groupBy as BreakdownGroup,
        window,
        (config.comparison as never) ?? null,
        scope,
      );
      const limited = config.limit
        ? { ...breakdown, rows: breakdown.rows.slice(0, config.limit) }
        : breakdown;
      return {
        kind: "breakdown",
        label: `${definition.name} by ${config.groupBy}`,
        chart: widget.widget_type === "breakdown_table" ? "table" : "bar",
        breakdown: limited,
      };
    }
    case "goal_progress": {
      const goal = goals.find((g) => g.id === (widget.goal_id ?? config.goalId));
      if (!goal) {
        return {
          kind: "unavailable",
          reason: "The referenced goal is not visible to you or no longer exists.",
        };
      }
      const result = await service.getMetricResult(goal.metricId, window, {
        departmentId: goal.departmentId ?? undefined,
        trainerId: goal.trainerId ?? undefined,
      });
      return {
        kind: "goal",
        label: METRIC_DEFINITIONS.get(goal.metricId)?.name ?? goal.metricId,
        unit: (goal.metricUnit ?? "count") as MetricUnit,
        goalName: goal.name,
        progress: deriveGoalProgress(goal, result, service.today),
      };
    }
    case "benchmark_comparison": {
      const benchmarkId = widget.benchmark_id ?? config.benchmarkId;
      const { data: benchmark } = await actor.supabase
        .from("performance_benchmarks")
        .select("*")
        .eq("id", benchmarkId ?? "")
        .maybeSingle();
      if (!benchmark) {
        return {
          kind: "unavailable",
          reason: "The referenced benchmark is not visible to you or no longer exists.",
        };
      }
      if (benchmark.status !== "approved") {
        return { kind: "unavailable", reason: "Comparisons use approved benchmarks only." };
      }
      const result = await service.getMetricResult(benchmark.metric_id, window, {
        departmentId: benchmark.department_id ?? undefined,
        trainerId: benchmark.trainer_id ?? undefined,
      });
      return {
        kind: "benchmark",
        label: METRIC_DEFINITIONS.get(benchmark.metric_id)?.name ?? benchmark.metric_id,
        unit: (benchmark.metric_unit ?? "count") as MetricUnit,
        benchmarkName: benchmark.name,
        benchmarkValue: benchmark.value,
        currentValue: result.value,
        note: result.value === null ? (result.reasons[0] ?? "Value unavailable.") : null,
      };
    }
    case "readiness": {
      const comparison = await service.getMetricComparison(
        "organization_readiness_bp",
        window,
        "previous_period",
        scope,
      );
      return {
        kind: "metric",
        label: "Organization readiness",
        unit: "rate_bp",
        comparison,
      };
    }
    case "text_note":
      return { kind: "text", text: config.text ?? "" };
    case "report_link":
      return { kind: "link", label: config.label ?? "Report", path: config.path ?? "/performance-operations/reports" };
    case "scorecard":
    case "cohort_table":
    case "cohort_heatmap":
    case "executive_summary":
    case "operational_alert":
      return {
        kind: "link",
        label:
          widget.widget_type === "scorecard"
            ? "Open scorecards"
            : widget.widget_type.startsWith("cohort")
              ? "Open cohort analysis"
              : "Open the executive overview",
        path:
          widget.widget_type === "scorecard"
            ? "/performance-operations/analytics/scorecards"
            : widget.widget_type.startsWith("cohort")
              ? "/performance-operations/analytics/cohorts"
              : "/performance-operations/overview",
      };
    default:
      return { kind: "unavailable", reason: `Unknown widget type ${widget.widget_type}.` };
  }
}
