"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions/shared";
import {
  addWidgetAction,
  archiveDashboardAction,
  createDashboardAction,
  duplicateDashboardAction,
  moveWidgetAction,
  removeWidgetAction,
  resizeWidgetAction,
  setDefaultDashboardAction,
  shareDashboardAction,
} from "@/lib/analytics/dashboards/actions";

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

const inputClass =
  "mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink";
const buttonClass =
  "h-8 rounded-[--radius-control] border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";

export function NewDashboardForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createDashboardAction, IDLE);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-[--radius-card] border border-border bg-surface px-4 py-3 shadow-sm"
      data-testid="dashboard-create-form"
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="block min-w-64 text-xs font-medium text-ink-secondary">
        Dashboard name
        <input name="name" required maxLength={120} className={inputClass} />
      </label>
      <label className="block min-w-64 flex-1 text-xs font-medium text-ink-secondary">
        Description (optional)
        <input name="description" maxLength={300} className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        Create dashboard
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function DashboardListActions({
  dashboardId,
  isOwner,
  isArchived,
  canCreate,
  canSetOrgDefault,
}: {
  dashboardId: string;
  isOwner: boolean;
  isArchived: boolean;
  canCreate: boolean;
  canSetOrgDefault: boolean;
}) {
  const [defaultState, setDefault, defaultPending] = useActionState(setDefaultDashboardAction, IDLE);
  const [duplicateState, duplicate, duplicatePending] = useActionState(duplicateDashboardAction, IDLE);
  const [archiveState, archive, archivePending] = useActionState(archiveDashboardAction, IDLE);
  const pending = defaultPending || duplicatePending || archivePending;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {!isArchived && (
          <form action={setDefault}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="scope" value="personal" />
            <button type="submit" disabled={pending} className={buttonClass} data-testid="dashboard-set-default">
              Set my default
            </button>
          </form>
        )}
        {!isArchived && canSetOrgDefault && (
          <form action={setDefault}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="scope" value="organization" />
            <button type="submit" disabled={pending} className={buttonClass}>
              Set org default
            </button>
          </form>
        )}
        {canCreate && (
          <form action={duplicate}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <button type="submit" disabled={pending} className={buttonClass} data-testid="dashboard-duplicate">
              Duplicate
            </button>
          </form>
        )}
        {isOwner && (
          <form action={archive}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            {isArchived && <input type="hidden" name="restore" value="true" />}
            <button type="submit" disabled={pending} className={buttonClass} data-testid="dashboard-archive">
              {isArchived ? "Restore" : "Archive"}
            </button>
          </form>
        )}
      </div>
      <Feedback state={defaultState} />
      <Feedback state={duplicateState} />
      <Feedback state={archiveState} />
    </div>
  );
}

