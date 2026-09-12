"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeWarning,
  approveClose,
  completeReview,
  evaluateReadiness,
  executeClose,
  generateCloseExport,
  generatePackage,
  reopenClose,
  revokeApproval,
  voidClose,
} from "@/lib/actions/close";
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

export function SimpleCloseAction({
  action,
  runId,
  label,
  pendingLabel,
  tone = "accent",
  extraFields,
}: {
  action:
    | "evaluate"
    | "complete_review"
    | "approve"
    | "generate_package"
    | "generate_export";
  runId: string;
  label: string;
  pendingLabel: string;
  tone?: "accent" | "positive" | "neutral";
  extraFields?: Record<string, string>;
}) {
  const serverAction: ServerAction =
    action === "evaluate"
      ? evaluateReadiness
      : action === "complete_review"
        ? completeReview
        : action === "approve"
          ? approveClose
          : action === "generate_package"
            ? generatePackage
            : generateCloseExport;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    serverAction,
    {},
  );
  const toneClass =
    tone === "positive"
      ? "bg-positive text-white hover:opacity-90"
      : tone === "neutral"
        ? "border border-border bg-surface text-ink hover:bg-surface-sunken"
        : "bg-accent text-white hover:bg-accent-strong";
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="run_id" value={runId} />
      {Object.entries(extraFields ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
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

export function ReasonCloseAction({
  action,
  runId,
  label,
  confirmLabel,
  pendingLabel,
  prompt,
  destructive = false,
}: {
  action: "reopen" | "void" | "revoke_approval";
  runId: string;
  label: string;
  confirmLabel: string;
  pendingLabel: string;
  prompt: string;
  destructive?: boolean;
}) {
  const serverAction: ServerAction =
    action === "reopen" ? reopenClose : action === "void" ? voidClose : revokeApproval;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    serverAction,
    {},
  );
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
  const fieldId = `${action}-${runId}`;
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

/** Execute final close — explicit confirmation for the irreversible step. */
export function ExecuteCloseButton({ runId }: { runId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    executeClose,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (state.message) router.refresh();
  }, [state.message, router]);
  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          data-testid="execute-close"
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Execute final close…
        </button>
        <Feedback state={state} />
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="run_id" value={runId} />
      <span className="text-sm text-ink-secondary">
        Close the period and freeze the manifest? This blocks material changes until a
        controlled reopen.
      </span>
      <button
        type="submit"
        disabled={pending}
        data-testid="confirm-execute-close"
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Closing…" : "Confirm close"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="h-9 rounded-[--radius-control] border border-border px-3 text-sm text-ink"
      >
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}

/** Acknowledge a warning check with a note. */
export function AcknowledgeForm({
  runId,
  checkCode,
}: {
  runId: string;
  checkCode: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    acknowledgeWarning,
    {},
  );
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-7 rounded-[--radius-control] border border-border px-2.5 text-[11px] font-medium text-ink hover:bg-surface-sunken"
        >
          Acknowledge…
        </button>
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="check_code" value={checkCode} />
      <input
        name="note"
        required
        minLength={3}
        placeholder="Acknowledgement note (recorded in the manifest)"
        aria-label={`Acknowledgement note for ${checkCode}`}
        className="h-7 w-64 rounded-[--radius-control] border border-border bg-surface px-2 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded-[--radius-control] bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Acknowledge"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-7 rounded-[--radius-control] border border-border px-2 text-[11px] text-ink"
      >
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}
