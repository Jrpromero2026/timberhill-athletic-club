"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createPayrollRun } from "@/lib/actions/payroll";
import type { ActionState } from "@/lib/actions/shared";

interface PeriodChoice {
  id: string;
  label: string;
  range: string;
  status: string;
}

export function NewRunForm({
  organizationId,
  organizationName,
  periods,
}: {
  organizationId: string;
  organizationName: string;
  periods: PeriodChoice[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createPayrollRun,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.data?.runId) router.push(`/performance-operations/payroll/${state.data.runId}`);
  }, [state.data?.runId, router]);

  const inputClass =
    "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <form action={action} className="max-w-lg space-y-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-muted">Organization</span>
        <p className="text-sm font-medium text-ink">{organizationName}</p>
      </div>
      <div>
        <label htmlFor="run-period" className="mb-1 block text-xs font-medium text-ink-muted">
          Reporting period
        </label>
        <select id="run-period" name="reporting_period_id" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose a period…
          </option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.range}) — {p.status}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="run-name" className="mb-1 block text-xs font-medium text-ink-muted">
          Run name
        </label>
        <input id="run-name" name="name" required minLength={3} placeholder="e.g. July payroll"
          className={inputClass} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create draft run"}
        </button>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
        {state.message && !state.data?.runId && (
          <span role="status" className="text-xs text-positive">{state.message}</span>
        )}
      </div>
    </form>
  );
}