/** Metric options are injected as a serializable list from the server. */
export function DashboardBuilder({
  dashboardId,
  organizationId,
  canShareDepartment,
  canShareOrganization,
  sharedScope,
  goalOptions,
  metricOptions,
  departments,
}: {
  dashboardId: string;
  organizationId: string;
  canShareDepartment: boolean;
  canShareOrganization: boolean;
  sharedScope: string;
  goalOptions: { id: string; name: string }[];
  metricOptions: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}) {
  const [addState, add, addPending] = useActionState(addWidgetAction, IDLE);
  const [shareState, share, sharePending] = useActionState(shareDashboardAction, IDLE);
  const [widgetType, setWidgetType] = useState("metric");
  const [scope, setScope] = useState(sharedScope);

  const needsMetric = ["metric", "comparison", "trend", "breakdown_table", "breakdown_chart"].includes(widgetType);
  const needsGroup = ["breakdown_table", "breakdown_chart"].includes(widgetType);
  const needsGoal = widgetType === "goal_progress";
  const needsText = widgetType === "text_note";

  return (
    <details className="rounded-[--radius-card] border border-border bg-surface shadow-sm" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
        Builder
      </summary>
      <div className="grid gap-4 border-t border-border px-4 py-3 lg:grid-cols-2">
        <form action={add} className="space-y-2" data-testid="widget-add-form">
          <input type="hidden" name="dashboardId" value={dashboardId} />
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Add widget</p>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block text-xs font-medium text-ink-secondary">
              Type
              <select
                name="widgetType"
                value={widgetType}
                onChange={(event) => setWidgetType(event.target.value)}
                className={inputClass}
              >
                <option value="metric">Metric</option>
                <option value="comparison">Comparison</option>
                <option value="trend">Trend</option>
                <option value="breakdown_table">Breakdown table</option>
                <option value="breakdown_chart">Breakdown chart</option>
                <option value="goal_progress">Goal progress</option>
                <option value="readiness">Readiness</option>
                <option value="text_note">Text note</option>
                <option value="report_link">Report link</option>
              </select>
            </label>
            {needsMetric && (
              <label className="block text-xs font-medium text-ink-secondary">
                Metric
                <select name="metricId" className={inputClass} data-testid="widget-metric">
                  {metricOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
            {needsGroup && (
              <label className="block text-xs font-medium text-ink-secondary">
                Group by
                <select name="groupBy" className={inputClass}>
                  <option value="department">Department</option>
                  <option value="trainer">Trainer</option>
                  <option value="service">Service</option>
                </select>
              </label>
            )}
            {["comparison", "breakdown_table"].includes(widgetType) && (
              <label className="block text-xs font-medium text-ink-secondary">
                Compare with
                <select name="comparison" className={inputClass}>
                  <option value="previous_period">Previous period</option>
                  <option value="same_period_last_year">Same period last year</option>
                  <option value="year_to_date">Year to date</option>
                </select>
              </label>
            )}
            {widgetType === "trend" && (
              <label className="block text-xs font-medium text-ink-secondary">
                Chart
                <select name="chart" className={inputClass}>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="sparkline">Sparkline</option>
                </select>
              </label>
            )}
            {needsGoal && (
              <label className="block text-xs font-medium text-ink-secondary">
                Goal
                <select name="goalId" className={inputClass}>
                  {goalOptions.length === 0 ? (
                    <option value="">No active goals</option>
                  ) : (
                    goalOptions.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))
                  )}
                </select>
              </label>
            )}
            {needsText && (
              <label className="block text-xs font-medium text-ink-secondary md:col-span-2">
                Note
                <textarea name="text" rows={2} maxLength={2000} className="mt-1 w-full rounded-[--radius-control] border border-border bg-surface px-2 py-1 text-sm text-ink" />
              </label>
            )}
            {widgetType === "report_link" && (
              <>
                <label className="block text-xs font-medium text-ink-secondary">
                  Label
                  <input name="label" maxLength={120} className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-ink-secondary">
                  App path
                  <input name="path" placeholder="/performance-operations/reports" className={inputClass} />
                </label>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={addPending}
              className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
              data-testid="widget-add"
            >
              Add widget
            </button>
            <Feedback state={addState} />
          </div>
        </form>

        <form action={share} className="space-y-2" data-testid="dashboard-share-form">
          <input type="hidden" name="dashboardId" value={dashboardId} />
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sharing</p>
          <label className="block text-xs font-medium text-ink-secondary">
            Scope
            <select
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className={inputClass}
              data-testid="dashboard-share-scope"
            >
              <option value="personal">Personal (only me)</option>
              <option value="department" disabled={!canShareDepartment}>
                Department{!canShareDepartment ? " (no permission)" : ""}
              </option>
              <option value="organization" disabled={!canShareOrganization}>
                Organization{!canShareOrganization ? " (no permission)" : ""}
              </option>
            </select>
          </label>
          {scope === "department" && (
            <label className="block text-xs font-medium text-ink-secondary">
              Department
              <select name="departmentId" className={inputClass}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={sharePending} className={buttonClass} data-testid="dashboard-share-save">
              Save sharing
            </button>
            <Feedback state={shareState} />
          </div>
          <input type="hidden" name="organizationId" value={organizationId} />
        </form>
      </div>
    </details>
  );
}

export function WidgetOwnerControls({ widgetId }: { widgetId: string }) {
  const [moveState, move, movePending] = useActionState(moveWidgetAction, IDLE);
  const [removeState, remove, removePending] = useActionState(removeWidgetAction, IDLE);
  const [resizeState, resize, resizePending] = useActionState(resizeWidgetAction, IDLE);
  const pending = movePending || removePending || resizePending;
  const tiny =
    "h-6 rounded border border-border bg-surface px-1.5 text-[10px] font-medium text-ink-secondary hover:bg-surface-sunken disabled:opacity-50";

  return (
    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-60 hover:opacity-100">
      <form action={move}>
        <input type="hidden" name="widgetId" value={widgetId} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={pending} className={tiny} aria-label="Move widget earlier" data-testid="widget-move-up">
          ←
        </button>
      </form>
      <form action={move}>
        <input type="hidden" name="widgetId" value={widgetId} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={pending} className={tiny} aria-label="Move widget later" data-testid="widget-move-down">
          →
        </button>
      </form>
      <form action={resize}>
        <input type="hidden" name="widgetId" value={widgetId} />
        <input type="hidden" name="width" value="2" />
        <button type="submit" disabled={pending} className={tiny} aria-label="Widen widget">
          ⇔
        </button>
      </form>
      <form action={resize}>
        <input type="hidden" name="widgetId" value={widgetId} />
        <input type="hidden" name="width" value="1" />
        <button type="submit" disabled={pending} className={tiny} aria-label="Narrow widget">
          ⇹
        </button>
      </form>
      <form action={remove}>
        <input type="hidden" name="widgetId" value={widgetId} />
        <button type="submit" disabled={pending} className={tiny} aria-label="Remove widget" data-testid="widget-remove">
          ✕
        </button>
      </form>
      <span className="sr-only" aria-live="polite">
        {moveState.message ?? removeState.message ?? resizeState.message ?? ""}
        {moveState.error ?? removeState.error ?? resizeState.error ?? ""}
      </span>
    </div>
  );
}
