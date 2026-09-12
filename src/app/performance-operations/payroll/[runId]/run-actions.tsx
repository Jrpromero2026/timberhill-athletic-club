"use client";

import { useActionState, useState } from "react";
import {
  calculatePayrollRun,
  submitRunForApproval,
  approvePayrollRun,
  returnRunToReview,
  postPayrollRun,
  lockPayrollRun,
  reopenPayrollRun,
  voidPayrollRun,
  supersedePayrollRun,
} from "@/lib/actions/payroll";
import type { ActionState } from "@/lib/actions/shared";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </>
  );
}

/** Plain action button (no reason, no confirm step). */
function SimpleAction({
  action,
  runId,
  label,
  pendingLabel,
  tone = "accent",
  extraFields,
}: {
  action: ServerAction;
  runId: string;
  label: string;
  pendingLabel: string;
  tone?: "accent" | "positive" | "neutral";
  extraFields?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const toneClass =
    tone === "positive"
      ? "bg-positive text-white hover:opacity-90"
      : tone === "neutral"
        ? "border border-border bg-surface text-ink hover:bg-surface-sunken"
        : "bg-accent text-white hover:bg-accent-strong";
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="run_id" value={runId} />
      {Object.entries(extraFields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={`h-9 rounded-[--radius-control] px-4 text-sm font-semibold disabled:opacity-60 ${toneClass}`}
      >
        {pending ? pendingLabel : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Two-step action requiring a typed reason. */
function ReasonAction({
  action,
  runId,
  label,
  confirmLabel,
  pendingLabel,
  prompt,
  destructive = false,
}: {
  action: ServerAction;
  runId: string;
  label: string;
  confirmLabel: string;
  pendingLabel: string;
  prompt: string;
  destructive?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`h-9 rounded-[--radius-control] border border-border px-3.5 text-sm font-medium ${
            destructive ? "text-negative hover:bg-negative-soft" : "text-ink hover:bg-surface-sunken"
          }`}
        >
          {label}…
        </button>
        <Feedback state={state} />
      </div>
    );
  }
  const fieldId = `${label.replaceAll(/\W+/g, "-")}-${runId}`;
  return (
    <form action={formAction} className="flex w-full flex-wrap items-end gap-2">
      <input type="hidden" name="run_id" value={runId} />
      <div className="min-w-64 flex-1">
        <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-ink-muted">
          {prompt}
        </label>
        <input
          id={fieldId}
          name="reason"
          required
          minLength={5}
          className="h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`h-9 rounded-[--radius-control] px-4 text-sm font-semibold text-white disabled:opacity-60 ${
          destructive ? "bg-negative" : "bg-accent hover:bg-accent-strong"
        }`}
      >
        {pending ? pendingLabel : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-9 rounded-[--radius-control] border border-border px-3 text-sm text-ink"
      >
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}

export function RunLifecycleActions({
  runId,
  status,
  can,
}: {
  runId: string;
  status: string;
  can: {
    calculate: boolean;
    review: boolean;
    approve: boolean;
    post: boolean;
    lock: boolean;
    reopen: boolean;
    voidRun: boolean;
  };
}) {
  const actions: React.ReactNode[] = [];

  if (can.calculate && ["draft", "needs_review", "reopened", "failed"].includes(status)) {
    actions.push(
      <SimpleAction
        key="calc"
        action={calculatePayrollRun}
        runId={runId}
        label={status === "draft" ? "Calculate" : "Recalculate"}
        pendingLabel="Calculating…"
      />,
    );
    if (status !== "draft") {
      actions.push(
        <SimpleAction
          key="calc-refresh"
          action={calculatePayrollRun}
          runId={runId}
          label="Recalculate with refreshed cutoff"
          pendingLabel="Calculating…"
          tone="neutral"
          extraFields={{ refresh_cutoff: "true" }}
        />,
      );
    }
  }
  if (can.review && status === "needs_review") {
    actions.push(
      <SimpleAction
        key="submit"
        action={submitRunForApproval}
        runId={runId}
        label="Submit for approval"
        pendingLabel="Submitting…"
        tone="positive"
      />,
    );
  }
  if (can.approve && status === "ready_for_approval") {
    actions.push(
      <SimpleAction
        key="approve"
        action={approvePayrollRun}
        runId={runId}
        label="Approve run"
        pendingLabel="Approving…"
        tone="positive"
      />,
    );
  }
  if (can.review && ["ready_for_approval", "approved"].includes(status)) {
    actions.push(
      <ReasonAction
        key="return"
        action={returnRunToReview}
        runId={runId}
        label="Return to review"
        confirmLabel="Confirm return"
        pendingLabel="Returning…"
        prompt="Why is this run going back to review? (recorded permanently)"
      />,
    );
  }
  if (can.post && status === "approved") {
    actions.push(
      <SimpleAction
        key="post"
        action={postPayrollRun}
        runId={runId}
        label="Post run"
        pendingLabel="Posting…"
      />,
    );
  }
  if (can.lock && status === "posted") {
    actions.push(
      <SimpleAction
        key="lock"
        action={lockPayrollRun}
        runId={runId}
        label="Lock run"
        pendingLabel="Locking…"
        tone="neutral"
      />,
    );
  }
  if (can.reopen && ["posted", "locked"].includes(status)) {
    actions.push(
      <ReasonAction
        key="reopen"
        action={reopenPayrollRun}
        runId={runId}
        label="Reopen"
        confirmLabel="Confirm reopen"
        pendingLabel="Reopening…"
        prompt="Reopen reason (required; recorded permanently)"
        destructive
      />,
      <ReasonAction
        key="supersede"
        action={supersedePayrollRun}
        runId={runId}
        label="Supersede with new run"
        confirmLabel="Confirm supersede"
        pendingLabel="Superseding…"
        prompt="Supersession reason (required; recorded permanently)"
        destructive
      />,
    );
  }
  if (can.voidRun && ["draft", "needs_review", "reopened", "failed"].includes(status)) {
    actions.push(
      <ReasonAction
        key="void"
        action={voidPayrollRun}
        runId={runId}
        label="Void run"
        confirmLabel="Confirm void"
        pendingLabel="Voiding…"
        prompt="Void reason (required; recorded permanently)"
        destructive
      />,
    );
  }

  if (actions.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-3">{actions}</div>;
}
