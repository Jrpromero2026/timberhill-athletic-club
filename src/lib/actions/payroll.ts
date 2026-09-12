"use server";

import { revalidatePath } from "next/cache";
import type { Tables, TablesUpdate } from "@/lib/supabase/types";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "@/lib/actions/shared";
import { calculatePayroll } from "@/lib/payroll/engine";
import { loadEngineData, persistEngineResult } from "@/lib/payroll/run";
import { CALCULATION_VERSION } from "@/lib/payroll/types";
import { notifyPermissionHolders } from "@/lib/operations/notify";

const PAYROLL_PATH = "/performance-operations/payroll";

type PayrollRun = Tables<"payroll_runs">;

function revalidateRun(runId: string): void {
  revalidatePath(PAYROLL_PATH);
  revalidatePath(`${PAYROLL_PATH}/${runId}`);
  revalidatePath(`${PAYROLL_PATH}/${runId}/review`);
  revalidatePath(`${PAYROLL_PATH}/${runId}/statements`);
}

async function loadRun(
  actor: ActorContext,
  runId: string,
): Promise<PayrollRun | null> {
  const { data } = await actor.supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  return data;
}

/**
 * Guarded status transition. The database trigger enforces the same matrix;
 * this surfaces a readable error and records the run event.
 */
async function transitionRun(
  actor: ActorContext,
  run: PayrollRun,
  toStatus: string,
  extra: TablesUpdate<"payroll_runs"> = {},
  reason: string | null = null,
): Promise<string | null> {
  const { error } = await actor.supabase
    .from("payroll_runs")
    .update({ status: toStatus, ...extra })
    .eq("id", run.id)
    .eq("status", run.status); // optimistic concurrency: no double transitions
  if (error) {
    return `Cannot move this run from '${run.status}' to '${toStatus}'.`;
  }
  await actor.supabase.from("payroll_run_events").insert({
    payroll_run_id: run.id,
    organization_id: run.organization_id,
    from_status: run.status,
    to_status: toStatus,
    actor_id: actor.userId,
    reason,
  });
  return null;
}

/* -------------------------------------------------------------- creation */

export async function createPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const periodId = String(formData.get("reporting_period_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!organizationId || !periodId || name.length < 3) {
    return { error: "Provide an organization, a reporting period, and a name (min 3 characters)." };
  }
  if (!actorCan(actor, organizationId, "payroll:create")) return PERMISSION_DENIED;

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status, label")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.organization_id !== organizationId) {
    return { error: "Reporting period not found in this organization." };
  }
  if (period.status === "locked") {
    return { error: "This reporting period is locked; payroll cannot be prepared for it." };
  }

  const { data: created, error } = await actor.supabase
    .from("payroll_runs")
    .insert({
      organization_id: organizationId,
      reporting_period_id: periodId,
      name,
      calculation_version: CALCULATION_VERSION,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "An active payroll run already exists for this period. Void or supersede it first.",
      };
    }
    return { error: "Could not create the payroll run." };
  }

  await actor.supabase.from("payroll_run_events").insert({
    payroll_run_id: created.id,
    organization_id: organizationId,
    from_status: null,
    to_status: "draft",
    actor_id: actor.userId,
  });
  await writeAudit(actor, {
    organizationId,
    entityType: "payroll_run",
    entityId: created.id,
    action: "payroll_run_created",
    metadata: { name, reporting_period_id: periodId },
  });
  revalidatePath(PAYROLL_PATH);
  return { message: "Payroll run created.", data: { runId: created.id } };
}

/* ----------------------------------------------------------- calculation */

