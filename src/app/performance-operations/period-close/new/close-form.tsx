"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCloseRun } from "@/lib/actions/close";
import type { ActionState } from "@/lib/actions/shared";

export function NewCloseForm({
  organizationId,
  organizationName,
  periods,
}: {
  organizationId: string;
  organizationName: string;
  periods: { id: string; label: string; range: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCloseRun,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.data?.runId) router.push(`/performance-operations/period-close/${state.data.runId}`);
  }, [state.data?.runId, router]);

  return (
    <form action={action} className="max-w-lg space-y-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-muted">Organization</span>
        <p className="text-sm font-medium text-ink">{organizationName}</p>
      </div>
      <div>
        <label htmlFor="close-period" className="mb-1 block text-xs font-medium text-ink-muted">
          Reporting period (open periods only)
        </label>
        <select
          id="close-period"
          name="reporting_period_id"
          required
          defaultValue=""
          className="h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm"
        >
          <option value="" disabled>
            Choose a period…
          </option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.range})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Creating…" : "Start close review"}
        </button>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      </div>
    </form>
  );
}
