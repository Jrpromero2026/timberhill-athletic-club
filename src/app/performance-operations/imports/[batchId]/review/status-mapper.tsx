"use client";

import { useActionState } from "react";
import { mapSourceStatus } from "@/lib/actions/imports";
import type { ActionState } from "@/lib/actions/shared";

export function StatusMapper({
  batchId,
  sourceValue,
  statuses,
}: {
  batchId: string;
  sourceValue: string;
  statuses: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mapSourceStatus, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="sourceValue" value={sourceValue} />
      <span className="font-mono text-xs text-ink">“{sourceValue}”</span>
      <span className="text-xs text-ink-muted">→</span>
      <label className="sr-only" htmlFor={`statusmap-${sourceValue}`}>Canonical status</label>
      <select id={`statusmap-${sourceValue}`} name="canonicalStatus"
        className="h-8 rounded-[--radius-control] border border-border bg-surface px-2 text-xs text-ink">
        {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <button type="submit" disabled={pending}
        className="h-8 rounded-[--radius-control] bg-accent px-2.5 text-xs font-semibold text-white disabled:opacity-60">
        {pending ? "…" : "Save mapping"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}