export async function calculatePayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const refreshCutoff = formData.get("refresh_cutoff") === "true";
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Payroll run not found." };
  if (!actorCan(actor, run.organization_id, "payroll:calculate")) {
    return PERMISSION_DENIED;
  }
  if (!["draft", "needs_review", "reopened", "failed"].includes(run.status)) {
    return { error: `A run in status '${run.status}' cannot be calculated.` };
  }

  // Freeze the appointment cutoff on first calculation; later runs keep it
  // unless the operator explicitly refreshes (late-arrival handling).
  const cutoffAt =
    refreshCutoff || !run.source_appointment_cutoff_at
      ? new Date().toISOString()
      : run.source_appointment_cutoff_at;

  const transitionError = await transitionRun(actor, run, "calculating", {
    source_appointment_cutoff_at: cutoffAt,
    calculation_started_at: new Date().toISOString(),
  });
  if (transitionError) return { error: transitionError };
  const calculatingRun = { ...run, status: "calculating", source_appointment_cutoff_at: cutoffAt };

  try {
    const loaded = await loadEngineData(actor, calculatingRun, cutoffAt);
    const result = calculatePayroll(loaded.input);
    await persistEngineResult(
      actor,
      calculatingRun,
      result,
      loaded.loaderIssues,
      loaded.lateAppointmentCount,
      { timeEntryIds: loaded.timeEntryIds, adjustmentIds: loaded.adjustmentIds },
    );
    const finishError = await transitionRun(actor, calculatingRun, "needs_review");
    if (finishError) return { error: finishError };
    await writeAudit(actor, {
      organizationId: run.organization_id,
      entityType: "payroll_run",
      entityId: run.id,
      action: "payroll_run_calculated",
      metadata: {
        calculation_version: result.calculationVersion,
        trainer_count: result.runTotals.trainerCount,
        appointment_count: result.runTotals.appointmentCount,
        blocking_issues: result.runTotals.blockingIssueCount,
      },
    });
    revalidateRun(run.id);
    return {
      message: `Calculation complete: ${result.runTotals.trainerCount} trainer(s), ${result.runTotals.appointmentCount} appointment(s).`,
    };
  } catch (error) {
    // Sanitized failure: never leak raw amounts or SQL into the run record.
    const code =
      error instanceof Error && /^[a-z0-9_:.-]+$/i.test(error.message.split(":")[0])
        ? error.message.split(":")[0].slice(0, 64)
        : "calculation_failed";
    await actor.supabase
      .from("payroll_runs")
      .update({
        status: "failed",
        failure_code: code,
        sanitized_failure_message:
          "Calculation failed and made no partial payments. Fix the underlying issue and recalculate.",
      })
      .eq("id", run.id)
      .eq("status", "calculating");
    await actor.supabase.from("payroll_run_events").insert({
      payroll_run_id: run.id,
      organization_id: run.organization_id,
      from_status: "calculating",
      to_status: "failed",
      actor_id: actor.userId,
      reason: code,
    });
    console.error("payroll_calculation_failed", run.id, error);
    revalidateRun(run.id);
    return { error: "Calculation failed. The run is marked failed; see its failure code." };
  }
}

/* ------------------------------------------------------ review workflow */

export async function markTrainerReviewed(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const summaryId = String(formData.get("summary_id") ?? "");
  const reviewed = formData.get("reviewed") === "true";
  const { data: summary } = await actor.supabase
    .from("payroll_trainer_summaries")
    .select("id, organization_id, payroll_run_id")
    .eq("id", summaryId)
    .maybeSingle();
  if (!summary) return { error: "Trainer summary not found." };
  if (!actorCan(actor, summary.organization_id, "payroll:review")) {
    return PERMISSION_DENIED;
  }
  const { error } = await actor.supabase
    .from("payroll_trainer_summaries")
    .update(
      reviewed
        ? { review_status: "reviewed", reviewed_by: actor.userId, reviewed_at: new Date().toISOString() }
        : { review_status: "unreviewed", reviewed_by: null, reviewed_at: null },
    )
    .eq("id", summaryId);
  if (error) return { error: "Could not update the review status." };
  revalidateRun(summary.payroll_run_id);
  return { message: reviewed ? "Trainer marked reviewed." : "Review mark removed." };
}

