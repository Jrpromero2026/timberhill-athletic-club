"use server";

import { revalidatePath } from "next/cache";
import { parseCents } from "@/lib/money/money";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "@/lib/actions/shared";

const TIME_PATH = "/performance-operations/payroll/time";
const ADJUSTMENTS_PATH = "/performance-operations/payroll/adjustments";

const WORK_CATEGORIES = [
  "admin",
  "programming",
  "meeting",
  "facility_support",
  "floor_shift",
  "training",
  "other",
] as const;

const COMPENSATION_PURPOSES = [
  "primary",
  "team_training",
  "evaluations",
  "nutrition",
  "administrative",
] as const;

const ADJUSTMENT_TYPES = [
  "bonus",
  "deduction",
  "correction",
  "reimbursement",
  "carry_forward",
  "other",
] as const;

/** The trainer record linked to the acting user's profile, if any. */
async function actorTrainerId(actor: ActorContext): Promise<string | null> {
  const { data } = await actor.supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", actor.userId)
    .maybeSingle();
  return data?.id ?? null;
}

/* ------------------------------------------------------ manual time */

export async function createTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const periodId = String(formData.get("reporting_period_id") ?? "");
  const requestedTrainerId = String(formData.get("trainer_id") ?? "");
  const workDate = String(formData.get("work_date") ?? "");
  const workCategory = String(formData.get("work_category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const minutes = Number.parseInt(String(formData.get("requested_minutes") ?? ""), 10);
  const purpose = String(formData.get("compensation_purpose") ?? "administrative");

  if (!actorCan(actor, organizationId, "payroll:manage_time")) return PERMISSION_DENIED;
  if (!(WORK_CATEGORIES as readonly string[]).includes(workCategory)) {
    return { error: "Choose a work category." };
  }
  if (!(COMPENSATION_PURPOSES as readonly string[]).includes(purpose)) {
    return { error: "Choose a compensation purpose." };
  }
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) {
    return { error: "Minutes must be between 1 and 1440." };
  }
  if (description.length < 5) {
    return { error: "Describe the work (min 5 characters)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { error: "Provide a work date." };
  }

  // Trainers may only log their own time; approvers may log for anyone.
  const isApprover = actorCan(actor, organizationId, "payroll:approve_time");
  const selfTrainerId = await actorTrainerId(actor);
  const trainerId = requestedTrainerId || selfTrainerId || "";
  if (!trainerId) return { error: "No trainer selected." };
  if (!isApprover && trainerId !== selfTrainerId) {
    return { error: "You can only log time for yourself." };
  }

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status, start_date, end_date")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.organization_id !== organizationId) {
    return { error: "Reporting period not found." };
  }
  if (["closed", "locked"].includes(period.status)) {
    return { error: "This reporting period no longer accepts time entries." };
  }
  if (workDate < period.start_date || workDate > period.end_date) {
    return { error: "The work date must fall inside the selected period." };
  }

  const { error } = await actor.supabase.from("manual_time_entries").insert({
    organization_id: organizationId,
    trainer_id: trainerId,
    reporting_period_id: periodId,
    work_date: workDate,
    work_category: workCategory,
    description,
    requested_minutes: minutes,
    compensation_purpose: purpose,
    status: "submitted",
    submitted_by: actor.userId,
    submitted_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not create the time entry." };
  await writeAudit(actor, {
    organizationId,
    entityType: "manual_time_entry",
    entityId: null,
    action: "time_entry_submitted",
    metadata: { trainer_id: trainerId, work_category: workCategory, minutes },
  });
  revalidatePath(TIME_PATH);
  return { message: "Time entry submitted for approval." };
}

export async function decideTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const entryId = String(formData.get("entry_id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approve | reject
  const approvedMinutesRaw = String(formData.get("approved_minutes") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const { data: entry } = await actor.supabase
    .from("manual_time_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "Time entry not found." };
  if (!actorCan(actor, entry.organization_id, "payroll:approve_time")) {
    return PERMISSION_DENIED;
  }
  if (entry.status !== "submitted") {
    return { error: `Only submitted entries can be decided (current: '${entry.status}').` };
  }

  // Separation of duties: nobody approves their own time.
  const selfTrainerId = await actorTrainerId(actor);
  if (entry.trainer_id === selfTrainerId || entry.submitted_by === actor.userId) {
    return { error: "You cannot approve or reject your own time entry." };
  }

  if (decision === "approve") {
    const approvedMinutes =
      approvedMinutesRaw === ""
        ? entry.requested_minutes
        : Number.parseInt(approvedMinutesRaw, 10);
    if (
      !Number.isInteger(approvedMinutes) ||
      approvedMinutes <= 0 ||
      approvedMinutes > 24 * 60
    ) {
      return { error: "Approved minutes must be between 1 and 1440." };
    }
    const { error } = await actor.supabase
      .from("manual_time_entries")
      .update({
        status: "approved",
        approved_minutes: approvedMinutes,
        approved_by: actor.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", entryId);
    if (error) return { error: "Could not approve the entry." };
    await writeAudit(actor, {
      organizationId: entry.organization_id,
      entityType: "manual_time_entry",
      entityId: entry.id,
      action: "time_entry_approved",
      metadata: { approved_minutes: approvedMinutes, requested_minutes: entry.requested_minutes },
    });
    revalidatePath(TIME_PATH);
    return { message: "Time entry approved." };
  }

  if (decision === "reject") {
    if (reason.length < 5) return { error: "A rejection reason (min 5 characters) is required." };
    const { error } = await actor.supabase
      .from("manual_time_entries")
      .update({
        status: "rejected",
        rejected_by: actor.userId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", entryId);
    if (error) return { error: "Could not reject the entry." };
    await writeAudit(actor, {
      organizationId: entry.organization_id,
      entityType: "manual_time_entry",
      entityId: entry.id,
      action: "time_entry_rejected",
      metadata: { reason },
    });
    revalidatePath(TIME_PATH);
    return { message: "Time entry rejected." };
  }

  return { error: "Unknown decision." };
}

export async function voidTimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const entryId = String(formData.get("entry_id") ?? "");
  const { data: entry } = await actor.supabase
    .from("manual_time_entries")
    .select("id, organization_id, trainer_id, status, submitted_by")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "Time entry not found." };
  const selfTrainerId = await actorTrainerId(actor);
  const isApprover = actorCan(actor, entry.organization_id, "payroll:approve_time");
  const isOwner = entry.trainer_id === selfTrainerId;
  if (!isApprover && !isOwner) return PERMISSION_DENIED;
  if (!["draft", "submitted", "approved"].includes(entry.status)) {
    return { error: `An entry in status '${entry.status}' cannot be voided.` };
  }
  if (entry.status === "approved" && !isApprover) {
    return { error: "Approved entries can only be voided by an approver." };
  }
  const { error } = await actor.supabase
    .from("manual_time_entries")
    .update({ status: "voided" })
    .eq("id", entryId);
  if (error) return { error: "Could not void the entry." };
  await writeAudit(actor, {
    organizationId: entry.organization_id,
    entityType: "manual_time_entry",
    entityId: entry.id,
    action: "time_entry_voided",
  });
  revalidatePath(TIME_PATH);
  return { message: "Time entry voided." };
}

/* ------------------------------------------------------- adjustments */

export async function createAdjustment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const periodId = String(formData.get("reporting_period_id") ?? "");
  const trainerId = String(formData.get("trainer_id") ?? "");
  const adjustmentType = String(formData.get("adjustment_type") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const supportingReference = String(formData.get("supporting_reference") ?? "").trim();

  if (!actorCan(actor, organizationId, "payroll:manage_adjustments")) {
    return PERMISSION_DENIED;
  }
  if (!(ADJUSTMENT_TYPES as readonly string[]).includes(adjustmentType)) {
    return { error: "Choose an adjustment type." };
  }
  if (reason.length < 5) {
    return { error: "A reason (min 5 characters) is required for every adjustment." };
  }
  let amountCents: number;
  try {
    amountCents = parseCents(amountRaw);
  } catch {
    return { error: "Enter a valid amount (e.g. 125.00)." };
  }
  if (amountCents <= 0) {
    return {
      error:
        "Enter a positive amount — deductions are made negative by their type, not by a minus sign.",
    };
  }
  if (!trainerId) return { error: "Choose a trainer." };

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.organization_id !== organizationId) {
    return { error: "Reporting period not found." };
  }
  if (period.status === "locked") {
    return { error: "This reporting period is locked." };
  }

  const { error } = await actor.supabase.from("payroll_adjustments").insert({
    organization_id: organizationId,
    reporting_period_id: periodId,
    trainer_id: trainerId,
    adjustment_type: adjustmentType,
    amount_cents: amountCents,
    reason,
    supporting_reference: supportingReference || null,
    status: "submitted",
    requested_by: actor.userId,
    requested_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not create the adjustment." };
  await writeAudit(actor, {
    organizationId,
    entityType: "payroll_adjustment",
    entityId: null,
    action: "adjustment_submitted",
    metadata: { trainer_id: trainerId, adjustment_type: adjustmentType, amount_cents: amountCents },
  });
  revalidatePath(ADJUSTMENTS_PATH);
  return { message: "Adjustment submitted for approval." };
}

export async function decideAdjustment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const adjustmentId = String(formData.get("adjustment_id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approve | reject
  const reason = String(formData.get("reason") ?? "").trim();

  const { data: adjustment } = await actor.supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("id", adjustmentId)
    .maybeSingle();
  if (!adjustment) return { error: "Adjustment not found." };
  if (!actorCan(actor, adjustment.organization_id, "payroll:approve_adjustments")) {
    return PERMISSION_DENIED;
  }
  if (adjustment.status !== "submitted") {
    return { error: `Only submitted adjustments can be decided (current: '${adjustment.status}').` };
  }
  // Separation of duties: requesters never approve their own adjustments.
  if (adjustment.requested_by === actor.userId) {
    return { error: "You cannot approve or reject an adjustment you requested." };
  }

  if (decision === "approve") {
    const { error } = await actor.supabase
      .from("payroll_adjustments")
      .update({
        status: "approved",
        approved_by: actor.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", adjustmentId);
    if (error) return { error: "Could not approve the adjustment." };
    await writeAudit(actor, {
      organizationId: adjustment.organization_id,
      entityType: "payroll_adjustment",
      entityId: adjustment.id,
      action: "adjustment_approved",
      metadata: {
        trainer_id: adjustment.trainer_id,
        adjustment_type: adjustment.adjustment_type,
        amount_cents: adjustment.amount_cents,
      },
    });
    revalidatePath(ADJUSTMENTS_PATH);
    return { message: "Adjustment approved." };
  }

  if (decision === "reject") {
    if (reason.length < 5) return { error: "A rejection reason (min 5 characters) is required." };
    const { error } = await actor.supabase
      .from("payroll_adjustments")
      .update({
        status: "rejected",
        rejected_by: actor.userId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", adjustmentId);
    if (error) return { error: "Could not reject the adjustment." };
    await writeAudit(actor, {
      organizationId: adjustment.organization_id,
      entityType: "payroll_adjustment",
      entityId: adjustment.id,
      action: "adjustment_rejected",
      metadata: { reason },
    });
    revalidatePath(ADJUSTMENTS_PATH);
    return { message: "Adjustment rejected." };
  }

  return { error: "Unknown decision." };
}

export async function voidAdjustment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const adjustmentId = String(formData.get("adjustment_id") ?? "");
  const { data: adjustment } = await actor.supabase
    .from("payroll_adjustments")
    .select("id, organization_id, status")
    .eq("id", adjustmentId)
    .maybeSingle();
  if (!adjustment) return { error: "Adjustment not found." };
  if (!actorCan(actor, adjustment.organization_id, "payroll:manage_adjustments")) {
    return PERMISSION_DENIED;
  }
  if (!["draft", "submitted"].includes(adjustment.status)) {
    return {
      error:
        "Only draft or submitted adjustments can be voided. Approved amounts are corrected with a new adjustment.",
    };
  }
  const { error } = await actor.supabase
    .from("payroll_adjustments")
    .update({ status: "voided" })
    .eq("id", adjustmentId);
  if (error) return { error: "Could not void the adjustment." };
  await writeAudit(actor, {
    organizationId: adjustment.organization_id,
    entityType: "payroll_adjustment",
    entityId: adjustment.id,
    action: "adjustment_voided",
  });
  revalidatePath(ADJUSTMENTS_PATH);
  return { message: "Adjustment voided." };
}
