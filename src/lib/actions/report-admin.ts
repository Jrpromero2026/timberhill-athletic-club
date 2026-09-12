"use server";

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "@/lib/actions/shared";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import type { Json } from "@/lib/supabase/types";

/* ----------------------------------------------- saved view sharing ---- */

export async function shareSavedView(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const viewId = String(formData.get("view_id") ?? "");
  const scope = String(formData.get("shared_scope") ?? "personal");
  const organizationId = String(formData.get("organization_id") ?? "");
  const departmentId = String(formData.get("department_id") ?? "") || null;
  if (!["personal", "organization", "department"].includes(scope)) {
    return { error: "Unknown sharing scope." };
  }
  const { data: view } = await actor.supabase
    .from("saved_views")
    .select("id, owner_id, name")
    .eq("id", viewId)
    .maybeSingle();
  if (!view || view.owner_id !== actor.userId) {
    return { error: "Only the owner can change a view's sharing." };
  }
  if (scope !== "personal") {
    // Sharing beyond personal requires the share permission in the org —
    // trainers can never create organization/department-wide views.
    if (!organizationId || !actorCan(actor, organizationId, "saved_report:share")) {
      return PERMISSION_DENIED;
    }
    if (scope === "department" && !departmentId) {
      return { error: "Choose a department for a department-shared view." };
    }
  }
  const { error } = await actor.supabase
    .from("saved_views")
    .update({
      shared_scope: scope,
      organization_id: scope === "personal" ? null : organizationId,
      department_id: scope === "department" ? departmentId : null,
      is_default: false, // scope changes reset default status
    })
    .eq("id", viewId);
  if (error) return { error: "Could not update sharing." };
  await writeAudit(actor, {
    organizationId: scope === "personal" ? null : organizationId,
    entityType: "saved_view",
    entityId: viewId,
    action: "saved_view_shared",
    metadata: { scope, name: view.name },
  });
  revalidatePath("/performance-operations/reports");
  return { message: `View is now ${scope === "personal" ? "personal" : `${scope}-shared`}.` };
}

export async function setDefaultView(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const viewId = String(formData.get("view_id") ?? "");
  const makeDefault = formData.get("is_default") === "true";
  const { data: view } = await actor.supabase
    .from("saved_views")
    .select("id, owner_id, shared_scope, organization_id, department_id, page, name")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) return { error: "View not found." };
  const canManage =
    view.owner_id === actor.userId ||
    (view.shared_scope !== "personal" &&
      view.organization_id !== null &&
      actorCan(actor, view.organization_id, "saved_report:share"));
  if (!canManage) return PERMISSION_DENIED;

  if (makeDefault) {
    // Clear the previous default for the same scope target first.
    let clear = actor.supabase
      .from("saved_views")
      .update({ is_default: false })
      .eq("page", view.page)
      .eq("shared_scope", view.shared_scope)
      .eq("is_default", true);
    if (view.shared_scope === "personal") clear = clear.eq("owner_id", view.owner_id);
    else clear = clear.eq("organization_id", view.organization_id!);
    if (view.shared_scope === "department") clear = clear.eq("department_id", view.department_id!);
    await clear;
  }
  const { error } = await actor.supabase
    .from("saved_views")
    .update({ is_default: makeDefault })
    .eq("id", viewId);
  if (error) return { error: "Could not update the default view." };
  await writeAudit(actor, {
    organizationId: view.organization_id,
    entityType: "saved_view",
    entityId: viewId,
    action: makeDefault ? "saved_view_default_set" : "saved_view_default_cleared",
    metadata: { scope: view.shared_scope, name: view.name },
  });
  revalidatePath("/performance-operations/reports");
  return { message: makeDefault ? "Set as default view." : "Default cleared." };
}

/* ------------------------------------------- scheduled report defs ---- */