export async function resolvePayrollIssue(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const issueId = String(formData.get("issue_id") ?? "");
  const resolution = String(formData.get("resolution") ?? ""); // resolved | acknowledged
  const reason = String(formData.get("reason") ?? "").trim();
  if (!["resolved", "acknowledged"].includes(resolution)) {
    return { error: "Unknown resolution." };
  }
  if (reason.length < 5) {
    return { error: "A reason (min 5 characters) is required." };
  }
  const { data: issue } = await actor.supabase
    .from("payroll_issues")
    .select("id, organization_id, payroll_run_id, severity, resolution_status")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) return { error: "Issue not found." };
  if (!actorCan(actor, issue.organization_id, "payroll:review")) {
    return PERMISSION_DENIED;
  }
  if (issue.severity === "blocking" && resolution === "acknowledged") {
    return {
      error:
        "Blocking issues cannot be acknowledged away — fix the configuration and recalculate, or record an explicit resolution.",
    };
  }
  const { error } = await actor.supabase
    .from("payroll_issues")
    .update({
      resolution_status: resolution,
      resolution_reason: reason,
      resolved_by: actor.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", issueId);
  if (error) return { error: "Could not update the issue." };

  // Keep the run's blocking counter honest.
  if (issue.severity === "blocking") {
    const { count } = await actor.supabase
      .from("payroll_issues")
      .select("id", { count: "exact", head: true })
      .eq("payroll_run_id", issue.payroll_run_id)
      .eq("severity", "blocking")
      .eq("resolution_status", "open");
    await actor.supabase
      .from("payroll_runs")
      .update({ blocking_issue_count: count ?? 0 })
      .eq("id", issue.payroll_run_id);
  }
  await writeAudit(actor, {
    organizationId: issue.organization_id,
    entityType: "payroll_issue",
    entityId: issue.id,
    action: `payroll_issue_${resolution}`,
    metadata: { reason, severity: issue.severity },
  });
  revalidateRun(issue.payroll_run_id);
  return { message: `Issue ${resolution}.` };
}

export async function submitRunForApproval(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const run = await loadRun(actor, String(formData.get("run_id") ?? ""));
  if (!run) return { error: "Payroll run not found." };
  if (!actorCan(actor, run.organization_id, "payroll:review")) return PERMISSION_DENIED;
  if (run.status !== "needs_review") {
    return { error: `Only runs in review can be submitted (current: '${run.status}').` };
  }

  const { count: openBlocking } = await actor.supabase
    .from("payroll_issues")
    .select("id", { count: "exact", head: true })
    .eq("payroll_run_id", run.id)
    .eq("severity", "blocking")
    .eq("resolution_status", "open");
  if ((openBlocking ?? 0) > 0) {
    return { error: `${openBlocking} blocking issue(s) remain open. Resolve them first.` };
  }
  const { count: unreviewed } = await actor.supabase
    .from("payroll_trainer_summaries")
    .select("id", { count: "exact", head: true })
    .eq("payroll_run_id", run.id)
    .eq("review_status", "unreviewed");
  if ((unreviewed ?? 0) > 0) {
    return { error: `${unreviewed} trainer summar(ies) are not reviewed yet.` };
  }

  const transitionError = await transitionRun(actor, run, "ready_for_approval", {
    reviewed_by: actor.userId,
    reviewed_at: new Date().toISOString(),
  });
  if (transitionError) return { error: transitionError };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "payroll_run",
    entityId: run.id,
    action: "payroll_run_submitted_for_approval",
  });
  revalidateRun(run.id);
  return { message: "Run submitted for approval." };
}

export async function approvePayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const run = await loadRun(actor, String(formData.get("run_id") ?? ""));
  if (!run) return { error: "Payroll run not found." };
  if (!actorCan(actor, run.organization_id, "payroll:approve")) return PERMISSION_DENIED;
  if (run.status !== "ready_for_approval") {
    return { error: `Only runs ready for approval can be approved (current: '${run.status}').` };
  }
  const transitionError = await transitionRun(actor, run, "approved", {
    approved_by: actor.userId,
    approved_at: new Date().toISOString(),
  });
  if (transitionError) return { error: transitionError };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "payroll_run",
    entityId: run.id,
    action: "payroll_run_approved",
    metadata: { final_total_cents: run.final_compensation_total_cents },
  });
  await notifyPermissionHolders(actor, run.organization_id, "payroll:post", {
    category: "payroll",
    title: `Payroll approved: ${run.name}`,
    body: "The run is approved and can now be posted.",
    linkPath: `${PAYROLL_PATH}/${run.id}`,
    entityType: "payroll_run",
    entityId: run.id,
  });
  revalidateRun(run.id);
  return { message: "Run approved. It can now be posted." };
}

