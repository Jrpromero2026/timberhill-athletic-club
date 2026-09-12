"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aliasSchema, serviceSchema, serviceFlagKeys } from "@/lib/schemas/service";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

const SERVICES_PATH = "/performance-operations/configuration/services";

function parseServiceForm(formData: FormData) {
  const flags = Object.fromEntries(
    serviceFlagKeys.map((key) => [key, formData.get(key) === "on"])
  );
  return {
    organizationId: formData.get("organizationId"),
    categoryId: formData.get("categoryId"),
    internalName: formData.get("internalName"),
    displayName: formData.get("displayName"),
    description: formData.get("description") ?? "",
    defaultDurationMinutes: formData.get("defaultDurationMinutes"),
    status: formData.get("status") ?? "active",
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") ?? "",
    departmentIds: formData.getAll("departmentIds"),
    ...flags,
  };
}

export async function createService(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = serviceSchema.safeParse(parseServiceForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;
  if (values.effectiveTo && values.effectiveTo <= values.effectiveFrom) {
    return { error: "Effective end date must be after the start date." };
  }
  if (!actorCan(actor, values.organizationId, "service:manage")) {
    return PERMISSION_DENIED;
  }

  // Category must belong to the organization (composite FK backs this).
  const { data: category } = await actor.supabase
    .from("service_categories")
    .select("id")
    .eq("id", values.categoryId)
    .eq("organization_id", values.organizationId)
    .maybeSingle();
  if (!category) return { error: "That category does not belong to the organization." };

  if (values.departmentIds.length > 0) {
    const { data: depts } = await actor.supabase
      .from("departments")
      .select("id")
      .eq("organization_id", values.organizationId)
      .in("id", values.departmentIds);
    if ((depts ?? []).length !== values.departmentIds.length) {
      return { error: "One or more departments do not belong to that organization." };
    }
  }

  const { data: service, error } = await actor.supabase
    .from("services")
    .insert({
      organization_id: values.organizationId,
      category_id: values.categoryId,
      internal_name: values.internalName,
      display_name: values.displayName,
      description: values.description,
      default_duration_minutes: values.defaultDurationMinutes,
      status: values.status,
      effective_from: values.effectiveFrom,
      effective_to: values.effectiveTo,
      counts_as_session: values.countsAsSession,
      counts_as_coaching_hours: values.countsAsCoachingHours,
      payroll_eligible: values.payrollEligible,
      revenue_eligible: values.revenueEligible,
      is_evaluation: values.isEvaluation,
      is_team_training: values.isTeamTraining,
      is_nutrition: values.isNutrition,
      is_group_training: values.isGroupTraining,
    })
    .select("id")
    .single();
  if (error || !service) {
    if (error?.code === "23505") {
      return { error: "A service with that internal name already exists in this organization." };
    }
    return { error: "Could not create the service." };
  }

  if (values.departmentIds.length > 0) {
    await actor.supabase.from("service_department_assignments").insert(
      values.departmentIds.map((departmentId) => ({
        organization_id: values.organizationId,
        service_id: service.id,
        department_id: departmentId,
        effective_from: values.effectiveFrom,
      }))
    );
  }

  await writeAudit(actor, {
    organizationId: values.organizationId,
    entityType: "service",
    entityId: service.id,
    action: "service_created",
    metadata: {
      internal_name: values.internalName,
      category_id: values.categoryId,
      department_count: values.departmentIds.length,
    },
  });

  revalidatePath(SERVICES_PATH);
  redirect(`${SERVICES_PATH}/${service.id}`);
}

export async function updateService(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const serviceId = z.uuid().safeParse(formData.get("serviceId"));
  if (!serviceId.success) return { error: "Invalid service." };

  const parsed = serviceSchema.safeParse(parseServiceForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;
  if (values.effectiveTo && values.effectiveTo <= values.effectiveFrom) {
    return { error: "Effective end date must be after the start date." };
  }

  const { data: existing } = await actor.supabase
    .from("services")
    .select("id, organization_id, internal_name, status")
    .eq("id", serviceId.data)
    .maybeSingle();
  if (!existing) return { error: "Service not found." };
  // Organization is immutable; ignore any client-supplied change.
  if (!actorCan(actor, existing.organization_id, "service:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase
    .from("services")
    .update({
      category_id: values.categoryId,
      internal_name: values.internalName,
      display_name: values.displayName,
      description: values.description,
      default_duration_minutes: values.defaultDurationMinutes,
      status: values.status,
      effective_from: values.effectiveFrom,
      effective_to: values.effectiveTo,
      counts_as_session: values.countsAsSession,
      counts_as_coaching_hours: values.countsAsCoachingHours,
      payroll_eligible: values.payrollEligible,
      revenue_eligible: values.revenueEligible,
      is_evaluation: values.isEvaluation,
      is_team_training: values.isTeamTraining,
      is_nutrition: values.isNutrition,
      is_group_training: values.isGroupTraining,
    })
    .eq("id", existing.id);
  if (error) {
    if (error.code === "23505") {
      return { error: "A service with that internal name already exists in this organization." };
    }
    return { error: "Could not update the service." };
  }

  await writeAudit(actor, {
    organizationId: existing.organization_id,
    entityType: "service",
    entityId: existing.id,
    action: "service_updated",
    metadata: {
      previous: { internal_name: existing.internal_name, status: existing.status },
      next: { internal_name: values.internalName, status: values.status },
    },
  });

  revalidatePath(SERVICES_PATH);
  revalidatePath(`${SERVICES_PATH}/${existing.id}`);
  return { message: "Service updated." };
}

/* -------------------------------------------------------------- aliases */

export async function addServiceAlias(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = aliasSchema.safeParse({
    serviceId: formData.get("serviceId"),
    source: formData.get("source"),
    alias: formData.get("alias"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid alias." };
  }

  const { data: service } = await actor.supabase
    .from("services")
    .select("id, organization_id")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();
  if (!service) return { error: "Service not found." };
  if (!actorCan(actor, service.organization_id, "service:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase.from("service_source_aliases").insert({
    organization_id: service.organization_id,
    service_id: service.id,
    source: parsed.data.source,
    alias: parsed.data.alias,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "That alias is already mapped for this source in this organization (an alias may map to only one service per source).",
      };
    }
    return { error: "Could not add the alias." };
  }

  await writeAudit(actor, {
    organizationId: service.organization_id,
    entityType: "service_source_alias",
    entityId: service.id,
    action: "service_alias_added",
    metadata: { source: parsed.data.source, alias: parsed.data.alias },
  });
  revalidatePath(`${SERVICES_PATH}/${service.id}`);
  return { message: "Alias added." };
}

export async function removeServiceAlias(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("aliasId"));
  if (!id.success) return;

  const { data: alias } = await actor.supabase
    .from("service_source_aliases")
    .select("id, service_id, organization_id, source, alias")
    .eq("id", id.data)
    .maybeSingle();
  if (!alias) return;
  if (!actorCan(actor, alias.organization_id, "service:manage")) return;

  await actor.supabase.from("service_source_aliases").delete().eq("id", alias.id);

  await writeAudit(actor, {
    organizationId: alias.organization_id,
    entityType: "service_source_alias",
    entityId: alias.service_id,
    action: "service_alias_removed",
    metadata: { source: alias.source, alias: alias.alias },
  });
  revalidatePath(`${SERVICES_PATH}/${alias.service_id}`);
}

/* --------------------------------------------- department assignments */

export async function endServiceDepartmentAssignment(
  formData: FormData
): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("assignmentId"));
  if (!id.success) return;

  const { data: assignment } = await actor.supabase
    .from("service_department_assignments")
    .select("id, service_id, organization_id, effective_from, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!assignment || assignment.effective_to !== null) return;
  if (!actorCan(actor, assignment.organization_id, "service:manage")) return;

  const today = new Date().toISOString().slice(0, 10);
  const endDate =
    assignment.effective_from < today
      ? today
      : new Date(Date.parse(assignment.effective_from) + 86_400_000)
          .toISOString()
          .slice(0, 10);

  await actor.supabase
    .from("service_department_assignments")
    .update({ effective_to: endDate })
    .eq("id", assignment.id);

  await writeAudit(actor, {
    organizationId: assignment.organization_id,
    entityType: "service_department_assignment",
    entityId: assignment.service_id,
    action: "service_dept_assignment_ended",
    metadata: {},
  });
  revalidatePath(`${SERVICES_PATH}/${assignment.service_id}`);
}

export async function addServiceDepartmentAssignment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = z
    .object({ serviceId: z.uuid(), departmentId: z.uuid() })
    .safeParse({
      serviceId: formData.get("serviceId"),
      departmentId: formData.get("departmentId"),
    });
  if (!parsed.success) return { error: "Choose a department." };

  const { data: service } = await actor.supabase
    .from("services")
    .select("id, organization_id")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();
  if (!service) return { error: "Service not found." };
  if (!actorCan(actor, service.organization_id, "service:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase
    .from("service_department_assignments")
    .insert({
      organization_id: service.organization_id,
      service_id: service.id,
      department_id: parsed.data.departmentId,
    });
  if (error) {
    if (error.code === "23505") {
      return { error: "The service is already assigned to that department." };
    }
    if (error.code === "23503") {
      return { error: "That department does not belong to the service's organization." };
    }
    return { error: "Could not assign the department." };
  }

  await writeAudit(actor, {
    organizationId: service.organization_id,
    entityType: "service_department_assignment",
    entityId: service.id,
    action: "service_dept_assignment_added",
    metadata: { department_id: parsed.data.departmentId },
  });
  revalidatePath(`${SERVICES_PATH}/${service.id}`);
  return { message: "Department assigned." };
}
