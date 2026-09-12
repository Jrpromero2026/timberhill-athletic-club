"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MoneyError, parseBasisPoints, parseCents } from "@/lib/money/money";
import { COMPENSATION_METHODS, RULE_TYPES } from "@/lib/schemas/compensation";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

/**
 * Compensation CONFIGURATION actions — no calculation behavior.
 * Money is integer cents; rates are integer basis points; parsing never
 * touches floating point. Published versions are immutable (DB trigger +
 * RLS back these checks).
 */

const COMP_PATH = "/performance-operations/configuration/compensation";

/* ------------------------------------------------------------------ plans */

const planSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  name: z.string().trim().min(1, "Plan name is required.").max(160),
  description: z.string().max(2000).optional().default(""),
  compensationMethod: z.enum(COMPENSATION_METHODS),
  tierBehavior: z.enum(["cliff", "marginal", "not_applicable"]),
  effectiveFrom: z.iso.date("Enter an effective start date."),
  notes: z.string().max(2000).optional().default(""),
});

export async function createPlan(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = planSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    compensationMethod: formData.get("compensationMethod"),
    tierBehavior: formData.get("tierBehavior"),
    effectiveFrom: formData.get("effectiveFrom"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;

  if (!actorCan(actor, values.organizationId, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  const { data: plan, error } = await actor.supabase
    .from("compensation_plans")
    .insert({
      organization_id: values.organizationId,
      name: values.name,
      description: values.description,
      notes: values.notes,
    })
    .select("id")
    .single();
  if (error || !plan) {
    if (error?.code === "23505") {
      return { error: "A plan with that name already exists in this organization." };
    }
    return { error: "Could not create the plan." };
  }

  const { data: version, error: versionError } = await actor.supabase
    .from("compensation_plan_versions")
    .insert({
      plan_id: plan.id,
      organization_id: values.organizationId,
      version_number: 1,
      compensation_method: values.compensationMethod,
      tier_behavior: values.tierBehavior,
      effective_from: values.effectiveFrom,
      status: "draft",
    })
    .select("id")
    .single();
  if (versionError || !version) {
    return { error: "Plan created but version 1 failed — open the plan to retry." };
  }

  await writeAudit(actor, {
    organizationId: values.organizationId,
    entityType: "compensation_plan",
    entityId: plan.id,
    action: "compensation_plan_created",
    metadata: {
      name: values.name,
      method: values.compensationMethod,
      tier_behavior: values.tierBehavior,
    },
  });

  revalidatePath(COMP_PATH);
  redirect(`${COMP_PATH}/${plan.id}`);
}

/* ---------------------------------------------------------------- versions */

export async function publishVersion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const id = z.uuid().safeParse(formData.get("versionId"));
  if (!id.success) return { error: "Invalid version." };

  const { data: version } = await actor.supabase
    .from("compensation_plan_versions")
    .select("id, plan_id, organization_id, version_number, status, tier_behavior")
    .eq("id", id.data)
    .maybeSingle();
  if (!version) return { error: "Version not found." };
  if (version.status !== "draft") return { error: "Only drafts can be published." };
  if (!actorCan(actor, version.organization_id, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  const [{ count: tierCount }, { count: ruleCount }] = await Promise.all([
    actor.supabase
      .from("commission_tiers")
      .select("id", { count: "exact", head: true })
      .eq("plan_version_id", version.id),
    actor.supabase
      .from("compensation_rules")
      .select("id", { count: "exact", head: true })
      .eq("plan_version_id", version.id),
  ]);
  if ((tierCount ?? 0) === 0 && (ruleCount ?? 0) === 0) {
    return {
      error:
        "Add at least one rule or commission tier before publishing — an empty version cannot pay anyone.",
    };
  }
  if (version.tier_behavior !== "not_applicable" && (tierCount ?? 0) === 0) {
    return { error: "Tiered plans need at least one commission tier before publishing." };
  }

  const { error } = await actor.supabase
    .from("compensation_plan_versions")
    .update({ status: "published" })
    .eq("id", version.id);
  if (error) return { error: "Could not publish the version." };

  await writeAudit(actor, {
    organizationId: version.organization_id,
    entityType: "compensation_plan_version",
    entityId: version.id,
    action: "compensation_version_published",
    metadata: {
      plan_id: version.plan_id,
      version_number: version.version_number,
      tier_count: tierCount ?? 0,
      rule_count: ruleCount ?? 0,
    },
  });
  revalidatePath(`${COMP_PATH}/${version.plan_id}`);
  return { message: `Version ${version.version_number} published — its substance is now frozen.` };
}

/** Create a new draft by copying the latest version's rules and tiers. */
export async function createNewVersion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const id = z.uuid().safeParse(formData.get("planId"));
  if (!id.success) return { error: "Invalid plan." };

  const { data: plan } = await actor.supabase
    .from("compensation_plans")
    .select("id, organization_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!plan) return { error: "Plan not found." };
  if (!actorCan(actor, plan.organization_id, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  const { data: latest } = await actor.supabase
    .from("compensation_plan_versions")
    .select("*")
    .eq("plan_id", plan.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { error: "The plan has no versions to copy." };
  if (latest.status === "draft") {
    return { error: "There is already an unpublished draft — edit that instead." };
  }

  const { data: draft, error } = await actor.supabase
    .from("compensation_plan_versions")
    .insert({
      plan_id: plan.id,
      organization_id: plan.organization_id,
      version_number: latest.version_number + 1,
      compensation_method: latest.compensation_method,
      tier_behavior: latest.tier_behavior,
      effective_from: new Date().toISOString().slice(0, 10),
      status: "draft",
      notes: `Derived from version ${latest.version_number}.`,
    })
    .select("id, version_number")
    .single();
  if (error || !draft) return { error: "Could not create the new version." };

  const [{ data: tiers }, { data: rules }] = await Promise.all([
    actor.supabase
      .from("commission_tiers")
      .select("sequence, min_revenue_cents, max_revenue_cents, rate_basis_points")
      .eq("plan_version_id", latest.id),
    actor.supabase
      .from("compensation_rules")
      .select("rule_type, amount_cents, rate_basis_points, notes")
      .eq("plan_version_id", latest.id),
  ]);
  if (tiers && tiers.length > 0) {
    await actor.supabase.from("commission_tiers").insert(
      tiers.map((tier) => ({
        ...tier,
        plan_version_id: draft.id,
        organization_id: plan.organization_id,
      }))
    );
  }
  if (rules && rules.length > 0) {
    await actor.supabase.from("compensation_rules").insert(
      rules.map((rule) => ({
        ...rule,
        plan_version_id: draft.id,
        organization_id: plan.organization_id,
      }))
    );
  }

  await writeAudit(actor, {
    organizationId: plan.organization_id,
    entityType: "compensation_plan_version",
    entityId: draft.id,
    action: "compensation_version_drafted",
    metadata: { plan_id: plan.id, version_number: draft.version_number, copied_from: latest.version_number },
  });
  revalidatePath(`${COMP_PATH}/${plan.id}`);
  return { message: `Draft version ${draft.version_number} created from version ${latest.version_number}.` };
}

/* ------------------------------------------------------------------- tiers */

const tierSchema = z.object({
  versionId: z.uuid(),
  sequence: z.coerce.number().int().min(1).max(50),
  minRevenue: z.string().trim().min(1, "Minimum revenue is required."),
  maxRevenue: z.string().trim().optional().default(""),
  ratePercent: z.string().trim().min(1, "Rate is required."),
});

export async function addTier(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = tierSchema.safeParse({
    versionId: formData.get("versionId"),
    sequence: formData.get("sequence"),
    minRevenue: formData.get("minRevenue"),
    maxRevenue: formData.get("maxRevenue") ?? "",
    ratePercent: formData.get("ratePercent"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid tier." };
  }

  let minCents: number;
  let maxCents: number | null = null;
  let rateBp: number;
  try {
    minCents = parseCents(parsed.data.minRevenue);
    if (parsed.data.maxRevenue) maxCents = parseCents(parsed.data.maxRevenue);
    rateBp = parseBasisPoints(parsed.data.ratePercent);
  } catch (e) {
    return { error: e instanceof MoneyError ? e.message : "Invalid money value." };
  }
  if (minCents < 0) return { error: "Minimum revenue cannot be negative." };
  if (maxCents !== null && maxCents <= minCents) {
    return { error: "Maximum revenue must exceed the minimum." };
  }

  const { data: version } = await actor.supabase
    .from("compensation_plan_versions")
    .select("id, plan_id, organization_id, status")
    .eq("id", parsed.data.versionId)
    .maybeSingle();
  if (!version) return { error: "Version not found." };
  if (version.status !== "draft") {
    return { error: "Published versions are immutable — create a new version instead." };
  }
  if (!actorCan(actor, version.organization_id, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase.from("commission_tiers").insert({
    plan_version_id: version.id,
    organization_id: version.organization_id,
    sequence: parsed.data.sequence,
    min_revenue_cents: minCents,
    max_revenue_cents: maxCents,
    rate_basis_points: rateBp,
  });
  if (error) {
    if (error.code === "23P01") {
      return { error: "This tier's revenue range overlaps an existing tier." };
    }
    if (error.code === "23505") {
      return { error: "A tier with that sequence number already exists." };
    }
    return { error: "Could not add the tier." };
  }

  await writeAudit(actor, {
    organizationId: version.organization_id,
    entityType: "commission_tier",
    entityId: version.id,
    action: "commission_tier_added",
    metadata: {
      plan_id: version.plan_id,
      sequence: parsed.data.sequence,
      min_revenue_cents: minCents,
      max_revenue_cents: maxCents,
      rate_basis_points: rateBp,
    },
  });
  revalidatePath(`${COMP_PATH}/${version.plan_id}`);
  return { message: "Tier added." };
}

export async function deleteTier(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("tierId"));
  if (!id.success) return;

  const { data: tier } = await actor.supabase
    .from("commission_tiers")
    .select("id, plan_version_id, organization_id, sequence, compensation_plan_versions ( plan_id, status )")
    .eq("id", id.data)
    .maybeSingle();
  if (!tier) return;
  const version = tier.compensation_plan_versions as unknown as {
    plan_id: string;
    status: string;
  } | null;
  if (!version || version.status !== "draft") return;
  if (!actorCan(actor, tier.organization_id, "compensation:manage")) return;

  await actor.supabase.from("commission_tiers").delete().eq("id", tier.id);
  await writeAudit(actor, {
    organizationId: tier.organization_id,
    entityType: "commission_tier",
    entityId: tier.plan_version_id,
    action: "commission_tier_removed",
    metadata: { sequence: tier.sequence },
  });
  revalidatePath(`${COMP_PATH}/${version.plan_id}`);
}

/* ------------------------------------------------------------------- rules */

const ruleSchema = z.object({
  versionId: z.uuid(),
  ruleType: z.enum(RULE_TYPES),
  valueKind: z.enum(["amount", "rate"]),
  value: z.string().trim().min(1, "A value is required."),
});

export async function addRule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = ruleSchema.safeParse({
    versionId: formData.get("versionId"),
    ruleType: formData.get("ruleType"),
    valueKind: formData.get("valueKind"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rule." };
  }

  let amountCents: number | null = null;
  let rateBp: number | null = null;
  try {
    if (parsed.data.valueKind === "amount") {
      amountCents = parseCents(parsed.data.value);
      if (amountCents < 0) return { error: "Amounts cannot be negative." };
    } else {
      rateBp = parseBasisPoints(parsed.data.value);
    }
  } catch (e) {
    return { error: e instanceof MoneyError ? e.message : "Invalid value." };
  }

  const { data: version } = await actor.supabase
    .from("compensation_plan_versions")
    .select("id, plan_id, organization_id, status")
    .eq("id", parsed.data.versionId)
    .maybeSingle();
  if (!version) return { error: "Version not found." };
  if (version.status !== "draft") {
    return { error: "Published versions are immutable — create a new version instead." };
  }
  if (!actorCan(actor, version.organization_id, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase.from("compensation_rules").insert({
    plan_version_id: version.id,
    organization_id: version.organization_id,
    rule_type: parsed.data.ruleType,
    amount_cents: amountCents,
    rate_basis_points: rateBp,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "This version already has a rule of that type." };
    }
    return { error: "Could not add the rule." };
  }

  await writeAudit(actor, {
    organizationId: version.organization_id,
    entityType: "compensation_rule",
    entityId: version.id,
    action: "compensation_rule_added",
    metadata: {
      plan_id: version.plan_id,
      rule_type: parsed.data.ruleType,
      amount_cents: amountCents,
      rate_basis_points: rateBp,
    },
  });
  revalidatePath(`${COMP_PATH}/${version.plan_id}`);
  return { message: "Rule added." };
}

export async function deleteRule(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("ruleId"));
  if (!id.success) return;

  const { data: rule } = await actor.supabase
    .from("compensation_rules")
    .select("id, plan_version_id, organization_id, rule_type, compensation_plan_versions ( plan_id, status )")
    .eq("id", id.data)
    .maybeSingle();
  if (!rule) return;
  const version = rule.compensation_plan_versions as unknown as {
    plan_id: string;
    status: string;
  } | null;
  if (!version || version.status !== "draft") return;
  if (!actorCan(actor, rule.organization_id, "compensation:manage")) return;

  await actor.supabase.from("compensation_rules").delete().eq("id", rule.id);
  await writeAudit(actor, {
    organizationId: rule.organization_id,
    entityType: "compensation_rule",
    entityId: rule.plan_version_id,
    action: "compensation_rule_removed",
    metadata: { rule_type: rule.rule_type },
  });
  revalidatePath(`${COMP_PATH}/${version.plan_id}`);
}

/* ------------------------------------------------- trainer assignments */

const assignmentSchema = z.object({
  trainerId: z.uuid(),
  planVersionId: z.uuid("Choose a plan version."),
  purpose: z.enum(["primary", "team_training", "evaluations", "nutrition", "administrative"]),
  effectiveFrom: z.iso.date("Enter an effective start date."),
  effectiveTo: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
});

export async function assignTrainerCompensation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = assignmentSchema.safeParse({
    trainerId: formData.get("trainerId"),
    planVersionId: formData.get("planVersionId"),
    purpose: formData.get("purpose"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment." };
  }
  const values = parsed.data;
  if (values.effectiveTo && values.effectiveTo <= values.effectiveFrom) {
    return { error: "End date must be after the start date." };
  }

  const { data: version } = await actor.supabase
    .from("compensation_plan_versions")
    .select("id, organization_id, status, version_number, compensation_plans ( name )")
    .eq("id", values.planVersionId)
    .maybeSingle();
  if (!version) return { error: "Plan version not found." };
  if (version.status !== "published") {
    return { error: "Only published plan versions can be assigned." };
  }
  if (!actorCan(actor, version.organization_id, "compensation:manage")) {
    return PERMISSION_DENIED;
  }

  // The trainer must have an active assignment in the version's organization.
  const { data: orgAssignment } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("id")
    .eq("trainer_id", values.trainerId)
    .eq("organization_id", version.organization_id)
    .is("effective_to", null)
    .maybeSingle();
  if (!orgAssignment) {
    return { error: "The trainer has no active assignment in that plan's organization." };
  }

  const { error } = await actor.supabase
    .from("trainer_compensation_assignments")
    .insert({
      trainer_id: values.trainerId,
      organization_id: version.organization_id,
      plan_version_id: version.id,
      purpose: values.purpose,
      effective_from: values.effectiveFrom,
      effective_to: values.effectiveTo,
    });
  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "This assignment overlaps an existing assignment for the same trainer, organization, and purpose. End the current one first.",
      };
    }
    return { error: "Could not create the assignment." };
  }

  await writeAudit(actor, {
    organizationId: version.organization_id,
    entityType: "trainer_compensation_assignment",
    entityId: values.trainerId,
    action: "trainer_compensation_assigned",
    metadata: {
      trainer_id: values.trainerId,
      plan_version_id: version.id,
      purpose: values.purpose,
      effective_from: values.effectiveFrom,
    },
  });
  revalidatePath(`/performance-operations/trainers/${values.trainerId}/compensation`);
  return { message: "Compensation assignment created." };
}

export async function endTrainerCompensationAssignment(
  formData: FormData
): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("assignmentId"));
  if (!id.success) return;

  const { data: assignment } = await actor.supabase
    .from("trainer_compensation_assignments")
    .select("id, trainer_id, organization_id, purpose, effective_from, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!assignment || assignment.effective_to !== null) return;
  if (!actorCan(actor, assignment.organization_id, "compensation:manage")) return;

  const today = new Date().toISOString().slice(0, 10);
  const endDate =
    assignment.effective_from < today
      ? today
      : new Date(Date.parse(assignment.effective_from) + 86_400_000)
          .toISOString()
          .slice(0, 10);

  await actor.supabase
    .from("trainer_compensation_assignments")
    .update({ effective_to: endDate })
    .eq("id", assignment.id);

  await writeAudit(actor, {
    organizationId: assignment.organization_id,
    entityType: "trainer_compensation_assignment",
    entityId: assignment.id,
    action: "trainer_compensation_assignment_ended",
    metadata: { trainer_id: assignment.trainer_id, purpose: assignment.purpose },
  });
  revalidatePath(`/performance-operations/trainers/${assignment.trainer_id}/compensation`);
}
