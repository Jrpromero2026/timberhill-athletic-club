"use client";

import { useActionState } from "react";
import {
  addTrainerOrganizationAssignment,
  addTrainerDepartmentAssignment,
} from "@/lib/actions/trainers";
import type { ActionState } from "@/lib/actions/shared";

interface Option {
  id: string;
  name: string;
}

export function AddOrgAssignmentForm({
  trainerId,
  organizations,
}: {
  trainerId: string;
  organizations: Option[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addTrainerOrganizationAssignment,
    {}
  );
  if (organizations.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="trainerId" value={trainerId} />
      <div>
        <label htmlFor="assign-org" className="mb-1 block text-xs font-medium text-ink-muted">
          Organization
        </label>
        <select id="assign-org" name="organizationId"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm">
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-title" className="mb-1 block text-xs font-medium text-ink-muted">
          Role / title
        </label>
        <input id="assign-title" name="title" defaultValue="Trainer"
          className="h-9 w-40 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm" />
      </div>
      <div>
        <label htmlFor="assign-from" className="mb-1 block text-xs font-medium text-ink-muted">
          Effective from
        </label>
        <input id="assign-from" name="effectiveFrom" type="date"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm" />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}

export function AddDeptAssignmentForm({
  trainerId,
  organizationOptions,
  departmentsByOrg,
}: {
  trainerId: string;
  organizationOptions: Option[];
  departmentsByOrg: Record<string, Option[]>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addTrainerDepartmentAssignment,
    {}
  );
  const flat = organizationOptions.flatMap((org) =>
    (departmentsByOrg[org.id] ?? []).map((dept) => ({
      orgId: org.id,
      orgName: org.name,
      dept,
    }))
  );
  if (flat.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="trainerId" value={trainerId} />
      <div>
        <label htmlFor="assign-dept" className="mb-1 block text-xs font-medium text-ink-muted">
          Department
        </label>
        <select
          id="assign-dept"
          name="departmentChoice"
          onChange={(e) => {
            const [orgId] = e.target.value.split("|");
            const orgInput = e.currentTarget.form?.elements.namedItem(
              "organizationId"
            ) as HTMLInputElement | null;
            if (orgInput) orgInput.value = orgId;
            const deptInput = e.currentTarget.form?.elements.namedItem(
              "departmentId"
            ) as HTMLInputElement | null;
            if (deptInput) deptInput.value = e.target.value.split("|")[1];
          }}
          defaultValue={`${flat[0].orgId}|${flat[0].dept.id}`}
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm"
        >
          {flat.map((item) => (
            <option key={item.dept.id} value={`${item.orgId}|${item.dept.id}`}>
              {item.orgName} — {item.dept.name}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="organizationId" defaultValue={flat[0].orgId} />
      <input type="hidden" name="departmentId" defaultValue={flat[0].dept.id} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}