export async function returnRunToReview(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const run = await loadRun(actor, String(formData.get("run_id") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!run) return { error: "Payroll run not found." };
  if (!actorCan(actor, run.organization_id, "payroll:review")) return PERMISSION_DENIED;
  if (!["ready_for_approval", "approved"].includes(run.status)) {
    return { error: `A run in status '${run.status}' cannot be returned to review.` };
  }
  if (reason.length < 5) return { error: "A reason (min 5 characters) is required." };
  const transitionError = await transitionRun(
    actor,
    run,
    "needs_review",
    { approved_by: null, approved_at: null },
    reason,
  );
  if (transitionError) return { error: transitionError };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "payroll_run",
    entityId: run.id,
    action: "payroll_run_returned_to_review",
    metadata: { reason, from_status: run.status },
  });
  revalidateRun(run.id);
  return { message: "Run returned to review." };
}

/* --------------------------------------- posting / locking / reopening */

async function runRpc(
  formData: FormData,
  permission: "payroll:post" | "payroll:lock" | "payroll:reopen" | "payroll:void",
  invoke: (
    actor: ActorContext,
    runId: string,
    reason: string,
  ) => Promise<{ error: { message: string } | null; data?: unknown }>,
  successMessage: string,
  requireReason: boolean,
  onSuccess?: (actor: ActorContext, run: PayrollRun, reason: string) => Promise<void>,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Payroll run not found." };
  if (!actorCan(actor, run.organization_id, permission)) return PERMISSION_DENIED;
  if (requireReason && reason.length < 5) {
    return { error: "A reason (min 5 characters) is required." };
  }
  const { error } = await invoke(actor, runId, reason);
  if (error) {
    const code = error.message.split(":")[0];
    const friendly: Record<string, string> = {
      payroll_not_approved: "The run must be approved before posting.",
      payroll_blocking_issues_remain: "Open blocking issues prevent posting.",
      payroll_lock_requires_posted: "Only posted runs can be locked.",
      payroll_reopen_requires_posted_or_locked: "Only posted or locked runs can be reopened.",
      payroll_supersede_requires_posted_or_locked:
        "Only posted or locked runs can be superseded.",
      payroll_void_invalid_state: "This run's status does not allow voiding.",
    };
    return { error: friendly[code] ?? `Operation failed (${code}).` };
  }
  if (onSuccess) await onSuccess(actor, run, reason);
  revalidateRun(runId);
  return { message: successMessage };
}

export async function postPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runRpc(
    formData,
    "payroll:post",
    async (actor, runId) =>
      actor.supabase.rpc("post_payroll_run", { p_run_id: runId }),
    "Run posted. Calculation results are now frozen and statements are final.",
    false,
    async (actor, run) => {
      await notifyPermissionHolders(actor, run.organization_id, "payroll:approve", {
        category: "payroll",
        title: `Payroll posted: ${run.name}`,
        body: "Results are frozen; statements are final.",
        linkPath: `${PAYROLL_PATH}/${run.id}/statements`,
        entityType: "payroll_run",
        entityId: run.id,
      });
      // Trainers with a linked login get their statement notification.
      const { data: summaries } = await actor.supabase
        .from("payroll_trainer_summaries")
        .select("trainer_id, trainers ( profile_id )")
        .eq("payroll_run_id", run.id);
      const rows = (summaries ?? []).flatMap((s) => {
        const trainer = s.trainers as unknown as { profile_id: string | null } | null;
        if (!trainer?.profile_id || trainer.profile_id === actor.userId) return [];
        return [
          {
            recipient_id: trainer.profile_id,
            organization_id: run.organization_id,
            category: "payroll",
            title: "Your payroll statement is ready",
            body: `${run.name} was posted.`,
            link_path: `${PAYROLL_PATH}/${run.id}/statements/${s.trainer_id}`,
            entity_type: "payroll_run",
            entity_id: run.id,
            actor_id: actor.userId,
          },
        ];
      });
      if (rows.length > 0) {
        await actor.supabase.from("notifications").insert(rows);
      }
    },
  );
}

export async function lockPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runRpc(
    formData,
    "payroll:lock",
    async (actor, runId, reason) =>
      actor.supabase.rpc("lock_payroll_run", { p_run_id: runId, p_reason: reason }),
    "Run locked.",
    false,
  );
}

