"use client";

import { useActionState, useState } from "react";
import {
  approveBatch,
  getOriginalFileUrl,
  postBatch,
  reverseBatch,
} from "@/lib/actions/imports";
import type { ActionState } from "@/lib/actions/shared";

function useStateAction(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
) {
  return useActionState<ActionState, FormData>(action, {});
}

export function ApproveButton({ batchId }: { batchId: string }) {
  const [state, action, pending] = useStateAction(approveBatch);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-positive px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Approving…" : "Approve batch"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}

export function PostButton({ batchId, expectedCount }: { batchId: string; expectedCount: number }) {
  const [state, action, pending] = useStateAction(postBatch);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setConfirming(true)}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
          Post {expectedCount} row{expectedCount === 1 ? "" : "s"}…
        </button>
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <span className="text-sm text-ink-secondary">
        Post {expectedCount} appointment{expectedCount === 1 ? "" : "s"} to the ledger?
      </span>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Posting…" : "Confirm post"}
      </button>
      <button type="button" onClick={() => setConfirming(false)}
        className="h-9 rounded-[--radius-control] border border-border px-3 text-sm text-ink">
        Cancel
      </button>
    </form>
  );
}

export function ReverseForm({ batchId }: { batchId: string }) {
  const [state, action, pending] = useStateAction(reverseBatch);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)}
          className="h-9 rounded-[--radius-control] border border-border px-3.5 text-sm font-medium text-negative hover:bg-negative-soft">
          Reverse batch…
        </button>
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <div className="min-w-72 flex-1">
        <label htmlFor={`reverse-reason-${batchId}`} className="mb-1 block text-xs font-medium text-ink-muted">
          Reversal reason (required; recorded permanently)
        </label>
        <input id={`reverse-reason-${batchId}`} name="reason" required minLength={5}
          className="h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm" />
      </div>
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] bg-negative px-4 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Reversing…" : "Confirm reversal"}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="h-9 rounded-[--radius-control] border border-border px-3 text-sm text-ink">
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}

export function DownloadOriginalButton({ batchId }: { batchId: string }) {
  const [state, action, pending] = useStateAction(getOriginalFileUrl);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] border border-border px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-60">
        {pending ? "Creating link…" : "Download original"}
      </button>
      {state.data?.url && (
        <a href={state.data.url} target="_blank" rel="noreferrer"
          className="text-sm font-medium text-accent hover:text-accent-strong">
          Open file (60s link)
        </a>
      )}
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
    </form>
  );
}
