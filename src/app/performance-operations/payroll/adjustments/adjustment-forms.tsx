"use client";

import { useActionState, useState } from "react";
import {
  createAdjustment,
  decideAdjustment,
  voidAdjustment,
} from "@/lib/actions/payroll-time";
import type { ActionState } from "@/lib/actions/shared";

const inputClass =
  "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

export function NewAdjustmentForm({
  organizationId,
  periodId,
  trainers,
}: {
  organizationId: string;
  periodId: string;
  trainers: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAdjustment,
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
        <label htmlFor="adj-trainer" className="mb-1 block text-xs font-medium text-ink-muted">
          Trainer
        </label>
        <select id="adj-trainer" name="trainer_id" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="adj-type" className="mb-1 block text-xs font-medium text-ink-muted">
          Type
        </label>
        <select id="adj-type" name="adjustment_type" required className={inputClass} defaultValue="bonus">
          {["bonus", "deduction", "correction", "reimbursement", "carry_forward", "other"].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="adj-amount" className="mb-1 block text-xs font-medium text-ink-muted">
          Amount (USD, positive — deductions subtract by type)
        </label>
        <input id="adj-amount" name="amount" required placeholder="125.00" className={inputClass} />
      </div>
      <div>
        <label htmlFor="adj-ref" className="mb-1 block text-xs font-medium text-ink-muted">
          Supporting reference (optional)
        </label>
        <input id="adj-ref" name="supporting_reference" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="adj-reason" className="mb-1 block text-xs font-medium text-ink-muted">
          Reason (required; shown on statements and audit)
        </label>
        <input id="adj-reason" name="reason" required minLength={5} className={inputClass} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit adjustment"}
        </button>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    </form>
  );
}

export function AdjustmentDecisionForms({ adjustmentId }: { adjustmentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    decideAdjustment,
    {},
  );
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  return (
    <div className="flex flex-col gap-1.5">
      {mode === "idle" ? (
        <div className="flex items-center gap-2">
          <form action={action}>
            <input type="hidden" name="adjustment_id" value={adjustmentId} />
            <input type="hidden" name="decision" value="approve" />
            <button
              type="submit"
              disabled={pending}
              className="h-8 rounded-[--radius-control] bg-positive px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Approve"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-negative hover:bg-negative-soft"
          >
            Reject…
          </button>
        </div>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="adjustment_id" value={adjustmentId} />
          <input type="hidden" name="decision" value="reject" />
          <input
            name="reason"
            required
            minLength={5}
            placeholder="Rejection reason"
            aria-label="Rejection reason"
            className="h-8 w-52 rounded-[--radius-control] border border-border bg-surface px-2.5 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-8 rounded-[--radius-control] bg-negative px-3 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Confirm reject"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs text-ink"
          >
            Cancel
          </button>
        </form>
      )}
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </div>
  );
}

export function VoidAdjustmentButton({ adjustmentId }: { adjustmentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(voidAdjustment, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="adjustment_id" value={adjustmentId} />
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
