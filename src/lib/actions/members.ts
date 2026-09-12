"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  getActorContext,
  actorCan,
  grantableRoles,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "./shared";

/**
 * User and access management actions. Every action:
 *  1. re-derives the actor's memberships server-side (client input is never
 *     trusted for roles/organizations),
 *  2. applies deny-by-default permission checks + escalation guards,
 *  3. writes an audit event,
 *  4. relies on RLS (including the restrictive can_grant_role policies) as
 *     the final enforcement layer.
 */

const USERS_PATH = "/performance-operations/configuration/users";

/* ---------------------------------------------------------------- invites */

const inviteSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  organizationId: z.uuid(),
  roleId: z.uuid(),
  departmentIds: z.array(z.uuid()).max(20).default([]),
});

export async function createInvitation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    organizationId: formData.get("organizationId"),
    roleId: formData.get("roleId"),
    departmentIds: formData.getAll("departmentIds"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email, organization, and role." };
  }
  const { email, organizationId, roleId, departmentIds } = parsed.data;

  if (!actorCan(actor, organizationId, "member:manage")) {
    return PERMISSION_DENIED;
  }

  // Escalation guard: the chosen role must be grantable by this actor.
  const { data: roles } = await actor.supabase.from("roles").select("id, key");
  const allowed = grantableRoles(actor, organizationId, roles ?? []);
  if (!allowed.some((r) => r.id === roleId)) {
    return { error: "You are not authorized to grant that role." };
  }

  // Departments must belong to the target organization.
  if (departmentIds.length > 0) {
    const { data: departments } = await actor.supabase
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", departmentIds);
    if ((departments ?? []).length !== departmentIds.length) {
      return { error: "One or more departments do not belong to that organization." };
    }
  }

  // Raw token goes only into the link shown once; the DB stores its hash.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const { data: invitation, error } = await actor.supabase
    .from("invitations")
    .insert({
      email,
      organization_id: organizationId,
      role_id: roleId,
      department_ids: departmentIds,
      token_hash: tokenHash,
      invited_by: actor.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "A pending invitation already exists for that email in this organization. Revoke it first to send a new one.",
      };
    }
    return { error: "Could not create the invitation." };
  }

  await writeAudit(actor, {
    organizationId,
    entityType: "invitation",
    entityId: invitation.id,
    action: "invitation_created",
    metadata: { email, role_id: roleId, department_count: departmentIds.length },
  });

  revalidatePath(USERS_PATH);
  return {
    message:
      "Invitation created. Share this link with the invitee — it is shown only once and expires in 14 days.",
    data: {
      inviteLink: `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`,
    },
  };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("invitationId"));
  if (!id.success) return;

  const { data: invitation } = await actor.supabase
    .from("invitations")
    .select("id, organization_id, email, status")
    .eq("id", id.data)
    .maybeSingle();
  if (!invitation || invitation.status !== "pending") return;
  if (!actorCan(actor, invitation.organization_id, "member:manage")) return;

  const { error } = await actor.supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitation.id)
    .eq("status", "pending");

  if (!error) {
    await writeAudit(actor, {
      organizationId: invitation.organization_id,
      entityType: "invitation",
      entityId: invitation.id,
      action: "invitation_revoked",
      metadata: { email: invitation.email },
    });
  }
  revalidatePath(USERS_PATH);
}

