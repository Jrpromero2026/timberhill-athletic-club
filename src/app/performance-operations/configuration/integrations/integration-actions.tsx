"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelJob,
  configureDeliveryChannel,
  createConnection,
  createSyncDefinition,
  deadLetterJob,
  discardIntegrationBatch,
  requeueDeadLetterJob,
  resetCursor,
  retryDelivery,
  retryJob,
  revokeCredentials,
  runReportNow,
  runSyncNow,
  setConnectionEnabled,
  submitCredentials,
  toggleReportExecution,
  toggleSyncDefinition,
  validateConnection,
} from "@/lib/actions/integrations";
import type { ActionState } from "@/lib/actions/shared";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const ACTIONS: Record<string, ServerAction> = {
  validate: validateConnection,
  set_enabled: setConnectionEnabled,
  run_sync: runSyncNow,
  toggle_definition: toggleSyncDefinition,
  retry_job: retryJob,
  cancel_job: cancelJob,
  dead_letter_job: deadLetterJob,
  toggle_execution: toggleReportExecution,
  run_report: runReportNow,
  retry_delivery: retryDelivery,
  discard_batch: discardIntegrationBatch,
};

function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </>
  );
}

const buttonClass =
  "h-8 rounded-[--radius-control] border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";
const primaryClass =
  "h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60";
const inputClass =
  "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

/** One-click action with hidden fields. */
export function IntegrationAction({
  action,
  label,
  pendingLabel,
  fields,
  primary = false,
  testId,
}: {
  action: keyof typeof ACTIONS;
  label: string;
  pendingLabel: string;
  fields: Record<string, string>;
  primary?: boolean;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    ACTIONS[action]!,
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        data-testid={testId}
        className={primary ? primaryClass : buttonClass}
      >
        {pending ? pendingLabel : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Action requiring a typed reason (revoke, reset cursor, requeue DL). */
export function ReasonAction({
  action,
  label,
  confirmLabel,
  prompt,
  fields,
  impactNote,
  testId,
}: {
  action: "revoke" | "reset_cursor" | "requeue_dead_letter";
  label: string;
  confirmLabel: string;
  prompt: string;
  fields: Record<string, string>;
  impactNote?: string;
  testId?: string;
}) {
  const serverAction: ServerAction =
    action === "revoke"
      ? revokeCredentials
      : action === "reset_cursor"
        ? resetCursor
        : requeueDeadLetterJob;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(serverAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={testId}
          className={`${buttonClass} text-negative`}
        >
          {label}…
        </button>
        <Feedback state={state} />
      </div>
    );
  }
  return (
    <form action={formAction} className="flex w-full flex-wrap items-end gap-2">
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="min-w-64 flex-1">
        {impactNote && <p className="mb-1 text-xs text-warning">{impactNote}</p>}
        <label className="mb-1 block text-xs font-medium text-ink-muted">
          {prompt}
          <input
            name="reason"
            required
            minLength={action === "reset_cursor" ? 10 : 5}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      <button type="submit" disabled={pending} className={primaryClass}>
        {pending ? "Working…" : confirmLabel}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass}>
        Cancel
      </button>
      {state.error && <p role="alert" className="w-full text-xs text-negative">{state.error}</p>}
    </form>
  );
}

export function NewConnectionForm({
  organizationId,
  providers,
}: {
  organizationId: string;
  providers: { key: string; name: string; blocked: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createConnection,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.data?.connectionId) {
      router.push(`/performance-operations/configuration/integrations/${state.data.connectionId}`);
    }
  }, [state.data?.connectionId, router]);
  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <label htmlFor="conn-provider" className="mb-1 block text-xs font-medium text-ink-muted">
          Provider
        </label>
        <select id="conn-provider" name="provider_key" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose a provider…
          </option>
          {providers.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
              {p.blocked ? " — BLOCKED (see checklist)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="conn-name" className="mb-1 block text-xs font-medium text-ink-muted">
          Connection name
        </label>
        <input id="conn-name" name="name" required minLength={3} maxLength={60} className={inputClass} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "Creating…" : "Create draft connection"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Credential submission: the value is sent once and never echoed back. */
export function CredentialForm({ connectionId }: { connectionId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    submitCredentials,
    {},
  );
  return (
    <form action={formAction} className="flex max-w-xl flex-wrap items-end gap-2">
      <input type="hidden" name="connection_id" value={connectionId} />
      <div className="min-w-72 flex-1">
        <label htmlFor="cred-secret" className="mb-1 block text-xs font-medium text-ink-muted">
          Provider credential (stored in Vault; never shown again)
        </label>
        <input
          id="cred-secret"
          name="secret"
          type="password"
          required
          minLength={8}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={primaryClass} data-testid="submit-credential">
        {pending ? "Storing…" : "Store credential"}
      </button>
      <div className="w-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function NewSyncDefinitionForm({ connectionId }: { connectionId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSyncDefinition,
    {},
  );
  return (
    <form action={formAction} className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
      <input type="hidden" name="connection_id" value={connectionId} />
      <label className="text-xs font-medium text-ink-muted">
        Window strategy
        <select name="window_strategy" defaultValue="fixed_range" className={`${inputClass} mt-1`}>
          <option value="trailing_days">Trailing days</option>
          <option value="fixed_range">Fixed range</option>
        </select>
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Window days (trailing)
        <input name="window_days" type="number" defaultValue={30} min={1} max={366} className={`${inputClass} mt-1`} />
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Mode
        <select name="mode" defaultValue="incremental" className={`${inputClass} mt-1`}>
          <option value="incremental">Incremental (cursor)</option>
          <option value="full">Full window</option>
        </select>
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Range start
        <input name="window_start" type="date" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Range end
        <input name="window_end" type="date" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Frequency
        <select name="frequency" defaultValue="manual" className={`${inputClass} mt-1`}>
          <option value="manual">Manual</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={primaryClass} data-testid="create-sync-definition">
          {pending ? "Creating…" : "Create sync definition"}
        </button>
        <span className="text-[11px] text-ink-muted">
          Auto-approve and auto-post are OFF and cannot be enabled (database-enforced).
        </span>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeliveryChannelForm({
  organizationId,
  current,
}: {
  organizationId: string;
  current: {
    provider: string;
    senderAddress: string | null;
    allowExternal: boolean;
    allowStatements: boolean;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    configureDeliveryChannel,
    {},
  );
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <input type="hidden" name="organization_id" value={organizationId} />
      <label className="block text-xs font-medium text-ink-muted">
        Provider
        <select
          name="provider"
          defaultValue={current?.provider ?? "none_configured"}
          className={`${inputClass} mt-1`}
        >
          <option value="none_configured">None configured (deliveries fail closed)</option>
          <option value="test">Test provider (records sends; no real email)</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-ink-muted">
        Sender address (informational until a real provider exists)
        <input
          name="sender_address"
          type="email"
          defaultValue={current?.senderAddress ?? ""}
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          name="allow_external_recipients"
          defaultChecked={current?.allowExternal ?? false}
        />
        Allow external recipients (default OFF)
      </label>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          name="allow_trainer_statements"
          defaultChecked={current?.allowStatements ?? false}
        />
        Allow trainer statement delivery (default OFF)
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "Saving…" : "Save channel"}
        </button>
        <Feedback state={state} />
      </div>
      <p className="text-[11px] text-ink-muted">
        Real providers (Resend / Postmark / SES / SMTP) are unresolved business
        decisions — they cannot be selected until configured and approved.
      </p>
    </form>
  );
}
