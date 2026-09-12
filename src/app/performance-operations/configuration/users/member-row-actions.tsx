"use client";

import { useActionState, useState } from "react";
import {
  changeMembershipRole,
  endMembership,
  addDepartmentMembership,
} from "@/lib/actions/members";
import type { ActionState } from "@/lib/actions/shared";

interface RoleOption {
  id: string;
  name: string;
}

export function RoleChanger({
  membershipId,
  currentRoleId,
  roles,
  disabled,
}: {
  membershipId: string;
  currentRoleId: string;
  roles: RoleOption[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    changeMembershipRole,
    {}
  );
  const [roleId, setRoleId] = useState(currentRoleId);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label className="sr-only" htmlFor={`role-${membershipId}`}>
        Role
      </label>
      <select
        id={`role-${membershipId}`}
        name="newRoleId"
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        disabled={disabled || pending}
        className="h-8 rounded-[--radius-control] border border-border bg-surface px-2 text-xs text-ink disabled:opacity-50"
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled || pending || roleId === currentRoleId}
        className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-40"
      >
        {pending ? "Saving…" : "Change"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-negative">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function EndMembershipButton({
  membershipId,
  memberName,
  disabled,
}: {
  membershipId: string;
  memberName: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    endMembership,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setConfirming(true)}
          className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft disabled:opacity-40"
        >
          Deactivate
        </button>
        {state.error && (
          <span role="alert" className="text-xs text-negative">
            {state.error}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <span className="text-xs text-ink-secondary">
        Deactivate {memberName}?
      </span>
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[--radius-control] bg-negative px-2.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Working…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs text-ink"
      >
        Cancel
      </button>
    </form>
  );
}

export function AddDepartmentAccess({
  profileId,
  organizationId,
  departments,
}: {
  profileId: string;
  organizationId: string;
  departments: RoleOption[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addDepartmentMembership,
    {}
  );

  if (departments.length === 0) return null;

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="sr-only" htmlFor={`adddept-${profileId}-${organizationId}`}>
        Add department
      </label>
      <select
        id={`adddept-${profileId}-${organizationId}`}
        name="departmentId"
        disabled={pending}
        className="h-7 rounded-[--radius-control] border border-border bg-surface px-1.5 text-xs text-ink"
      >
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded-[--radius-control] border border-border px-2 text-xs text-ink hover:bg-surface-sunken"
      >
        + Dept
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-negative">
          {state.error}
        </span>
      )}
    </form>
  );
}
