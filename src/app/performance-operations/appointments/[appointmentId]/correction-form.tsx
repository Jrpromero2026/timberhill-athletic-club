"use client";

import { useActionState } from "react";
import { correctAppointmentStatus } from "@/lib/actions/appointments";
import type { ActionState } from "@/lib/actions/shared";

export function StatusCorrectionForm({
  appointmentId,
  currentStatus,
  statuses,
}: {
  appointmentId: string;
  currentStatus: string;
  statuses: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    correctAppointmentStatus,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div>
        <label htmlFor="correct-status" className="mb-1 block text-xs font-medium text-ink-muted">
          New status
        </label>
        <select id="correct-status" name="newStatus" defaultValue={currentStatus}
          className="h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm">
          {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="min-w-64 flex-1">
        <label htmlFor="correct-reason" className="mb-1 block text-xs font-medium text-ink-muted">
          Correction reason (required; recorded permanently)
        </label>
        <input id="correct-reason" name="reason" required minLength={5}
          className="h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm" />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Correcting…" : "Apply correction"}
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-positive">{state.message}</p>}
    </form>
  );
}
