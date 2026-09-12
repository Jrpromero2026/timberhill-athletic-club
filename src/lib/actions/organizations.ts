"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { planPeriods } from "@/lib/dates/period-plan";
import type { PeriodType } from "@/lib/dates/period-plan";
import { availableSlug, slugify } from "@/lib/data/organization-setup";
import {
  getActorContext,
  actorIsPlatformAdmin,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

/**
 * Organization creation for the setup wizard.
 *
 * Before Phase 9.5 organizations existed only as seed SQL — `org:create`
 * was granted but had no UI. This action is the orchestration screen the
 * audit identified as genuinely missing; it adds no business rules.
 *
 * Authority stays with the database: `organizations_insert` requires
 * `app.is_platform_admin()`, so the check here fails closed in the UI
 * and RLS refuses anything that slips past. Platform admins bypass
 * org-scoped permission checks inside `app.has_permission_in`, which is
 * what lets the creator seed their own membership into a workspace that
 * did not exist a moment earlier.
 */

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organization name.").max(120),
  timezone: z.string().trim().min(1, "Choose a time zone.").max(60),
  payrollFrequency: z.enum(["monthly", "semi_monthly", "biweekly", "custom"]),
});

/**
 * Wizard step 1. Creates the organization, gives the creator an explicit
 * platform-admin membership so the workspace is reachable, and generates
 * the reporting period covering today at the chosen cadence.
 *
 * Periods covering an uploaded schedule's full date range are generated
 * in step 2, once that range is known — the wizard never asks an owner
 * to draw calendar boundaries by hand.
 */
export async function createOrganization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  if (!actorIsPlatformAdmin(actor)) return PERMISSION_DENIED;

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    payrollFrequency: formData.get("payrollFrequency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;

  const slug = await availableSlug(actor, slugify(values.name));

  const { data: organization, error } = await actor.supabase
    .from("organizations")
    .insert({
      slug,
      name: values.name,
      timezone: values.timezone,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !organization) {
    if (error?.code === "23505") {
      return { error: "An organization with that name already exists." };
    }
    return { error: "Could not create the organization." };
  }

  // The creator must be able to reach the workspace they just made.
  const { data: adminRole } = await actor.supabase
    .from("roles")
    .select("id")
    .eq("key", "platform_admin")
    .single();
  if (adminRole) {
    await actor.supabase.from("organization_memberships").insert({
      profile_id: actor.userId,
      organization_id: organization.id,
      role_id: adminRole.id,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const planned = planPeriods(today, today, values.payrollFrequency as PeriodType);
  for (const period of planned) {
    await actor.supabase.from("reporting_periods").insert({
      organization_id: organization.id,
      label: period.label,
      period_type: period.periodType,
      start_date: period.startDate,
      end_date: period.endDate,
      payment_date: null,
      notes: "",
      status: "open",
    });
  }

  await writeAudit(actor, {
    organizationId: organization.id,
    entityType: "organization",
    entityId: organization.id,
    action: "organization_created",
    metadata: {
      slug,
      timezone: values.timezone,
      payroll_frequency: values.payrollFrequency,
      periods_generated: planned.length,
      created_via: "setup_wizard",
    },
  });

  revalidatePath("/performance-operations/setup");
  redirect(`/performance-operations/setup/${organization.id}`);
}
