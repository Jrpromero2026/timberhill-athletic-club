"use client";

import { useActionState } from "react";
import { acknowledgeWarnings } from "@/lib/actions/imports";
import type { ActionState } from "@/lib/actions/shared";

export function AcknowledgeWarningsButton({
  batchId,
  count,
}: {
  batchId: string;
  count: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    acknowledgeWarnings,
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <button type="submit" disabled={pending}
        className="h-9 rounded-[--radius-control] border border-warning/40 bg-warning-soft px-4 text-sm font-semibold text-warning hover:opacity-90 disabled:opacity-60">
        {pending ? "Acknowledging…" : `Acknowledge ${count} warning${count === 1 ? "" : "s"}`}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}
