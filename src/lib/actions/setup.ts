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
 * Setup-wizard bulk operations.
 *
 * These are ORCHESTRATION only. Each one performs the same writes the
 * existing single-entity screens perform, in a loop, with the same
 * permission checks and the same audit events — so nothing bypasses
 * validation, RLS, or the audit trail. There is no bulk SQL path and no
 * new business rule: the wizard's contribution is that the owner selects
 * twenty rows once instead of visiting twenty screens.
 *
 * Every action reports per-row outcomes rather than failing the whole
 * batch, because a single bad name should not discard nineteen good
 * ones.
 */

const bulkTrainerSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  trainers: z
    .array(
      z.object({
        sourceName: z.string().trim().min(1),
        firstName: z.string().trim().min(1, "First name is required."),
        lastName: z.string().trim().min(1, "Last name is required."),
        displayName: z.string().trim().min(1).max(200),
        email: z.union([z.email(), z.literal("")]).default(""),
      })
    )
    .min(1, "Select at least one trainer.")
    .max(200, "Create at most 200 trainers at a time."),
});

/**
 * Create the selected discovered trainers, and record the source name as
 * an approved alias so the next import matches them automatically.
 */
export async function bulkCreateTrainers(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Nothing to create." };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Nothing to create." };
  }

  const parsed = bulkTrainerSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid selection." };
  }
  const { organizationId, trainers } = parsed.data;

  if (!actorCan(actor, organizationId, "trainer:manage")) return PERMISSION_DENIED;

  let created = 0;
  const failures: string[] = [];

  for (const candidate of trainers) {
    const { data: trainer, error } = await actor.supabase
      .from("trainers")
      .insert({
        first_name: candidate.firstName,
        last_name: candidate.lastName,
        display_name: candidate.displayName,
        email: candidate.email || null,
        employment_status: "active",
        status: "active",
      })
      .select("id")
      .single();

    if (error || !trainer) {
      failures.push(candidate.displayName);
      continue;
    }

    const { error: assignmentError } = await actor.supabase
      .from("trainer_organization_assignments")
      .insert({ trainer_id: trainer.id, organization_id: organizationId });
    if (assignmentError) {
      failures.push(`${candidate.displayName} (created, not assigned)`);
      continue;
    }

    await writeAudit(actor, {
      organizationId,
      entityType: "trainer",
      entityId: trainer.id,
      action: "trainer_created",
      metadata: {
        display_name: candidate.displayName,
        source_name: candidate.sourceName,
        created_via: "setup_wizard_bulk",
      },
    });
    created += 1;
  }

  revalidatePath("/performance-operations/trainers");
  revalidatePath(`/performance-operations/setup/${organizationId}/trainers`);

  if (created === 0) {
    return { error: `Could not create any trainers. ${failures.join(", ")}` };
  }
  if (failures.length > 0) {
    return {
      message: `Created ${created} trainer${created === 1 ? "" : "s"}.`,
      error: `Could not create: ${failures.join(", ")}`,
    };
  }
  return { message: `Created ${created} trainer${created === 1 ? "" : "s"}.` };
}

const bulkServiceSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  services: z
    .array(
      z.object({
        sourceName: z.string().trim().min(1),
        displayName: z.string().trim().min(1).max(200),
        /** Additional source spellings to record as aliases. */
        aliases: z.array(z.string().trim().min(1)).default([]),
      })
    )
    .min(1, "Select at least one service.")
    .max(200, "Create at most 200 services at a time."),
});

/**
 * Create the selected discovered services and record every source
 * spelling as an alias, so the schedule's wording matches on the next
 * import without a separate alias screen.
 */
export async function bulkCreateServices(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Nothing to create." };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Nothing to create." };
  }

  const parsed = bulkServiceSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid selection." };
  }
  const { organizationId, services } = parsed.data;

  if (!actorCan(actor, organizationId, "service:manage")) return PERMISSION_DENIED;

  let created = 0;
  let aliasesRecorded = 0;
  const failures: string[] = [];

  // Services require a category. The wizard files everything under the
  // organization's "Other" heading, which the foundation seed creates for
  // every organization; the owner re-files services afterwards. Choosing
  // a category per service during setup would be guessing at a business
  // taxonomy the export does not carry.
  const { data: category } = await actor.supabase
    .from("service_categories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", "Other")
    .maybeSingle();
  const { data: fallbackCategory } = category
    ? { data: category }
    : await actor.supabase
        .from("service_categories")
        .select("id")
        .eq("organization_id", organizationId)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
  if (!fallbackCategory) {
    return {
      error:
        "This organization has no service categories, so services cannot be filed. Add a category first.",
    };
  }

  for (const candidate of services) {
    const { data: service, error } = await actor.supabase
      .from("services")
      .insert({
        organization_id: organizationId,
        category_id: fallbackCategory.id,
        internal_name: candidate.displayName,
        display_name: candidate.displayName,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !service) {
      failures.push(candidate.displayName);
      continue;
    }

    // Record every observed spelling, including the canonical one, so
    // matching is alias-driven from the first import onwards.
    const spellings = new Set([candidate.sourceName, ...candidate.aliases]);
    for (const alias of spellings) {
      const { error: aliasError } = await actor.supabase
        .from("service_source_aliases")
        .insert({
          organization_id: organizationId,
          service_id: service.id,
          source: "setmore",
          alias,
        });
      if (!aliasError) aliasesRecorded += 1;
    }

    await writeAudit(actor, {
      organizationId,
      entityType: "service",
      entityId: service.id,
      action: "service_created",
      metadata: {
        display_name: candidate.displayName,
        alias_count: spellings.size,
        created_via: "setup_wizard_bulk",
      },
    });
    created += 1;
  }

  revalidatePath("/performance-operations/configuration/services");
  revalidatePath(`/performance-operations/setup/${organizationId}/services`);

  if (created === 0) {
    return { error: `Could not create any services. ${failures.join(", ")}` };
  }
  const summary = `Created ${created} service${created === 1 ? "" : "s"} and ${aliasesRecorded} name match${aliasesRecorded === 1 ? "" : "es"}.`;
  if (failures.length > 0) {
    return { message: summary, error: `Could not create: ${failures.join(", ")}` };
  }
  return { message: summary };
}

const bulkAssignSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  effectiveFrom: z.iso.date("Choose a start date."),
  assignments: z
    .array(
      z.object({
        trainerId: z.uuid(),
        /** Assignments target a published plan VERSION, not a plan. */
        planVersionId: z.uuid(),
      })
    )
    .min(1, "Select at least one trainer.")
    .max(200),
});

/**
 * Assign compensation plans to many trainers at once.
 *
 * Replaces the per-trainer navigation the audit flagged as the worst
 * single screen in the product: one page load to set one dropdown,
 * repeated per trainer. The write is the same
 * `trainer_compensation_assignments` insert that screen performs, with
 * the same permission check.
 */
export async function bulkAssignCompensation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Nothing to assign." };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Nothing to assign." };
  }

  const parsed = bulkAssignSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid selection." };
  }
  const { organizationId, effectiveFrom, assignments } = parsed.data;

  if (!actorCan(actor, organizationId, "compensation:manage")) return PERMISSION_DENIED;

  // Only published versions may be assigned — the same rule the
  // per-trainer screen enforces. Verify once for the whole batch rather
  // than per row.
  const versionIds = [...new Set(assignments.map((a) => a.planVersionId))];
  const { data: versions } = await actor.supabase
    .from("compensation_plan_versions")
    .select("id, organization_id, status")
    .in("id", versionIds);
  const publishable = new Set(
    (versions ?? [])
      .filter((v) => v.status === "published" && v.organization_id === organizationId)
      .map((v) => v.id)
  );
  if (publishable.size === 0) {
    return { error: "Only published plan versions can be assigned. Publish the plan first." };
  }

  let assigned = 0;
  const failures: string[] = [];

  for (const assignment of assignments) {
    if (!publishable.has(assignment.planVersionId)) {
      failures.push(assignment.trainerId);
      continue;
    }

    // End any open assignment first: overlapping assignments for the same
    // trainer, organization, and purpose are refused by the database, and
    // that constraint is the authority on what "current plan" means.
    await actor.supabase
      .from("trainer_compensation_assignments")
      .update({ effective_to: effectiveFrom })
      .eq("organization_id", organizationId)
      .eq("trainer_id", assignment.trainerId)
      .eq("purpose", "primary")
      .is("effective_to", null)
      .lt("effective_from", effectiveFrom);

    const { error } = await actor.supabase
      .from("trainer_compensation_assignments")
      .insert({
        organization_id: organizationId,
        trainer_id: assignment.trainerId,
        plan_version_id: assignment.planVersionId,
        purpose: "primary",
        effective_from: effectiveFrom,
      });

    if (error) {
      failures.push(assignment.trainerId);
      continue;
    }

    await writeAudit(actor, {
      organizationId,
      entityType: "trainer_compensation_assignment",
      entityId: assignment.trainerId,
      action: "trainer_compensation_assigned",
      metadata: {
        trainer_id: assignment.trainerId,
        plan_version_id: assignment.planVersionId,
        purpose: "primary",
        effective_from: effectiveFrom,
        assigned_via: "setup_wizard_bulk",
      },
    });
    assigned += 1;
  }

  revalidatePath(`/performance-operations/setup/${organizationId}/compensation`);
  revalidatePath("/performance-operations/trainers");

  if (assigned === 0) {
    return { error: "Could not assign any plans. Check for existing assignments that overlap." };
  }
  if (failures.length > 0) {
    return {
      message: `Assigned ${assigned} plan${assigned === 1 ? "" : "s"}.`,
      error: `${failures.length} could not be assigned; they may already have a plan starting on this date.`,
    };
  }
  return { message: `Assigned ${assigned} plan${assigned === 1 ? "" : "s"}.` };
}
