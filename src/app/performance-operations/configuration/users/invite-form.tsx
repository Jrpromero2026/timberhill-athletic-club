"use client";

import { useActionState, useState } from "react";
import { createInvitation } from "@/lib/actions/members";
import type { ActionState } from "@/lib/actions/shared";
import { Field, SubmitButton } from "@/components/auth/form-bits";

interface Option {
  id: string;
  name: string;
}

export function InviteForm({
  organizations,
  roles,
  departmentsByOrg,
}: {
  organizations: Option[];
  roles: { id: string; key: string; name: string }[];
  departmentsByOrg: Record<string, Option[]>;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    createInvitation,
    {}
  );
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const departments = departmentsByOrg[orgId] ?? [];

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.message && (
        <div role="status" className="space-y-2 rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive">
          <p>{state.message}</p>
          {state.data?.inviteLink && (
            <code className="block select-all break-all rounded bg-surface px-2 py-1 font-mono text-xs text-ink">
              {state.data.inviteLink}
            </code>
          )}
        </div>
      )}
      <Field label="Email" name="email" type="email" autoComplete="off" />
      <div>
        <label htmlFor="invite-org" className="mb-1 block text-sm font-medium text-ink">
          Organization
        </label>
        <select
          id="invite-org"
          name="organizationId"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="invite-role" className="mb-1 block text-sm font-medium text-ink">
          Role
        </label>
        <select
          id="invite-role"
          name="roleId"
          className="h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">
          Departments <span className="font-normal text-ink-muted">(for department-scoped roles)</span>
        </legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {departments.map((dept) => (
            <label key={dept.id} className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                name="departmentIds"
                value={dept.id}
                className="h-4 w-4 rounded border-border-strong accent-[--color-accent]"
              />
              {dept.name}
            </label>
          ))}
          {departments.length === 0 && (
            <p className="text-sm text-ink-muted">No departments in this organization.</p>
          )}
        </div>
      </fieldset>
      <SubmitButton>Create invitation</SubmitButton>
      <p className="text-xs text-ink-muted">
        The invite link is displayed once after creation — copy it and send it
        to the invitee. Links expire after 14 days.
      </p>
    </form>
  );
}
