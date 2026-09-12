"use client";

import { useActionState } from "react";
import {
  excludeRow,
  resolveClientLink,
  resolveDuplicate,
  resolveServiceMatch,
  resolveTrainerMatch,
} from "@/lib/actions/imports";
import type { ActionState } from "@/lib/actions/shared";

interface Option {
  id: string;
  name: string;
}

const inputClass =
  "h-8 rounded-[--radius-control] border border-border bg-surface px-2 text-xs text-ink";
const buttonClass =
  "h-8 rounded-[--radius-control] bg-accent px-2.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-60";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="w-full text-xs text-negative">{state.error}</p>;
  if (state.message) return <p role="status" className="w-full text-xs text-positive">{state.message}</p>;
  return null;
}

export function TrainerResolver({
  batchId,
  rowId,
  trainers,
  sourceName,
}: {
  batchId: string;
  rowId: string;
  trainers: Option[];
  sourceName: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveTrainerMatch, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <label className="sr-only" htmlFor={`trainer-${rowId}`}>Trainer</label>
      <select id={`trainer-${rowId}`} name="trainerId" className={inputClass}>
        {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        <input type="checkbox" name="saveAlias" value="true" defaultChecked className="h-3.5 w-3.5" />
        Save alias for “{sourceName}”
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        <input type="checkbox" name="applyToSimilar" value="true" defaultChecked className="h-3.5 w-3.5" />
        Apply to identical rows
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "…" : "Map trainer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ServiceResolver({
  batchId,
  rowId,
  services,
  sourceName,
}: {
  batchId: string;
  rowId: string;
  services: Option[];
  sourceName: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveServiceMatch, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <label className="sr-only" htmlFor={`service-${rowId}`}>Service</label>
      <select id={`service-${rowId}`} name="serviceId" className={`${inputClass} max-w-64`}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        <input type="checkbox" name="saveAlias" value="true" defaultChecked className="h-3.5 w-3.5" />
        Save alias for “{sourceName.slice(0, 40)}{sourceName.length > 40 ? "…" : ""}”
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        <input type="checkbox" name="applyToSimilar" value="true" defaultChecked className="h-3.5 w-3.5" />
        Apply to identical rows
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "…" : "Map service"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ClientResolver({
  batchId,
  rowId,
  clients,
  canCreate,
}: {
  batchId: string;
  rowId: string;
  clients: Option[];
  canCreate: boolean;
}) {
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(resolveClientLink, {});
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(resolveClientLink, {});
  return (
    <div className="space-y-1.5">
      <form action={linkAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="rowId" value={rowId} />
        <input type="hidden" name="mode" value="link" />
        <label className="sr-only" htmlFor={`client-${rowId}`}>Client</label>
        <select id={`client-${rowId}`} name="clientId" className={`${inputClass} max-w-56`}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-ink-secondary">
          <input type="checkbox" name="applyToSimilar" value="true" defaultChecked className="h-3.5 w-3.5" />
          Apply to identical rows
        </label>
        <button type="submit" disabled={linkPending || clients.length === 0} className={buttonClass}>
          {linkPending ? "…" : "Link existing"}
        </button>
        <Feedback state={linkState} />
      </form>
      {canCreate && (
        <form action={createAction} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="rowId" value={rowId} />
          <input type="hidden" name="mode" value="create" />
          <input type="hidden" name="saveSourceId" value="true" />
          <input type="hidden" name="applyToSimilar" value="true" />
          <button type="submit" disabled={createPending}
            className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-60">
            {createPending ? "…" : "Create client from row"}
          </button>
          <Feedback state={createState} />
        </form>
      )}
    </div>
  );
}

export function DuplicateResolver({ batchId, rowId }: { batchId: string; rowId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveDuplicate, {});
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={action} className="inline">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="rowId" value={rowId} />
        <input type="hidden" name="decision" value="not_duplicate" />
        <button type="submit" disabled={pending}
          className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-ink hover:bg-surface-sunken">
          Not a duplicate
        </button>
      </form>
      <form action={action} className="inline">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="rowId" value={rowId} />
        <input type="hidden" name="decision" value="confirm_duplicate" />
        <button type="submit" disabled={pending}
          className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft">
          Confirm duplicate (exclude)
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

export function ExcludeResolver({ batchId, rowId }: { batchId: string; rowId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(excludeRow, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <label className="sr-only" htmlFor={`exclude-${rowId}`}>Exclusion reason</label>
      <input id={`exclude-${rowId}`} name="reason" required minLength={5}
        placeholder="Exclusion reason (required)" className={`${inputClass} w-56`} />
      <button type="submit" disabled={pending}
        className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft disabled:opacity-60">
        {pending ? "…" : "Exclude row"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
