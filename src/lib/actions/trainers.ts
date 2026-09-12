"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  trainerCreateSchema,
  trainerSchema,
  refineDates,
} from "@/lib/schemas/trainer";
import {
  getActorContext,
  actorCan,
  writeAudit,
  optionalDate,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "./shared";

const TRAINERS_PATH = "/performance-operations/trainers";

function sourceIdentifiers(setmoreId: string, acuityId: string) {
  const ids: Record<string, string> = {};
  if (setmoreId) ids.setmore = setmoreId;
  if (acuityId) ids.acuity = acuityId;
  return ids;
}

/** Duplicate check: same email or same external source identifier. */
async function findDuplicates(
  actor: ActorContext,
  input: { email: string | null; setmoreId: string; acuityId: string },
  excludeTrainerId?: string
): Promise<string[]> {
  const matches = new Map<string, string>();
  if (input.email) {
    const { data } = await actor.supabase
      .from("trainers")
      .select("id, display_name, email")
      .ilike("email", input.email);
    for (const t of data ?? []) {
      if (t.id !== excludeTrainerId) {
        matches.set(t.id, `${t.display_name} (${t.email})`);
      }
    }
  }
  for (const [source, value] of [
    ["setmore", input.setmoreId],
    ["acuity", input.acuityId],
  ] as const) {
    if (!value) continue;
    const { data } = await actor.supabase
      .from("trainers")
      .select("id, display_name")
      .contains("source_identifiers", { [source]: value });
    for (const t of data ?? []) {
      if (t.id !== excludeTrainerId) {
        matches.set(t.id, `${t.display_name} (${source} id match)`);
      }
    }
  }
  return [...matches.values()];
}

function parseTrainerForm(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    displayName: formData.get("displayName"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    employmentStatus: formData.get("employmentStatus"),
    hireDate: formData.get("hireDate") ?? "",
    separationDate: formData.get("separationDate") ?? "",
    notes: formData.get("notes") ?? "",
    setmoreId: formData.get("setmoreId") ?? "",
    acuityId: formData.get("acuityId") ?? "",
  };
}

export async function createTrainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = trainerCreateSchema.safeParse({
    ...parseTrainerForm(formData),
    organizationId: formData.get("organizationId"),
    title: formData.get("title"),
    departmentIds: formData.getAll("departmentIds"),
    confirmDuplicate: formData.get("confirmDuplicate") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;

  const dateError = refineDates(values);
  if (dateError) return { error: dateError };

  if (!actorCan(actor, values.organizationId, "trainer:manage")) {
    return PERMISSION_DENIED;
  }

  // Departments must belong to the chosen organization (composite FK backs this).
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

  if (!values.confirmDuplicate) {
    const duplicates = await findDuplicates(actor, values);
    if (duplicates.length > 0) {
      return {
        error: `Possible duplicate trainer: ${duplicates.join("; ")}. Review the roster, or confirm to create anyway.`,
        data: { duplicateWarning: "true" },
      };
    }
  }

  const { data: trainer, error } = await actor.supabase
    .from("trainers")
    .insert({
      first_name: values.firstName,
      last_name: values.lastName,
      display_name: values.displayName,
      email: values.email,
      phone: values.phone || null,
      employment_status: values.employmentStatus,
      hire_date: values.hireDate,
      separation_date: values.separationDate,
      notes: values.notes,
      source_identifiers: sourceIdentifiers(values.setmoreId, values.acuityId),
      default_organization_id: values.organizationId,
      status: values.employmentStatus === "separated" ? "inactive" : "active",
    })
    .select("id")
    .single();
  if (error || !trainer) return { error: "Could not create the trainer." };

  const { error: assignError } = await actor.supabase
    .from("trainer_organization_assignments")
    .insert({
      trainer_id: trainer.id,
      organization_id: values.organizationId,
      title: values.title,
      effective_from: values.hireDate ?? undefined,
    });
  if (assignError) {
    return {
      error:
        "Trainer was created but the organization assignment failed. Open the trainer to add it.",
    };
  }

  if (values.departmentIds.length > 0) {
    await actor.supabase.from("trainer_department_assignments").insert(
      values.departmentIds.map((departmentId) => ({
        trainer_id: trainer.id,
        organization_id: values.organizationId,
        department_id: departmentId,
        effective_from: values.hireDate ?? undefined,
      }))
    );
  }

  await writeAudit(actor, {
    organizationId: values.organizationId,
    entityType: "trainer",
    entityId: trainer.id,
    action: "trainer_created",
    metadata: {
      display_name: values.displayName,
      title: values.title,
      department_count: values.departmentIds.length,
    },
  });

  revalidatePath(TRAINERS_PATH);
  redirect(`/performance-operations/trainers/${trainer.id}`);
}

export async function updateTrainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const trainerId = z.uuid().safeParse(formData.get("trainerId"));
  if (!trainerId.success) return { error: "Invalid trainer." };

  const parsed = trainerSchema.safeParse(parseTrainerForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;
  const dateError = refineDates(values);
  if (dateError) return { error: dateError };

  // Authority: trainer:manage in any org the trainer is assigned to.
  const { data: assignments } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("organization_id")
    .eq("trainer_id", trainerId.data);
  const manageOrg = (assignments ?? []).find((a) =>
    actorCan(actor, a.organization_id, "trainer:manage")
  );
  if (!manageOrg) return PERMISSION_DENIED;

  const { data: before } = await actor.supabase
    .from("trainers")
    .select("display_name, email, employment_status, status")
    .eq("id", trainerId.data)
    .maybeSingle();

  const { error } = await actor.supabase
    .from("trainers")
    .update({
      first_name: values.firstName,
      last_name: values.lastName,
      display_name: values.displayName,
      email: values.email,
      phone: values.phone || null,
      employment_status: values.employmentStatus,
      hire_date: values.hireDate,
      separation_date: values.separationDate,
      notes: values.notes,
      source_identifiers: sourceIdentifiers(values.setmoreId, values.acuityId),
      status: values.employmentStatus === "separated" ? "inactive" : "active",
    })
    .eq("id", trainerId.data);
  if (error) return { error: "Could not update the trainer." };

  await writeAudit(actor, {
    organizationId: manageOrg.organization_id,
    entityType: "trainer",
    entityId: trainerId.data,
    action: "trainer_updated",
    metadata: {
      previous: {
        display_name: before?.display_name ?? "",
        email: before?.email ?? "",
        employment_status: before?.employment_status ?? "",
      },
      next: {
        display_name: values.displayName,
        email: values.email ?? "",
        employment_status: values.employmentStatus,
      },
    },
  });

  revalidatePath(TRAINERS_PATH);
  revalidatePath(`/performance-operations/trainers/${trainerId.data}`);
  redirect(`/performance-operations/trainers/${trainerId.data}`);
}

/* ------------------------------------------------------------ assignments */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function endDateFor(effectiveFrom: string): string {
  const today = todayIso();
  if (effectiveFrom < today) return today;
  const next = new Date(`${effectiveFrom}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const orgAssignmentSchema = z.object({
  trainerId: z.uuid(),
  organizationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

export async function addTrainerOrganizationAssignment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = orgAssignmentSchema.safeParse({
    trainerId: formData.get("trainerId"),
    organizationId: formData.get("organizationId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return { error: "Choose an organization and role/title." };
  if (!actorCan(actor, parsed.data.organizationId, "trainer:manage")) {
    return PERMISSION_DENIED;
  }

  const effectiveFrom = optionalDate(formData.get("effectiveFrom")) ?? todayIso();

  const { error } = await actor.supabase
    .from("trainer_organization_assignments")
    .insert({
      trainer_id: parsed.data.trainerId,
      organization_id: parsed.data.organizationId,
      title: parsed.data.title,
      effective_from: effectiveFrom,
    });
  if (error) {
    if (error.code === "23505") {
      return { error: "The trainer already has an active assignment in that organization." };
    }
    return { error: "Could not add the assignment." };
  }

  await writeAudit(actor, {
    organizationId: parsed.data.organizationId,
    entityType: "trainer_organization_assignment",
    entityId: parsed.data.trainerId,
    action: "trainer_org_assignment_added",
    metadata: { trainer_id: parsed.data.trainerId, title: parsed.data.title },
  });
  revalidatePath(`/performance-operations/trainers/${parsed.data.trainerId}`);
  return { message: "Organization assignment added." };
}

export async function endTrainerOrganizationAssignment(
  formData: FormData
): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("assignmentId"));
  if (!id.success) return;

  const { data: assignment } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("id, trainer_id, organization_id, effective_from, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!assignment || assignment.effective_to !== null) return;
  if (!actorCan(actor, assignment.organization_id, "trainer:manage")) return;

  await actor.supabase
    .from("trainer_organization_assignments")
    .update({ effective_to: endDateFor(assignment.effective_from) })
    .eq("id", assignment.id);

  await writeAudit(actor, {
    organizationId: assignment.organization_id,
    entityType: "trainer_organization_assignment",
    entityId: assignment.id,
    action: "trainer_org_assignment_ended",
    metadata: { trainer_id: assignment.trainer_id },
  });
  revalidatePath(`/performance-operations/trainers/${assignment.trainer_id}`);
}

const deptAssignmentSchema = z.object({
  trainerId: z.uuid(),
  organizationId: z.uuid(),
  departmentId: z.uuid(),
});

export async function addTrainerDepartmentAssignment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = deptAssignmentSchema.safeParse({
    trainerId: formData.get("trainerId"),
    organizationId: formData.get("organizationId"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) return { error: "Choose a department." };
  if (!actorCan(actor, parsed.data.organizationId, "trainer:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase
    .from("trainer_department_assignments")
    .insert({
      trainer_id: parsed.data.trainerId,
      organization_id: parsed.data.organizationId,
      department_id: parsed.data.departmentId,
    });
  if (error) {
    if (error.code === "23505") {
      return { error: "The trainer is already assigned to that department." };
    }
    // Composite-FK violation => department not in that organization.
    if (error.code === "23503") {
      return { error: "That department does not belong to the trainer's organization." };
    }
    return { error: "Could not add the department assignment." };
  }

  await writeAudit(actor, {
    organizationId: parsed.data.organizationId,
    entityType: "trainer_department_assignment",
    entityId: parsed.data.trainerId,
    action: "trainer_dept_assignment_added",
    metadata: {
      trainer_id: parsed.data.trainerId,
      department_id: parsed.data.departmentId,
    },
  });
  revalidatePath(`/performance-operations/trainers/${parsed.data.trainerId}`);
  return { message: "Department assignment added." };
}

export async function endTrainerDepartmentAssignment(
  formData: FormData
): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("assignmentId"));
  if (!id.success) return;

  const { data: assignment } = await actor.supabase
    .from("trainer_department_assignments")
    .select("id, trainer_id, organization_id, department_id, effective_from, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!assignment || assignment.effective_to !== null) return;
  if (!actorCan(actor, assignment.organization_id, "trainer:manage")) return;

  await actor.supabase
    .from("trainer_department_assignments")
    .update({ effective_to: endDateFor(assignment.effective_from) })
    .eq("id", assignment.id);

  await writeAudit(actor, {
    organizationId: assignment.organization_id,
    entityType: "trainer_department_assignment",
    entityId: assignment.id,
    action: "trainer_dept_assignment_ended",
    metadata: {
      trainer_id: assignment.trainer_id,
      department_id: assignment.department_id,
    },
  });
  revalidatePath(`/performance-operations/trainers/${assignment.trainer_id}`);
}