const FREQUENCIES = ["daily", "weekly", "monthly", "period_close", "custom"];
const REPORT_TYPES = [
  "quick_report",
  "executive_package",
  "department_package",
  "payroll_package",
  // Phase 9 analytics subscriptions (see lib/analytics/exports/subscriptions)
  "executive_scorecard",
  "department_scorecard",
  "trainer_self_scorecard",
  "goal_progress_report",
  "benchmark_report",
  "cohort_report",
  "analytics_dashboard",
  "board_presentation_package",
];

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function createScheduledReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const reportType = String(formData.get("report_type") ?? "");
  const frequency = String(formData.get("frequency") ?? "");
  const timezone = String(formData.get("timezone") ?? "America/Los_Angeles").trim();
  const savedViewId = String(formData.get("saved_view_id") ?? "") || null;
  const recipientsRaw = String(formData.get("recipients") ?? "").trim();
  if (!actorCan(actor, organizationId, "scheduled_report:manage")) {
    return PERMISSION_DENIED;
  }
  if (!REPORT_TYPES.includes(reportType)) return { error: "Choose a report type." };
  if (!FREQUENCIES.includes(frequency)) return { error: "Choose a frequency." };
  if (!isValidTimezone(timezone)) return { error: "Unknown timezone." };

  // Recipient scope validation: emails must belong to members of the org.
  const recipients = recipientsRaw
    .split(/[,;\n]/)
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  if (recipients.length > 0) {
    const { data: members } = await actor.supabase
      .from("organization_memberships")
      .select("profiles ( email )")
      .eq("organization_id", organizationId)
      .is("effective_to", null);
    const memberEmails = new Set(
      (members ?? []).flatMap((m) => {
        const profile = m.profiles as unknown as { email: string } | null;
        return profile ? [profile.email.toLowerCase()] : [];
      }),
    );
    const outside = recipients.filter((r) => !memberEmails.has(r));
    if (outside.length > 0) {
      return {
        error: `Recipients must be members of this organization (not: ${outside.join(", ")}).`,
      };
    }
  }

  const { data: created, error } = await actor.supabase
    .from("scheduled_report_definitions")
    .insert({
      organization_id: organizationId,
      owner_id: actor.userId,
      saved_view_id: savedViewId,
      report_type: reportType,
      frequency,
      timezone,
      recipients: recipients as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "Could not create the definition." };
  await writeAudit(actor, {
    organizationId,
    entityType: "scheduled_report_definition",
    entityId: created.id,
    action: "scheduled_report_created",
    metadata: { report_type: reportType, frequency, recipient_count: recipients.length },
  });
  await notifyPermissionHolders(actor, organizationId, "scheduled_report:manage", {
    category: "reporting",
    title: "Scheduled report definition created",
    body: `${reportType} · ${frequency}. Execution is NOT yet enabled — definitions only.`,
    linkPath: "/performance-operations/reports?tab=scheduled",
    entityType: "scheduled_report_definition",
    entityId: created.id,
  });
  revalidatePath("/performance-operations/reports");
  return { message: "Definition saved. Execution not yet enabled." };
}

export async function toggleScheduledReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const { data: definition } = await actor.supabase
    .from("scheduled_report_definitions")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!definition) return { error: "Definition not found." };
  if (!actorCan(actor, definition.organization_id, "scheduled_report:manage")) {
    return PERMISSION_DENIED;
  }
  const { error } = await actor.supabase
    .from("scheduled_report_definitions")
    .update({ active: !active })
    .eq("id", id);
  if (error) return { error: "Could not update the definition." };
  await writeAudit(actor, {
    organizationId: definition.organization_id,
    entityType: "scheduled_report_definition",
    entityId: id,
    action: active ? "scheduled_report_disabled" : "scheduled_report_enabled",
  });
  revalidatePath("/performance-operations/reports");
  return { message: active ? "Definition disabled." : "Definition enabled (execution still not available)." };
}

export async function deleteScheduledReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const id = String(formData.get("id") ?? "");
  const { data: definition } = await actor.supabase
    .from("scheduled_report_definitions")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!definition) return { error: "Definition not found." };
  if (!actorCan(actor, definition.organization_id, "scheduled_report:manage")) {
    return PERMISSION_DENIED;
  }
  const { error } = await actor.supabase
    .from("scheduled_report_definitions")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not delete the definition." };
  await writeAudit(actor, {
    organizationId: definition.organization_id,
    entityType: "scheduled_report_definition",
    entityId: id,
    action: "scheduled_report_deleted",
  });
  revalidatePath("/performance-operations/reports");
  return { message: "Definition deleted." };
}