/* ------------------------------------------------------------ memberships */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** effective_to must exceed effective_from; ending on day one ends tomorrow. */
function endDateFor(effectiveFrom: string): string {
  const today = todayIso();
  if (effectiveFrom < today) return today;
  const next = new Date(`${effectiveFrom}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function endMembership(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const id = z.uuid().safeParse(formData.get("membershipId"));
  if (!id.success) return { error: "Invalid membership." };

  const { data: membership } = await actor.supabase
    .from("organization_memberships")
    .select("id, profile_id, organization_id, effective_from, effective_to, roles ( key )")
    .eq("id", id.data)
    .maybeSingle();
  if (!membership || membership.effective_to !== null) {
    return { error: "Membership not found or already inactive." };
  }
  if (membership.profile_id === actor.userId) {
    return { error: "You cannot deactivate your own access." };
  }
  if (!actorCan(actor, membership.organization_id, "member:manage")) {
    return PERMISSION_DENIED;
  }
  // A non-platform-admin cannot touch a platform_admin membership.
  const targetRole = (membership.roles as unknown as { key: string } | null)?.key;
  const rolesList = targetRole ? [{ id: "x", key: targetRole }] : [];
  if (
    targetRole === "platform_admin" &&
    grantableRoles(actor, membership.organization_id, rolesList).length === 0
  ) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase
    .from("organization_memberships")
    .update({ effective_to: endDateFor(membership.effective_from), is_default: false })
    .eq("id", membership.id);
  if (error) return { error: "Could not deactivate the membership." };

  await writeAudit(actor, {
    organizationId: membership.organization_id,
    entityType: "organization_membership",
    entityId: membership.id,
    action: "membership_deactivated",
    metadata: { profile_id: membership.profile_id, previous_role: targetRole ?? "unknown" },
  });
  revalidatePath(USERS_PATH);
  return { message: "Membership deactivated. Historical records are preserved." };
}

const roleChangeSchema = z.object({
  membershipId: z.uuid(),
  newRoleId: z.uuid(),
});

export async function changeMembershipRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = roleChangeSchema.safeParse({
    membershipId: formData.get("membershipId"),
    newRoleId: formData.get("newRoleId"),
  });
  if (!parsed.success) return { error: "Invalid role selection." };

  const { data: membership } = await actor.supabase
    .from("organization_memberships")
    .select("id, profile_id, organization_id, role_id, is_default, effective_from, effective_to, roles ( key )")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!membership || membership.effective_to !== null) {
    return { error: "Membership not found or inactive." };
  }
  if (membership.profile_id === actor.userId) {
    return { error: "You cannot change your own role." };
  }
  if (!actorCan(actor, membership.organization_id, "member:manage")) {
    return PERMISSION_DENIED;
  }
  if (membership.role_id === parsed.data.newRoleId) {
    return { message: "No change — that is already the member's role." };
  }

  const { data: roles } = await actor.supabase.from("roles").select("id, key");
  const allowed = grantableRoles(actor, membership.organization_id, roles ?? []);
  const currentRoleKey = (membership.roles as unknown as { key: string } | null)?.key;
  // Must be able to grant BOTH the new role and displace the old one.
  if (!allowed.some((r) => r.id === parsed.data.newRoleId)) {
    return { error: "You are not authorized to grant that role." };
  }
  if (currentRoleKey === "platform_admin" && !allowed.some((r) => r.key === "platform_admin")) {
    return PERMISSION_DENIED;
  }

  // Close the current membership, then open a new one with the new role.
  const { error: endError } = await actor.supabase
    .from("organization_memberships")
    .update({ effective_to: endDateFor(membership.effective_from), is_default: false })
    .eq("id", membership.id);
  if (endError) return { error: "Could not update the membership." };

  const { data: created, error: createError } = await actor.supabase
    .from("organization_memberships")
    .insert({
      profile_id: membership.profile_id,
      organization_id: membership.organization_id,
      role_id: parsed.data.newRoleId,
      is_default: membership.is_default,
      effective_from: todayIso(),
    })
    .select("id")
    .single();
  if (createError) {
    return {
      error:
        "The old role was closed but the new role could not be created. Review this member's access.",
    };
  }

  await writeAudit(actor, {
    organizationId: membership.organization_id,
    entityType: "organization_membership",
    entityId: created.id,
    action: "membership_role_changed",
    metadata: {
      profile_id: membership.profile_id,
      previous_role_id: membership.role_id,
      new_role_id: parsed.data.newRoleId,
    },
  });
  revalidatePath(USERS_PATH);
  return { message: "Role updated (previous assignment preserved in history)." };
}

export async function setDefaultOrganization(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("membershipId"));
  if (!id.success) return;

  const { data: membership } = await actor.supabase
    .from("organization_memberships")
    .select("id, profile_id, organization_id, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!membership || membership.effective_to !== null) return;
  if (!actorCan(actor, membership.organization_id, "member:manage")) return;

  // Clear other defaults for this profile (limited to orgs the actor manages
  // via RLS), then set the chosen one.
  await actor.supabase
    .from("organization_memberships")
    .update({ is_default: false })
    .eq("profile_id", membership.profile_id)
    .is("effective_to", null);
  await actor.supabase
    .from("organization_memberships")
    .update({ is_default: true })
    .eq("id", membership.id);

  await writeAudit(actor, {
    organizationId: membership.organization_id,
    entityType: "organization_membership",
    entityId: membership.id,
    action: "default_organization_set",
    metadata: { profile_id: membership.profile_id },
  });
  revalidatePath(USERS_PATH);
}

/* --------------------------------------------------- department scoping */

const deptMembershipSchema = z.object({
  profileId: z.uuid(),
  organizationId: z.uuid(),
  departmentId: z.uuid(),
});

export async function addDepartmentMembership(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = deptMembershipSchema.safeParse({
    profileId: formData.get("profileId"),
    organizationId: formData.get("organizationId"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) return { error: "Invalid department selection." };

  if (!actorCan(actor, parsed.data.organizationId, "member:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase.from("department_memberships").insert({
    profile_id: parsed.data.profileId,
    organization_id: parsed.data.organizationId,
    department_id: parsed.data.departmentId,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That member already has access to this department." };
    }
    return { error: "Could not add the department access." };
  }

  await writeAudit(actor, {
    organizationId: parsed.data.organizationId,
    entityType: "department_membership",
    action: "department_membership_added",
    metadata: {
      profile_id: parsed.data.profileId,
      department_id: parsed.data.departmentId,
    },
  });
  revalidatePath(USERS_PATH);
  return { message: "Department access added." };
}

export async function endDepartmentMembership(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const id = z.uuid().safeParse(formData.get("departmentMembershipId"));
  if (!id.success) return;

  const { data: row } = await actor.supabase
    .from("department_memberships")
    .select("id, profile_id, organization_id, department_id, effective_from, effective_to")
    .eq("id", id.data)
    .maybeSingle();
  if (!row || row.effective_to !== null) return;
  if (!actorCan(actor, row.organization_id, "member:manage")) return;

  await actor.supabase
    .from("department_memberships")
    .update({ effective_to: endDateFor(row.effective_from) })
    .eq("id", row.id);

  await writeAudit(actor, {
    organizationId: row.organization_id,
    entityType: "department_membership",
    entityId: row.id,
    action: "department_membership_ended",
    metadata: { profile_id: row.profile_id, department_id: row.department_id },
  });
  revalidatePath(USERS_PATH);
}
