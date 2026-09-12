"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  canTransitionPeriod,
  transitionRequiresReopen,
} from "@/lib/schemas/period-rules";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

const PERIODS_PATH = "/performance-operations/configuration/reporting-periods";

const periodSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  label: z.string().trim().min(1, "Name is required.").max(120),
  periodType: z.enum(["monthly", "semi_monthly", "biweekly", "custom"]),
  startDate: z.iso.date("Enter a start date."),
  endDate: z.iso.date("Enter an end date."),
  paymentDate: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
  notes: z.string().max(2000).optional().default(""),
});

function validateDates(values: { startDate: string; endDate: string }): string | null {
  if (values.endDate < values.startDate) {
    return "End date must be on or after the start date.";
  }
  return null;
}

export async function createPeriod(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = periodSchema.safeParse({
    organizationId: formData.get("organizationId"),
    label: formData.get("label"),
    periodType: formData.get("periodType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    paymentDate: formData.get("paymentDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;
  const dateError = validateDates(values);
  if (dateError) return { error: dateError };

  if (!actorCan(actor, values.organizationId, "period:manage")) {
    return PERMISSION_DENIED;
  }

  const { data: period, error } = await actor.supabase
    .from("reporting_periods")
    .insert({
      organization_id: values.organizationId,
      label: values.label,
      period_type: values.periodType,
      start_date: values.startDate,
      end_date: values.endDate,
      payment_date: values.paymentDate,
      notes: values.notes,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !period) {
    if (error?.code === "23P01") {
      return {
        error:
          "This period overlaps an existing period of the same type in this organization. Periods of the same type may never overlap (different types may coexist — documented rule).",
      };
    }
    if (error?.code === "23505") {
      return { error: "A period with that name already exists in this organization." };
    }
    return { error: "Could not create the reporting period." };
  }

  await writeAudit(actor, {
    organizationId: values.organizationId,
    entityType: "reporting_period",
    entityId: period.id,
    action: "period_created",
    metadata: {
      label: values.label,
      period_type: values.periodType,
      start_date: values.startDate,
      end_date: values.endDate,
    },
  });

  revalidatePath(PERIODS_PATH);
  redirect(`${PERIODS_PATH}/${period.id}`);
}

export async function updatePeriod(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const periodId = z.uuid().safeParse(formData.get("periodId"));
  if (!periodId.success) return { error: "Invalid period." };

  const parsed = periodSchema.safeParse({
    organizationId: formData.get("organizationId"),
    label: formData.get("label"),
    periodType: formData.get("periodType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    paymentDate: formData.get("paymentDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;
  const dateError = validateDates(values);
  if (dateError) return { error: dateError };

  const { data: existing } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status, label")
    .eq("id", periodId.data)
    .maybeSingle();
  if (!existing) return { error: "Period not found." };
  if (!actorCan(actor, existing.organization_id, "period:manage")) {
    return PERMISSION_DENIED;
  }
  // Locked periods require elevated authorization (also trigger-enforced).
  if (
    existing.status === "locked" &&
    !actorCan(actor, existing.organization_id, "payroll:reopen")
  ) {
    return {
      error: "This period is locked. Only a platform admin may modify locked periods.",
    };
  }

  const { error } = await actor.supabase
    .from("reporting_periods")
    .update({
      label: values.label,
      period_type: values.periodType,
      start_date: values.startDate,
      end_date: values.endDate,
      payment_date: values.paymentDate,
      notes: values.notes,
    })
    .eq("id", existing.id);
  if (error) {
    if (error.code === "23P01") {
      return { error: "These dates overlap another period of the same type." };
    }
    if (error.code === "42501") {
      return { error: "This period is locked; changes require reopen permission." };
    }
    return { error: "Could not update the period." };
  }

  await writeAudit(actor, {
    organizationId: existing.organization_id,
    entityType: "reporting_period",
    entityId: existing.id,
    action: "period_updated",
    metadata: { previous_label: existing.label, new_label: values.label },
  });

  revalidatePath(PERIODS_PATH);
  revalidatePath(`${PERIODS_PATH}/${existing.id}`);
  return { message: "Period updated." };
}

export async function changePeriodStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = z
    .object({
      periodId: z.uuid(),
      newStatus: z.enum(["open", "closed", "locked"]),
    })
    .safeParse({
      periodId: formData.get("periodId"),
      newStatus: formData.get("newStatus"),
    });
  if (!parsed.success) return { error: "Invalid status change." };

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status, label")
    .eq("id", parsed.data.periodId)
    .maybeSingle();
  if (!period) return { error: "Period not found." };
  if (!actorCan(actor, period.organization_id, "period:manage")) {
    return PERMISSION_DENIED;
  }
  if (!canTransitionPeriod(period.status, parsed.data.newStatus)) {
    return { error: `A ${period.status} period cannot move to ${parsed.data.newStatus}.` };
  }
  if (
    transitionRequiresReopen(period.status) &&
    !actorCan(actor, period.organization_id, "payroll:reopen")
  ) {
    return { error: "Reopening a locked period requires platform-admin authorization." };
  }

  const { error } = await actor.supabase
    .from("reporting_periods")
    .update({ status: parsed.data.newStatus })
    .eq("id", period.id);
  if (error) {
    if (error.code === "42501") {
      return { error: "Reopening a locked period requires platform-admin authorization." };
    }
    return { error: "Could not change the period status." };
  }

  await writeAudit(actor, {
    organizationId: period.organization_id,
    entityType: "reporting_period",
    entityId: period.id,
    action: period.status === "locked" ? "period_reopened" : `period_${parsed.data.newStatus}`,
    metadata: {
      label: period.label,
      previous_status: period.status,
      new_status: parsed.data.newStatus,
    },
  });

  revalidatePath(PERIODS_PATH);
  revalidatePath(`${PERIODS_PATH}/${period.id}`);
  return { message: `Period is now ${parsed.data.newStatus}.` };
}
