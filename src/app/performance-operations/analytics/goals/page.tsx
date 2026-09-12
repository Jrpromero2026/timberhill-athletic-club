import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { GoalProgressBar } from "@/components/charts/charts";
import { formatMetricValue } from "@/lib/intelligence/format";
import { METRIC_DEFINITIONS, listDefinitions } from "@/lib/intelligence/catalog";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { getMetricAnalyticsMetadata } from "@/lib/analytics/shared/metadata";
import { deriveGoalProgress } from "@/lib/analytics/goals/progress";
import { loadGoalRecords } from "@/lib/analytics/presentations/packages";
import { FinalityBadge } from "../shared/comparison-badges";
import { GoalForms, GoalRowActions } from "./goal-forms";

export const metadata: Metadata = { title: "Goals" };

/**
 * Goals: governed targets against catalog metrics. Draft → approve →
 * achieve/miss lifecycle with immutable completed history; progress is
 * engine value vs approved target, derived at read time.
 */
export default async function GoalsPage() {
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Goals" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Goals" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Goal progress is evaluated against the selected period's engine results."
        />
      </div>
    );
  }
  const { service, window, actor, organizationId, can } = context;

  const goals = await loadGoalRecords(actor, organizationId, [
    "draft", "active", "achieved", "missed", "cancelled",
  ]);

  const rows = [];
  for (const goal of goals) {
    const result =
      goal.status === "draft"
        ? null
        : await service.getMetricResult(goal.metricId, window, {
            departmentId: goal.departmentId ?? undefined,
            trainerId: goal.trainerId ?? undefined,
          });
    rows.push({
      goal,
      progress: deriveGoalProgress(goal, result, service.today),
    });
  }

  const canCreate = can("goal:create");
  const canApprove = can("goal:approve");
  const canArchive = can("goal:archive");

  // Options for the create form: target-compatible metrics only.
  const metricOptions = listDefinitions()
    .filter((d) => getMetricAnalyticsMetadata(d.id)?.targetCompatible)
    .map((d) => ({ id: d.id, name: d.name, unit: d.unit }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [departmentsRes, trainersRes] = await Promise.all([
    actor.supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    actor.supabase
      .from("trainer_organization_assignments")
      .select("trainer_id, trainers ( id, display_name )")
      .eq("organization_id", organizationId)
      .is("effective_to", null),
  ]);
  const trainers = (trainersRes.data ?? [])
    .flatMap((row) => {
      const trainer = row.trainers as unknown as { id: string; display_name: string } | null;
      return trainer ? [{ id: trainer.id, name: trainer.display_name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description={`Targets reference catalog metrics; progress compares engine results for ${window.label}.`}
        actions={<FinalityBadge window={window} />}
      />

      {canCreate && (
        <GoalForms
          organizationId={organizationId}
          metricOptions={metricOptions}
          departments={departmentsRes.data ?? []}
          trainers={trainers}
          periods={service.periods.map((p) => ({ id: p.id, label: p.label }))}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description={
            canCreate
              ? "Create a goal above — it starts as a draft and takes effect once approved."
              : "No goals are visible to you in this organization."
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="goal-list">
          {rows.map(({ goal, progress }) => {
            const unit = (METRIC_DEFINITIONS.get(goal.metricId)?.unit ?? "count") as MetricUnit;
            const target =
              goal.goalType === "range"
                ? `${formatMetricValue(goal.targetLow, unit)} – ${formatMetricValue(goal.targetHigh, unit)}`
                : goal.goalType === "improvement"
                  ? `${goal.targetValue !== null && goal.targetValue >= 0 ? "+" : ""}${formatMetricValue(goal.targetValue, unit)} vs baseline ${formatMetricValue(goal.baselineValue, unit)}`
                  : formatMetricValue(goal.targetValue, unit);
            return (
              <li
                key={goal.id}
                className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
                data-testid={`goal-${goal.id}`}
                data-goal-status={goal.status}
                data-progress-status={progress.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {goal.name}
                      <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
                        {goal.status}
                      </span>
                      <span className="rounded bg-surface-sunken px-1.5 text-[10px] uppercase text-ink-muted">
                        {goal.scopeLevel}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {METRIC_DEFINITIONS.get(goal.metricId)?.name ?? goal.metricId} ·{" "}
                      {goal.goalType} target {target} · {goal.startDate} – {goal.endDate}
                      {goal.ownerName ? ` · owner ${goal.ownerName}` : ""}
                    </p>
                  </div>
                  <GoalRowActions
                    goalId={goal.id}
                    status={goal.status}
                    canApprove={canApprove}
                    canUpdate={canCreate}
                    canArchive={canArchive}
                  />
                </div>

                {goal.status !== "draft" && (
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <GoalProgressBar
                      percentToTargetBp={progress.percentToTargetBp}
                      timeElapsedBp={progress.timeElapsedBp}
                      label={`Progress for ${goal.name}`}
                    />
                    <div className="text-right">
                      <p className="font-mono text-sm text-ink" data-testid="goal-current-value">
                        {formatMetricValue(progress.currentValue, unit)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {progress.status.replaceAll("_", " ")}
                        {progress.onTrack !== null &&
                          ` · ${progress.onTrack ? "on track (prorated)" : "behind prorated target"}`}
                      </p>
                      {progress.reason && (
                        <p className="mt-0.5 max-w-[280px] text-[11px] text-ink-muted">{progress.reason}</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-muted">
        Progress derives from engine results versus the approved target. An unavailable
        metric never counts as achieved. “On track” means only: the current value has
        reached the linearly prorated share of a minimum target — never a projection.
      </p>
    </div>
  );
}
