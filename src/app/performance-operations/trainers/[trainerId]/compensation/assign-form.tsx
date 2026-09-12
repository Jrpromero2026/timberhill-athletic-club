"use client";

import { useActionState } from "react";
import { assignTrainerCompensation } from "@/lib/actions/compensation";
import type { ActionState } from "@/lib/actions/shared";
import { ASSIGNMENT_PURPOSES, humanize } from "@/lib/schemas/compensation";

export interface VersionOption {
  id: string;
  label: string;
}

export function AssignCompensationForm({
  trainerId,
  versionOptions,
}: {
  trainerId: string;
  versionOptions: VersionOption[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    assignTrainerCompensation,
    {}
  );
  const inputClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm focus:border-accent";

  if (versionOptions.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No published plan versions exist in this trainer&apos;s organizations
        yet. Publish a compensation plan version first.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="trainerId" value={trainerId} />
      <div className="min-w-64">
        <label htmlFor="assign-version" className="mb-1 block text-xs font-medium text-ink-muted">
          Plan version (published only)
        </label>
        <select id="assign-version" name="planVersionId" className={`${inputClass} w-full`}>
          {versionOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-purpose" className="mb-1 block text-xs font-medium text-ink-muted">
          Purpose
        </label>
        <select id="assign-purpose" name="purpose" className={inputClass}>
          {ASSIGNMENT_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>{humanize(purpose)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-from" className="mb-1 block text-xs font-medium text-ink-muted">
          Effective from
        </label>
        <input id="assign-from" name="effectiveFrom" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="assign-to" className="mb-1 block text-xs font-medium text-ink-muted">
          Effective to (optional)
        </label>
        <input id="assign-to" name="effectiveTo" type="date" className={inputClass} />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Assigning…" : "Assign"}
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-positive">{state.message}</p>}
    </form>
  );
}
