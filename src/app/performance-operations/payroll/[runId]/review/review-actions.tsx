"use client";

import { useActionState, useState } from "react";
import { markTrainerReviewed, resolvePayrollIssue } from "@/lib/actions/payroll";
import type { ActionState } from "@/lib/actions/shared";

export function ReviewToggle({
  summaryId,
  reviewed,
}: {
  summaryId: string;
  reviewed: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    markTrainerReviewed,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="summary_id" value={summaryId} />
      <input type="hidden" name="reviewed" value={reviewed ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`h-8 rounded-[--radius-control] px-3 text-xs font-semibold disabled:opacity-60 ${
          reviewed
            ? "border border-border bg-surface text-ink hover:bg-surface-sunken"
            : "bg-positive text-white hover:opacity-90"
        }`}
      >
        {pending ? "Saving…" : reviewed ? "Unmark reviewed" : "Mark reviewed"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
    </form>
  );
}

export function IssueResolutionForm({
  issueId,
  severity,
}: {
  issueId: string;
  severity: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resolvePayrollIssue,
    {},
  );
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          {severity === "blocking" ? "Resolve…" : "Resolve / acknowledge…"}
        </button>
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="issue_id" value={issueId} />
      <select
        name="resolution"
        aria-label="Resolution"
        defaultValue="resolved"
        className="h-8 rounded-[--radius-control] border border-border bg-surface px-2 text-xs"
      >
        <option value="resolved">Resolved</option>
        {severity !== "blocking" && <option value="acknowledged">Acknowledged</option>}
      </select>
      <input
        name="reason"
        required
        minLength={5}
        placeholder="Reason (recorded permanently)"
        aria-label="Resolution reason"
        className="h-8 w-64 rounded-[--radius-control] border border-border bg-surface px-2.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[--radius-control] bg-accent px-3 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs text-ink"
      >
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}
