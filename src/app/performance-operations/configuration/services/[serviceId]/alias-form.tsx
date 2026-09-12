"use client";

import { useActionState } from "react";
import {
  addServiceAlias,
  addServiceDepartmentAssignment,
} from "@/lib/actions/services";
import type { ActionState } from "@/lib/actions/shared";

export function AddAliasForm({ serviceId }: { serviceId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addServiceAlias,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="serviceId" value={serviceId} />
      <div>
        <label htmlFor="alias-source" className="mb-1 block text-xs font-medium text-ink-muted">
          Source
        </label>
        <select id="alias-source" name="source"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm">
          <option value="setmore">Setmore</option>
          <option value="acuity">Acuity</option>
          <option value="manual_csv">Manual CSV</option>
        </select>
      </div>
      <div className="min-w-64 flex-1">
        <label htmlFor="alias-text" className="mb-1 block text-xs font-medium text-ink-muted">
          Alias (exactly as it appears in the export)
        </label>
        <input id="alias-text" name="alias" required maxLength={300}
          className="h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm" />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Adding…" : "Add alias"}
      </button>
      {state.error && <span role="alert" className="w-full text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="w-full text-xs text-positive">{state.message}</span>}
    </form>
  );
}

export function AddServiceDeptForm({
  serviceId,
  departments,
}: {
  serviceId: string;
  departments: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addServiceDepartmentAssignment,
    {}
  );
  if (departments.length === 0) return null;
  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="serviceId" value={serviceId} />
      <div>
        <label htmlFor="svc-dept-add" className="mb-1 block text-xs font-medium text-ink-muted">
          Add department
        </label>
        <select id="svc-dept-add" name="departmentId"
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm">
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] border border-border px-3 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
    </form>
  );
}
