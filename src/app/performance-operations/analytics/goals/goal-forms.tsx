"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions/shared";
import {
  approveGoalAction,
  archiveGoalAction,
  cancelGoalAction,
  completeGoalAction,
  createGoalAction,
} from "@/lib/analytics/goals/actions";

const IDLE: ActionState = {};

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs font-medium text-negative">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return <p className="text-xs font-medium text-positive">{state.message}</p>;
  }
  return null;
}

export function GoalForms({
  organizationId,
  metricOptions,
  departments,
  trainers,
  periods,
}: {
  organizationId: string;
  metricOptions: { id: string; name: string; unit: string }[];
  departments: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  periods: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(createGoalAction, IDLE);
  const [scopeLevel, setScopeLevel] = useState("organization");
  const [goalType, setGoalType] = useState("minimum");
  const needsBaseline = goalType === "maintain" || goalType === "improvement";

  return (
    <details className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
        New goal
      </summary>
      <form action={action} className="space-y-3 border-t border-border px-4 py-3" data-testid="goal-create-form">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-ink-secondary">
            Goal name
            <input
              name="name"
              required
              maxLength={120}
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Metric
            <select
              name="metricId"
              required
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            >
              {metricOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Goal type
            <select
              name="goalType"
              value={goalType}
              onChange={(event) => setGoalType(event.target.value)}
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            >
              <option value="minimum">Minimum (at least the target)</option>
              <option value="maximum">Maximum (at most the target)</option>
              <option value="exact">Exact</option>
              <option value="range">Range</option>
              <option value="maintain">Maintain (vs source-backed baseline)</option>
              <option value="improvement">Improvement (delta vs baseline)</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Scope
            <select
              name="scopeLevel"
              value={scopeLevel}
              onChange={(event) => setScopeLevel(event.target.value)}
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            >
              <option value="organization">Organization</option>
              <option value="department">Department</option>
              <option value="trainer">Trainer</option>
            </select>
          </label>
          {scopeLevel === "department" && (
            <label className="block text-xs font-medium text-ink-secondary">
              Department
              <select
                name="departmentId"
                required
                className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          {scopeLevel === "trainer" && (
            <label className="block text-xs font-medium text-ink-secondary">
              Trainer
              <select
                name="trainerId"
                required
                className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
          {goalType === "range" ? (
            <>
              <label className="block text-xs font-medium text-ink-secondary">
                Range low (native unit)
                <input
                  name="targetLow" type="number" required
                  className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 font-mono text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-medium text-ink-secondary">
                Range high (native unit)
                <input
                  name="targetHigh" type="number" required
                  className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 font-mono text-sm text-ink"
                />
              </label>
            </>
          ) : (
            <label className="block text-xs font-medium text-ink-secondary">
              {goalType === "improvement"
                ? "Required change vs baseline (signed, native unit)"
                : "Target (native unit — cents for currency, basis points for rates)"}
              <input
                name="targetValue" type="number" required
                className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 font-mono text-sm text-ink"
              />
            </label>
          )}
          {needsBaseline && (
            <label className="block text-xs font-medium text-ink-secondary">
              Baseline reporting period (value computed by the engine)
              <select
                name="baselinePeriodId"
                required
                className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs font-medium text-ink-secondary">
            Start date
            <input
              name="startDate" type="date" required
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            End date
            <input
              name="endDate" type="date" required
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Measurement cadence
            <select
              name="cadence"
              defaultValue="period"
              className="mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink"
            >
              <option value="period">Reporting period</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="fiscal_year">Fiscal year</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-secondary md:col-span-2">
            Notes
            <textarea
              name="notes" rows={2} maxLength={1000}
              className="mt-1 w-full rounded-[--radius-control] border border-border bg-surface px-2 py-1 text-sm text-ink"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            Create draft goal
          </button>
          <Feedback state={state} />
        </div>
      </form>
    </details>
  );
}

export function GoalRowActions({
  goalId,
  status,
  canApprove,
  canUpdate,
  canArchive,
}: {
  goalId: string;
  status: string;
  canApprove: boolean;
  canUpdate: boolean;
  canArchive: boolean;
}) {
  const [approveState, approve, approvePending] = useActionState(approveGoalAction, IDLE);
  const [completeState, complete, completePending] = useActionState(completeGoalAction, IDLE);
  const [cancelState, cancel, cancelPending] = useActionState(cancelGoalAction, IDLE);
  const [archiveState, archive, archivePending] = useActionState(archiveGoalAction, IDLE);
  const pending = approvePending || completePending || cancelPending || archivePending;

  const button =
    "h-8 rounded-[--radius-control] border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {status === "draft" && canApprove && (
          <form action={approve}>
            <input type="hidden" name="goalId" value={goalId} />
            <button type="submit" disabled={pending} className={button} data-testid="goal-approve">
              Approve
            </button>
          </form>
        )}
        {status === "draft" && canUpdate && (
          <form action={cancel}>
            <input type="hidden" name="goalId" value={goalId} />
            <button type="submit" disabled={pending} className={button}>
              Cancel draft
            </button>
          </form>
        )}
        {status === "active" && canApprove && (
          <>
            <form action={complete}>
              <input type="hidden" name="goalId" value={goalId} />
              <input type="hidden" name="outcome" value="achieved" />
              <button type="submit" disabled={pending} className={button}>
                Mark achieved
              </button>
            </form>
            <form action={complete}>
              <input type="hidden" name="goalId" value={goalId} />
              <input type="hidden" name="outcome" value="missed" />
              <button type="submit" disabled={pending} className={button}>
                Mark missed
              </button>
            </form>
            <form action={cancel}>
              <input type="hidden" name="goalId" value={goalId} />
              <button type="submit" disabled={pending} className={button}>
                Cancel
              </button>
            </form>
          </>
        )}
        {["achieved", "missed", "cancelled"].includes(status) && canArchive && (
          <form action={archive}>
            <input type="hidden" name="goalId" value={goalId} />
            <button type="submit" disabled={pending} className={button}>
              Archive
            </button>
          </form>
        )}
      </div>
      <Feedback state={approveState} />
      <Feedback state={completeState} />
      <Feedback state={cancelState} />
      <Feedback state={archiveState} />
    </div>
  );
}