export async function reopenPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runRpc(
    formData,
    "payroll:reopen",
    async (actor, runId, reason) =>
      actor.supabase.rpc("reopen_payroll_run", { p_run_id: runId, p_reason: reason }),
    "Run reopened. It must be recalculated, re-reviewed, and re-posted.",
    true,
    async (actor, run, reason) => {
      await notifyPermissionHolders(actor, run.organization_id, "payroll:review", {
        category: "payroll",
        severity: "warning",
        title: `Payroll reopened: ${run.name}`,
        body: `Reason: ${reason}. The run must be recalculated and re-posted.`,
        linkPath: `${PAYROLL_PATH}/${run.id}`,
        entityType: "payroll_run",
        entityId: run.id,
      });
    },
  );
}

export async function voidPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runRpc(
    formData,
    "payroll:void",
    async (actor, runId, reason) =>
      actor.supabase.rpc("void_payroll_run", { p_run_id: runId, p_reason: reason }),
    "Run voided.",
    true,
  );
}

export async function supersedePayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runRpc(
    formData,
    "payroll:reopen",
    async (actor, runId, reason) =>
      actor.supabase.rpc("supersede_payroll_run", { p_run_id: runId, p_reason: reason }),
    "Run superseded. A fresh draft run was created for the period.",
    true,
  );
}

/* ------------------------------------- multi-trainer session assignments */

export async function addTrainerAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const trainerId = String(formData.get("trainer_id") ?? "");
  const role = String(formData.get("role") ?? "primary");
  const minutesRaw = String(formData.get("compensated_minutes") ?? "").trim();
  const { data: appointment } = await actor.supabase
    .from("appointments")
    .select("id, organization_id, trainer_id, duration_minutes")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  if (!actorCan(actor, appointment.organization_id, "payroll:calculate")) {
    return PERMISSION_DENIED;
  }
  const compensatedMinutes = minutesRaw === "" ? null : Number.parseInt(minutesRaw, 10);
  if (compensatedMinutes !== null && (!Number.isInteger(compensatedMinutes) || compensatedMinutes < 0)) {
    return { error: "Compensated minutes must be a non-negative whole number." };
  }

  // First explicit assignment replaces the implicit primary — make the
  // implicit one explicit so the participation set stays complete.
  const { count } = await actor.supabase
    .from("appointment_trainer_assignments")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", appointmentId)
    .eq("status", "active");
  if ((count ?? 0) === 0 && !(trainerId === appointment.trainer_id && role === "primary")) {
    await actor.supabase.from("appointment_trainer_assignments").insert({
      appointment_id: appointmentId,
      organization_id: appointment.organization_id,
      trainer_id: appointment.trainer_id,
      role: "primary",
      source: "manual",
      confirmed_by: actor.userId,
      confirmed_at: new Date().toISOString(),
    });
  }

  const { error } = await actor.supabase.from("appointment_trainer_assignments").insert({
    appointment_id: appointmentId,
    organization_id: appointment.organization_id,
    trainer_id: trainerId,
    role,
    compensated_minutes: compensatedMinutes,
    source: "manual",
    confirmed_by: actor.userId,
    confirmed_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That trainer already has this role on the appointment." };
    }
    return { error: "Could not add the trainer assignment." };
  }
  await writeAudit(actor, {
    organizationId: appointment.organization_id,
    entityType: "appointment_trainer_assignment",
    entityId: appointmentId,
    action: "appointment_trainer_assigned",
    metadata: { trainer_id: trainerId, role },
  });
  revalidatePath("/performance-operations/appointments");
  revalidatePath(`/performance-operations/appointments/${appointmentId}`);
  return { message: "Trainer assignment added." };
}

export async function removeTrainerAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const { data: assignment } = await actor.supabase
    .from("appointment_trainer_assignments")
    .select("id, organization_id, appointment_id, trainer_id, role")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found." };
  if (!actorCan(actor, assignment.organization_id, "payroll:calculate")) {
    return PERMISSION_DENIED;
  }
  const { error } = await actor.supabase
    .from("appointment_trainer_assignments")
    .update({ status: "removed" })
    .eq("id", assignmentId);
  if (error) return { error: "Could not remove the assignment." };
  await writeAudit(actor, {
    organizationId: assignment.organization_id,
    entityType: "appointment_trainer_assignment",
    entityId: assignment.id,
    action: "appointment_trainer_unassigned",
    metadata: { trainer_id: assignment.trainer_id, role: assignment.role },
  });
  revalidatePath("/performance-operations/appointments");
  revalidatePath(`/performance-operations/appointments/${assignment.appointment_id}`);
  return { message: "Trainer assignment removed." };
}
