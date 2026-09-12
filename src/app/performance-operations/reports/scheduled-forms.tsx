"use client";

import { useActionState } from "react";
import {
  createScheduledReport,
  deleteScheduledReport,
  toggleScheduledReport,
} from "@/lib/actions/report-admin";
import { runReportNow, toggleReportExecution } from "@/lib/actions/integrations";
import type { ActionState } from "@/lib/actions/shared";

const inputClass =
  "h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

export function NewScheduledReportForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createScheduledReport,
    {},
  );
  return (
    <form
      action={action}
      className="grid max-w-3xl grid-cols-1 gap-3 rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <label htmlFor="sched-type" className="mb-1 block text-xs font-medium text-ink-muted">
          Report type
        </label>
        <select id="sched-type" name="report_type" required defaultValue="quick_report" className={inputClass}>
          {[
            "quick_report",
            "executive_package",
            "department_package",
            "payroll_package",
            // Phase 9 analytics subscriptions (analytics packages)
            "executive_scorecard",
            "trainer_self_scorecard",
            "goal_progress_report",
            "benchmark_report",
            "cohort_report",
            "board_presentation_package",
          ].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sched-frequency" className="mb-1 block text-xs font-medium text-ink-muted">
          Frequency
        </label>
        <select id="sched-frequency" name="frequency" required defaultValue="monthly" className={inputClass}>
          {["daily", "weekly", "monthly", "period_close", "custom"].map((f) => (
            <option key={f} value={f}>
              {f.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sched-timezone" className="mb-1 block text-xs font-medium text-ink-muted">
          Timezone
        </label>
        <input
          id="sched-timezone"
          name="timezone"
          defaultValue="America/Los_Angeles"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="sched-recipients" className="mb-1 block text-xs font-medium text-ink-muted">
          Intended recipients (member emails, comma-separated)
        </label>
        <input
          id="sched-recipients"
          name="recipients"
          placeholder="optional"
          className={inputClass}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save definition"}
        </button>
        <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning">
          Execution not yet enabled
        </span>
        {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
        {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
      </div>
    </form>
  );
}

/** Phase 8: execution toggle + manual run (scheduled_report:execute). */
export function ScheduledExecutionControls({
  id,
  executionEnabled,
}: {
  id: string;
  executionEnabled: boolean;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionState, FormData>(
    toggleReportExecution,
    {},
  );
  const [runState, runAction, runPending] = useActionState<ActionState, FormData>(
    runReportNow,
    {},
  );
  const buttonClass =
    "h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={toggleAction}>
        <input type="hidden" name="definition_id" value={id} />
        <input type="hidden" name="enable" value={String(!executionEnabled)} />
        <button type="submit" disabled={togglePending} className={buttonClass} data-testid="toggle-execution">
          {executionEnabled ? "Disable execution" : "Enable execution"}
        </button>
      </form>
      <form action={runAction}>
        <input type="hidden" name="definition_id" value={id} />
        <button
          type="submit"
          disabled={runPending}
          className="h-7 rounded-[--radius-control] bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-60"
          data-testid="run-report-now"
        >
          {runPending ? "Running…" : "Run now"}
        </button>
      </form>
      {(toggleState.error || runState.error) && (
        <span role="alert" className="text-xs text-negative">
          {toggleState.error || runState.error}
        </span>
      )}
      {(toggleState.message || runState.message) && (
        <span role="status" className="text-xs text-positive">
          {toggleState.message || runState.message}
        </span>
      )}
    </div>
  );
}

export function ScheduledReportRowActions({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionState, FormData>(
    toggleScheduledReport,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteScheduledReport,
    {},
  );
  const buttonClass =
    "h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";
  return (
    <div className="flex items-center gap-1.5">
      <form action={toggleAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(active)} />
        <button type="submit" disabled={togglePending} className={buttonClass}>
          {active ? "Disable" : "Enable"}
        </button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={deletePending}
          className="h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-negative hover:bg-negative-soft disabled:opacity-60"
        >
          Delete
        </button>
      </form>
      {(toggleState.error || deleteState.error) && (
        <span role="alert" className="text-xs text-negative">
          {toggleState.error || deleteState.error}
        </span>
      )}
    </div>
  );
}
