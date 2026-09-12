/**
 * Scorecard composition — turns a scorecard definition + analytics
 * service into rendered rows: current value, previous period, prior year,
 * goal, variance-to-goal, health, trend, finality, deep link. Pure
 * composition; unavailable items render honestly.
 */

import type { ScopeInput } from "@/lib/intelligence/service";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import { deriveGoalProgress, type GoalFacts, type GoalProgress } from "../goals/progress";
import { getMetricAnalyticsMetadata } from "../shared/metadata";
import type { AnalyticsService } from "../queries/service";
import type { AnalyticsWindow, MetricComparison } from "../shared/types";
import type { ScorecardDef } from "./definitions";

export interface ScorecardGoalRow {
  goalId: string;
  name: string;
  goalType: string;
  targetValue: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  ownerName: string | null;
  progress: GoalProgress;
}

export interface ScorecardRowView {
  metricId: string;
  label: string;
  unit: string;
  direction: string;
  current: MetricComparison["current"];
  previousPeriod: MetricComparison | null;
  priorYear: MetricComparison | null;
  goal: ScorecardGoalRow | null;
  deepLink: string;
}

export interface ScorecardSectionView {
  title: string;
  rows: ScorecardRowView[];
}

export interface ScorecardView {
  key: string;
  name: string;
  description: string;
  window: AnalyticsWindow;
  sections: ScorecardSectionView[];
}

/** Raw goal rows as loaded from performance_goals (page loads them). */
export interface GoalRecord extends GoalFacts {
  id: string;
  name: string;
  metricId: string;
  scopeLevel: string;
  departmentId: string | null;
  trainerId: string | null;
  ownerName: string | null;
}

function goalMatchesScope(goal: GoalRecord, scope: ScopeInput): boolean {
  if (scope.trainerId) {
    return goal.scopeLevel === "trainer" && goal.trainerId === scope.trainerId;
  }
  if (scope.departmentId) {
    return goal.scopeLevel === "department" && goal.departmentId === scope.departmentId;
  }
  return goal.scopeLevel === "organization";
}

export async function composeScorecard(
  service: AnalyticsService,
  definition: ScorecardDef,
  window: AnalyticsWindow,
  scope: ScopeInput,
  activeGoals: readonly GoalRecord[],
): Promise<ScorecardView> {
  const metricIds = definition.sections.flatMap((s) => s.items.map((i) => i.metricId));
  const comparisons = await service.getMultiPeriodComparison(
    metricIds,
    window,
    ["previous_period", "same_period_last_year"],
    scope,
  );

  const sections: ScorecardSectionView[] = [];
  for (const section of definition.sections) {
    const rows: ScorecardRowView[] = [];
    for (const item of section.items) {
      const [previousPeriod, priorYear] = comparisons[item.metricId] ?? [];
      const current =
        previousPeriod?.current ??
        ({
          value: null,
          health: "unavailable",
          reason: "Not evaluated.",
          window,
        } as MetricComparison["current"]);

      const goalRecord = activeGoals.find(
        (g) =>
          g.metricId === item.metricId &&
          g.status === "active" &&
          goalMatchesScope(g, scope),
      );
      let goal: ScorecardGoalRow | null = null;
      if (goalRecord) {
        const result = await service.getMetricResult(item.metricId, window, scope);
        goal = {
          goalId: goalRecord.id,
          name: goalRecord.name,
          goalType: goalRecord.goalType,
          targetValue: goalRecord.targetValue,
          targetLow: goalRecord.targetLow,
          targetHigh: goalRecord.targetHigh,
          ownerName: goalRecord.ownerName,
          progress: deriveGoalProgress(goalRecord, result, service.today),
        };
      }

      const definitionEntry = METRIC_DEFINITIONS.get(item.metricId);
      rows.push({
        metricId: item.metricId,
        label: item.label,
        unit: definitionEntry?.unit ?? "count",
        direction: getMetricAnalyticsMetadata(item.metricId)?.direction ?? "neutral",
        current,
        previousPeriod: previousPeriod ?? null,
        priorYear: priorYear ?? null,
        goal,
        deepLink: `/performance-operations/analytics/executive?metric=${item.metricId}${scope.departmentId ? `&departmentId=${scope.departmentId}` : ""}${scope.trainerId ? `&trainerId=${scope.trainerId}` : ""}`,
      });
    }
    sections.push({ title: section.title, rows });
  }

  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    window,
    sections,
  };
}
