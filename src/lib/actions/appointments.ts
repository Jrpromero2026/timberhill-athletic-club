"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

/**
 * Posted-appointment corrections. Free-form edits are impossible: the ONLY
 * mutation is a status correction that records previous/new values, a
 * mandatory reason, append-only correction + status-history rows, and an
 * audit event. Source evidence fields are trigger-frozen in the database.
 */
export async function correctAppointmentStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = z
    .object({
      appointmentId: z.uuid(),
      newStatus: z.string().min(1).max(40),
      reason: z.string().trim().min(5, "A correction reason (at least 5 characters) is required."),
    })
    .safeParse({
      appointmentId: formData.get("appointmentId"),
      newStatus: formData.get("newStatus"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid correction." };
  }

  const { data: appointment } = await actor.supabase
    .from("appointments")
    .select("id, organization_id, canonical_status, record_state")
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  if (!actorCan(actor, appointment.organization_id, "appointment:correct")) {
    return PERMISSION_DENIED;
  }
  if (appointment.record_state !== "active") {
    return { error: "Only active appointments can be corrected." };
  }
  if (appointment.canonical_status === parsed.data.newStatus) {
    return { message: "No change — that is already the status." };
  }

  const { data: statusDef } = await actor.supabase
    .from("appointment_status_definitions")
    .select("key")
    .eq("key", parsed.data.newStatus)
    .maybeSingle();
  if (!statusDef) return { error: "Unknown canonical status." };

  const { error: updateError } = await actor.supabase
    .from("appointments")
    .update({ canonical_status: parsed.data.newStatus })
    .eq("id", appointment.id);
  if (updateError) return { error: "Could not apply the correction." };

  await actor.supabase.from("appointment_corrections").insert({
    appointment_id: appointment.id,
    organization_id: appointment.organization_id,
    field: "canonical_status",
    previous_value: appointment.canonical_status,
    new_value: parsed.data.newStatus,
    reason: parsed.data.reason,
    change_source: "manual",
    corrected_by: actor.userId,
  });
  await actor.supabase.from("appointment_status_history").insert({
    appointment_id: appointment.id,
    organization_id: appointment.organization_id,
    previous_status: appointment.canonical_status,
    new_status: parsed.data.newStatus,
    change_source: "correction",
    reason: parsed.data.reason,
    changed_by: actor.userId,
  });
  await writeAudit(actor, {
    organizationId: appointment.organization_id,
    entityType: "appointment",
    entityId: appointment.id,
    action: "appointment_status_corrected",
    metadata: {
      previous: appointment.canonical_status,
      next: parsed.data.newStatus,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/performance-operations/appointments");
  revalidatePath(`/performance-operations/appointments/${appointment.id}`);
  return { message: "Status corrected; the change is recorded in correction history." };
}
