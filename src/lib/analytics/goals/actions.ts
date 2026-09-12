"use server";

/**
 * Goal server actions. Every mutation re-derives the actor, validates the
 * metric against the LIVE catalog (id, version, unit, target
 * compatibility), and validates scope server-side; the database trigger +
 * RLS enforce lifecycle, immutability, and department/self scope again
 * underneath. Baselines are source-backed: computed from the engine for
 * the named baseline period at creation time, never typed in.
 */

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  writeAudit,
  actorCan,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "@/lib/actions/shared";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { getMetricAnalyticsMetadata } from "../shared/metadata";

const GOAL_TYPES = ["minimum", "maximum", "exact", "range", "maintain", "improvement"] as const;
const CADENCES = ["period", "monthly", "quarterly", "fiscal_year"] as const;

function parseIntegerField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function createGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!actorCan(actor, organizationId, "goal:create")) return PERMISSION_DENIED;

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the goal a name (max 120 characters)." };

  const metricId = String(formData.get("metricId") ?? "");
  const definition = METRIC_DEFINITIONS.get(metricId);
  if (!definition) return { error: "Unknown metric — goals must reference a catalog metric." };
  const metadata = getMetricAnalyticsMetadata(metricId);
  if (!metadata?.targetCompatible) {
    return { error: `${definition.name} does not support targets (unit ${definition.unit}).` };
  }

  const goalType = String(formData.get("goalType") ?? "");
  if (!GOAL_TYPES.includes(goalType as (typeof GOAL_TYPES)[number])) {
    return { error: "Choose a goal type." };
  }
  const cadence = String(formData.get("cadence") ?? "period");
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    return { error: "Choose a measurement cadence." };
  }

  const scopeLevel = String(formData.get("scopeLevel") ?? "organization");
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  const trainerId = String(formData.get("trainerId") ?? "") || null;
  const serviceId = String(formData.get("serviceId") ?? "") || null;
  if (scopeLevel === "department" && !departmentId) return { error: "Choose the department." };
  if (scopeLevel === "trainer" && !trainerId) return { error: "Choose the trainer." };
  if (scopeLevel === "service" && !serviceId) return { error: "Choose the service." };

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "Start and end dates are required." };
  }
  if (startDate > endDate) return { error: "The goal window ends before it starts." };

  const targetValue = parseIntegerField(formData.get("targetValue"));
  const targetLow = parseIntegerField(formData.get("targetLow"));
  const targetHigh = parseIntegerField(formData.get("targetHigh"));
  if (goalType === "range") {
    if (targetLow === null || targetHigh === null || targetLow > targetHigh) {
      return { error: "Range goals need a low and high bound (low ≤ high)." };
    }
  } else if (targetValue === null) {
    return {
      error:
        "Enter the target in the metric's native unit (currency in integer cents; rates in basis points).",
    };
  }

  // Baseline: maintain/improvement goals must cite a reporting period; the
  // baseline VALUE comes from the engine — source-backed, never typed in.
  let baselinePeriodId: string | null = null;
  let baselineValue: number | null = null;
  if (goalType === "maintain" || goalType === "improvement") {
    baselinePeriodId = String(formData.get("baselinePeriodId") ?? "") || null;
    if (!baselinePeriodId) return { error: "Baseline goals need a baseline reporting period." };
    const { data: period } = await actor.supabase
      .from("reporting_periods")
      .select("id, start_date, end_date")
      .eq("id", baselinePeriodId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!period) return { error: "Baseline period not found in this organization." };
    const session = await IntelligenceSession.create(
      actor, organizationId, period.start_date, period.end_date,
    );
    const result = session.getMetric(metricId, {
      departmentId: departmentId ?? undefined,
      trainerId: trainerId ?? undefined,
      serviceId: serviceId ?? undefined,
    });
    if (result.value === null || !["healthy", "incomplete"].includes(result.health)) {
      return {
        error: `The baseline is not source-backed: ${result.reasons[0] ?? "the metric is unavailable for the baseline period."}`,
      };
    }
    baselineValue = result.value;
  }

  const { data: created, error } = await actor.supabase
    .from("performance_goals")
    .insert({
      organization_id: organizationId,
      name,
      metric_id: metricId,
      metric_version: definition.version,
      metric_unit: definition.unit,
      scope_level: scopeLevel,
      department_id: scopeLevel === "organization" ? null : departmentId,
      trainer_id: scopeLevel === "trainer" ? trainerId : null,
      service_id: scopeLevel === "service" ? serviceId : null,
      goal_type: goalType,
      target_value: goalType === "range" ? null : targetValue,
      target_low: goalType === "range" ? targetLow : null,
      target_high: goalType === "range" ? targetHigh : null,
      baseline_period_id: baselinePeriodId,
      baseline_value: baselineValue,
      reporting_period_id: String(formData.get("reportingPeriodId") ?? "") || null,
      start_date: startDate,
      end_date: endDate,
      measurement_cadence: cadence,
      owner_id: String(formData.get("ownerId") ?? "") || actor.userId,
      notes: String(formData.get("notes") ?? "").trim() || null,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { error: `Could not create the goal (${error?.message ?? "unknown error"}).` };
  }
  await writeAudit(actor, {
    organizationId,
    entityType: "performance_goal",
    entityId: created.id,
    action: "goal_created",
    metadata: { metric_id: metricId, goal_type: goalType, scope_level: scopeLevel },
  });
  revalidatePath("/performance-operations/analytics/goals");
  return { message: "Goal created as a draft — it takes effect when approved." };
}

