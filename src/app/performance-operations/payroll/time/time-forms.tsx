"use client";

import { useActionState, useState } from "react";
import {
  createTimeEntry,
  decideTimeEntry,
  voidTimeEntry,
} from "@/lib/actions/payroll-time";
import type { ActionState } from "@/lib/actions/shared";

const inputClass =
  "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

export function NewTimeEntryForm({
  organizationId,
  periodId,
  periodRange,
  trainers,
  selfTrainerId,
  canApprove,
}: {
  organizationId: string;
  periodId: string;
  periodRange: { start: string; end: string };
  trainers: { id: string; name: string }[];
  selfTrainerId: string | null;
  canApprove: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createTimeEntry,
    {},
  );
  return (
    <form
      action={action}
      className="grid max-w-3xl grid-cols-1 gap-3 rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="reporting_period_id" value={periodId} />
      <div>
        <label htmlFor="time-trainer" className="mb-1 block text-xs font-medium text-ink-muted">
          Trainer
        </label>
        {canApprove ? (
          <select id="time-trainer" name="trainer_id" required className={inputClass} defaultValue={selfTrainerId ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="trainer_id" value={selfTrainerId ?? ""} />
            <p className="text-sm text-ink">
              {trainers.find((t) => t.id === selfTrainerId)?.name ?? "(your trainer record)"}
            </p>
          </>
        )}
      </div>
      <div>
        <label htmlFor="time-date" className="mb-1 block text-xs font-medium text-ink-muted">
          Work date
        </label>
        <input
          id="time-date"
          type="date"
          name="work_date"
          required
          min={periodRange.start}
          max={periodRange.end}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="time-category" className="mb-1 block text-xs font-medium text-ink-muted">
          Category
        </label>
        <select id="time-category" name="work_category" required className={inputClass} defaultValue="admin">
          {["admin", "programming", "meeting", "facility_support", "floor_shift", "training", "other"].map(
            (c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ),
          )}
        </select>
      </div>
      <div>
        <label htmlFor="time-minutes" className="mb-1 block text-xs font-medium text-ink-muted">
          Minutes
        </label>
        <input
          id="time-minutes"
          type="number"
          name="requested_minutes"
          required
          min={1}
          max={1440}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="time-purpose" className="mb-1 block text-xs font-medium text-ink-muted">
          Compensation purpose
        </label>
        <select id="time-purpose" name="compensation_purpose" required className={inputClass} defaultValue="administrative">
          {["administrative", "primary", "team_training", "evaluations", "nutrition"].map((p) => (
            <option key={p} value={p}>
              {p.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="time-desc" className="mb-1 block text-xs font-medium text-ink-muted">
          Description
        </label>
        <input id="time-desc" name="description" required minLength={5} className={inputClass} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit time entry"}
        </button>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    </form>
  );
}

export function TimeDecisionForms({
  entryId,
  requestedMinutes,
}: {
  entryId: string;
  requestedMinutes: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    decideTimeEntry,
    {},
  );
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  if (mode === "idle") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="h-8 rounded-[--radius-control] bg-positive px-3 text-xs font-semibold text-white hover:opacity-90"
        >
          Approve…
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-negative hover:bg-negative-soft"
        >
          Reject…
        </button>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="decision" value={mode} />
      {mode === "approve" ? (
        <div>
          <label htmlFor={`approve-min-${entryId}`} className="mb-1 block text-[11px] font-medium text-ink-muted">
            Approved minutes
          </label>
          <input
            id={`approve-min-${entryId}`}
            type="number"
            name="approved_minutes"
            defaultValue={requestedMinutes}
            min={1}
            max={1440}
            className="h-8 w-28 rounded-[--radius-control] border border-border bg-surface px-2 text-xs"
          />
        </div>
      ) : (
        <input
          name="reason"
          required
          minLength={5}
          placeholder="Rejection reason"
          aria-label="Rejection reason"
          className="h-8 w-56 rounded-[--radius-control] border border-border bg-surface px-2.5 text-xs"
        />
      )}
      <button
        type="submit"
        disabled={pending}
        className={`h-8 rounded-[--radius-control] px-3 text-xs font-semibold text-white disabled:opacity-60 ${
          mode === "approve" ? "bg-positive" : "bg-negative"
        }`}
      >
        {pending ? "Saving…" : mode === "approve" ? "Confirm approve" : "Confirm reject"}
      </button>
      <button
        type="button"
        onClick={() => setMode("idle")}
        className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs text-ink"
      >
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}

export function VoidTimeEntryButton({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(voidTimeEntry, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="entry_id" value={entryId} />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-ink-muted hover:bg-surface-sunken disabled:opacity-60"
      >
        {pending ? "Voiding…" : "Void"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
    </form>
  );
}
