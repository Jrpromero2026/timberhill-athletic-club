import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  endDepartmentMembership,
  revokeInvitation,
  setDefaultOrganization,
} from "@/lib/actions/members";
import { grantableRoles, getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { InviteForm } from "./invite-form";
import {
  AddDepartmentAccess,
  EndMembershipButton,
  RoleChanger,
} from "./member-row-actions";

export const metadata: Metadata = { title: "Users & Access" };

export default async function UsersPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return (
      <PermissionDenied title="Users & Access" />
    );
  }

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "member:read")
  );
  if (!canRead) return <PermissionDenied title="Users & Access" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Users & Access" />;

  const [membershipsRes, invitationsRes, rolesRes, departmentsRes, deptMembershipsRes] =
    await Promise.all([
      actor.supabase
        .from("organization_memberships")
        .select(
          "id, profile_id, organization_id, role_id, is_default, effective_from, effective_to, profiles ( full_name, email, status ), roles ( name, key ), organizations ( name )"
        )
        .in("organization_id", orgIds)
        .order("effective_from", { ascending: false }),
      actor.supabase
        .from("invitations")
        .select("id, email, status, expires_at, organization_id, roles ( name ), organizations ( name )")
        .in("organization_id", orgIds)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      actor.supabase.from("roles").select("id, key, name").order("name"),
      actor.supabase
        .from("departments")
        .select("id, name, organization_id")
        .in("organization_id", orgIds)
        .eq("status", "active")
        .order("name"),
      actor.supabase
        .from("department_memberships")
        .select("id, profile_id, organization_id, department_id, effective_to, departments ( name )")
        .in("organization_id", orgIds)
        .is("effective_to", null),
    ]);

  interface MemberRow {
    id: string;
    profile_id: string;
    organization_id: string;
    role_id: string;
    is_default: boolean;
    effective_from: string;
    effective_to: string | null;
    profiles: { full_name: string; email: string; status: string } | null;
    roles: { name: string; key: string } | null;
    organizations: { name: string } | null;
  }
  interface InviteRow {
    id: string;
    email: string;
    status: string;
    expires_at: string;
    organization_id: string;
    roles: { name: string } | null;
    organizations: { name: string } | null;
  }
  interface DeptMembershipRow {
    id: string;
    profile_id: string;
    organization_id: string;
    department_id: string;
    departments: { name: string } | null;
  }

  const members = (membershipsRes.data ?? []) as unknown as MemberRow[];
  const invitations = (invitationsRes.data ?? []) as unknown as InviteRow[];
  const roles = rolesRes.data ?? [];
  const departments = departmentsRes.data ?? [];
  const deptMemberships = (deptMembershipsRes.data ?? []) as unknown as DeptMembershipRow[];

  const activeMembers = members.filter((m) => m.effective_to === null);
  const pastMembers = members.filter((m) => m.effective_to !== null);

  // Organizations where the actor can manage members, with grantable roles.
  const manageableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "member:manage")
  );
  const departmentsByOrg: Record<string, { id: string; name: string }[]> = {};
  for (const dept of departments) {
    (departmentsByOrg[dept.organization_id] ??= []).push({
      id: dept.id,
      name: dept.name,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access"
        description="Invite users, manage organization memberships, roles, and department scoping. Every change is audited; deactivation preserves history."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section
          aria-label="Invite a user"
          className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-ink">Invite a user</h2>
          {manageableOrgs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              You do not have member-management access in this workspace.
            </p>
          ) : (
            <InviteForm
              organizations={manageableOrgs}
              roles={grantableRoles(
                actor,
                manageableOrgs[0]?.id ?? "",
                roles
              ).map((r) => ({
                ...r,
                name: roles.find((x) => x.id === r.id)?.name ?? r.key,
              }))}
              departmentsByOrg={departmentsByOrg}
            />
          )}
        </section>

        <section
          aria-label="Pending invitations"
          className="xl:col-span-2 rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Pending invitations</h2>
            <span className="text-xs text-ink-muted">{invitations.length}</span>
          </div>
          {invitations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">
              No pending invitations.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Expires</th>
                  <th className="px-4 py-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invite) => (
                  <tr key={invite.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{invite.email}</td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {invite.organizations?.name}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{invite.roles?.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {invite.expires_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5">
                      <form action={revokeInvitation}>
                        <input type="hidden" name="invitationId" value={invite.id} />
                        <button
                          type="submit"
                          className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section
        aria-label="Active members"
        className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Active members</h2>
          <span className="text-xs text-ink-muted">{activeMembers.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Departments</th>
                <th className="px-4 py-2 font-medium">Since</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((member) => {
                const canManage = hasPermissionInOrganization(
                  context.memberships,
                  member.organization_id,
                  "member:manage"
                );
                const isSelf = member.profile_id === context.userId;
                const memberDepts = deptMemberships.filter(
                  (d) =>
                    d.profile_id === member.profile_id &&
                    d.organization_id === member.organization_id
                );
                const rowRoles = grantableRoles(actor, member.organization_id, roles).map(
                  (r) => ({
                    id: r.id,
                    name: roles.find((x) => x.id === r.id)?.name ?? r.key,
                  })
                );
                return (
                  <tr key={member.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">
                        {member.profiles?.full_name || member.profiles?.email}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-ink-muted">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">{member.profiles?.email}</p>
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {member.organizations?.name}
                    </td>
                    <td className="px-4 py-2.5">
                      {canManage && !isSelf ? (
                        <RoleChanger
                          membershipId={member.id}
                          currentRoleId={member.role_id}
                          roles={rowRoles}
                          disabled={false}
                        />
                      ) : (
                        <span className="text-ink-secondary">{member.roles?.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {memberDepts.map((dept) => (
                          <form key={dept.id} action={endDepartmentMembership} className="inline-flex">
                            <input
                              type="hidden"
                              name="departmentMembershipId"
                              value={dept.id}
                            />
                            <button
                              type="submit"
                              title="Remove department access"
                              disabled={!canManage}
                              className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-secondary hover:bg-negative-soft hover:text-negative disabled:pointer-events-none"
                            >
                              {dept.departments?.name}
                              {canManage && <span aria-hidden>×</span>}
                            </button>
                          </form>
                        ))}
                        {canManage && (
                          <AddDepartmentAccess
                            profileId={member.profile_id}
                            organizationId={member.organization_id}
                            departments={(departmentsByOrg[member.organization_id] ?? []).filter(
                              (d) => !memberDepts.some((md) => md.department_id === d.id)
                            )}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {member.effective_from}
                    </td>
                    <td className="px-4 py-2.5">
                      {member.is_default ? (
                        <StatusBadge status="active" />
                      ) : canManage ? (
                        <form action={setDefaultOrganization}>
                          <input type="hidden" name="membershipId" value={member.id} />
                          <button
                            type="submit"
                            className="text-xs font-medium text-accent hover:text-accent-strong"
                          >
                            Make default
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <EndMembershipButton
                        membershipId={member.id}
                        memberName={member.profiles?.full_name || member.profiles?.email || "member"}
                        disabled={!canManage || isSelf}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {pastMembers.length > 0 && (
        <section
          aria-label="Membership history"
          className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              Membership history{" "}
              <span className="font-normal text-ink-muted">
                (deactivated — preserved, never deleted)
              </span>
            </h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pastMembers.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-ink-secondary">
                    {member.profiles?.full_name || member.profiles?.email}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{member.organizations?.name}</td>
                  <td className="px-4 py-2 text-ink-muted">{member.roles?.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                    {member.effective_from} → {member.effective_to}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