async function transitionGoal(
  goalId: string,
  toStatus: "active" | "achieved" | "missed" | "cancelled" | "archived",
  auditAction: string,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const { data: goal } = await actor.supabase
    .from("performance_goals")
    .select("id, organization_id, status")
    .eq("id", goalId)
    .maybeSingle();
  if (!goal) return { error: "Goal not found." };
  const { error } = await actor.supabase
    .from("performance_goals")
    .update({ status: toStatus })
    .eq("id", goalId)
    .eq("status", goal.status);
  if (error) {
    return { error: friendlyGoalError(error.message) };
  }
  await writeAudit(actor, {
    organizationId: goal.organization_id,
    entityType: "performance_goal",
    entityId: goalId,
    action: auditAction,
    metadata: { from_status: goal.status, to_status: toStatus },
  });
  revalidatePath("/performance-operations/analytics/goals");
  return { message: `Goal ${toStatus === "active" ? "approved" : toStatus}.` };
}

function friendlyGoalError(message: string): string {
  if (message.includes("goal_forbidden")) {
    return "You do not have the permission this transition requires.";
  }
  if (message.includes("goal_immutable")) {
    return "Completed goals are immutable — create a new goal instead.";
  }
  if (message.includes("goal_transition_invalid")) {
    return "That status change is not allowed from the goal's current state.";
  }
  return `Could not update the goal (${message.slice(0, 120)}).`;
}

export async function approveGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionGoal(String(formData.get("goalId") ?? ""), "active", "goal_approved");
}

export async function completeGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "achieved" && outcome !== "missed") {
    return { error: "Record the outcome as achieved or missed." };
  }
  return transitionGoal(
    String(formData.get("goalId") ?? ""),
    outcome,
    `goal_${outcome}`,
  );
}

export async function cancelGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionGoal(String(formData.get("goalId") ?? ""), "cancelled", "goal_cancelled");
}

export async function archiveGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionGoal(String(formData.get("goalId") ?? ""), "archived", "goal_archived");
}

export async function updateGoalTargetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const goalId = String(formData.get("goalId") ?? "");
  const { data: goal } = await actor.supabase
    .from("performance_goals")
    .select("id, organization_id, goal_type, status, target_value, target_low, target_high")
    .eq("id", goalId)
    .maybeSingle();
  if (!goal) return { error: "Goal not found." };
  if (goal.status !== "draft") {
    return { error: "Targets change only while the goal is a draft." };
  }
  const targetValue = parseIntegerField(formData.get("targetValue"));
  const targetLow = parseIntegerField(formData.get("targetLow"));
  const targetHigh = parseIntegerField(formData.get("targetHigh"));
  const patch =
    goal.goal_type === "range"
      ? { target_low: targetLow, target_high: targetHigh }
      : { target_value: targetValue };
  if (goal.goal_type === "range") {
    if (targetLow === null || targetHigh === null || targetLow > targetHigh) {
      return { error: "Range goals need a low and high bound (low ≤ high)." };
    }
  } else if (targetValue === null) {
    return { error: "Enter the new target in the metric's native unit." };
  }
  const { error } = await actor.supabase
    .from("performance_goals")
    .update(patch)
    .eq("id", goalId)
    .eq("status", "draft");
  if (error) return { error: friendlyGoalError(error.message) };
  await writeAudit(actor, {
    organizationId: goal.organization_id,
    entityType: "performance_goal",
    entityId: goalId,
    action: "goal_target_changed",
    metadata: {
      from: goal.goal_type === "range" ? `${goal.target_low}–${goal.target_high}` : String(goal.target_value),
      to: goal.goal_type === "range" ? `${targetLow}–${targetHigh}` : String(targetValue),
    },
  });
  revalidatePath("/performance-operations/analytics/goals");
  return { message: "Target updated." };
}
