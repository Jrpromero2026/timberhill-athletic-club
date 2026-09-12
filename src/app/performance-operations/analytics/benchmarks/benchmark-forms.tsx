"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions/shared";
import {
  approveBenchmarkAction,
  archiveBenchmarkAction,
  createBenchmarkAction,
  deprecateBenchmarkAction,
} from "@/lib/analytics/benchmarks/actions";

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

const INTERNAL_HISTORICAL = new Set([
  "org_historical_median",
  "org_historical_best",
  "department_historical_median",
  "trainer_historical_baseline",
]);

export function BenchmarkForms({
  organizationId,
  metricOptions,
  departments,
}: {
  organizationId: string;
  metricOptions: { id: string; name: string; unit: string }[];
  departments: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createBenchmarkAction, IDLE);
  const [sourceType, setSourceType] = useState("org_historical_median");
  const [scopeLevel, setScopeLevel] = useState("organization");
  const isHistorical = INTERNAL_HISTORICAL.has(sourceType);

  const input =
    "mt-1 h-9 w-full rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink";

  return (
    <details className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
        New benchmark
      </summary>
      <form
        action={action}
        className="space-y-3 border-t border-border px-4 py-3"
        data-testid="benchmark-create-form"
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-ink-secondary">
            Name
            <input name="name" required maxLength={120} className={input} />
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Metric
            <select name="metricId" required className={input}>
              {metricOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Source
            <select
              name="sourceType"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
              className={input}
            >
              <option value="org_historical_median">Organization historical median</option>
              <option value="org_historical_best">Organization historical best</option>
              <option value="department_historical_median">Department historical median</option>
              <option value="trainer_historical_baseline">Trainer historical baseline</option>
              <option value="internal_standard">Internal approved standard</option>
              <option value="external_reference">External approved reference</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Scope
            <select
              name="scopeLevel"
              value={scopeLevel}
              onChange={(event) => setScopeLevel(event.target.value)}
              className={input}
            >
              <option value="organization">Organization</option>
              <option value="department">Department</option>
            </select>
          </label>
          {scopeLevel === "department" && (
            <label className="block text-xs font-medium text-ink-secondary">
              Department
              <select name="departmentId" required className={input}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isHistorical ? (
            <>
              <label className="block text-xs font-medium text-ink-secondary">
                Source range start (value computed by the engine)
                <input name="sourcePeriodFrom" type="date" required className={input} />
              </label>
              <label className="block text-xs font-medium text-ink-secondary">
                Source range end
                <input name="sourcePeriodTo" type="date" required className={input} />
              </label>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-ink-secondary">
                Value (native unit — cents for currency, basis points for rates)
                <input name="value" type="number" required className={`${input} font-mono`} />
              </label>
              <label className="block text-xs font-medium text-ink-secondary md:col-span-2">
                Evidence{" "}
                {sourceType === "external_reference"
                  ? "(cite the owner-provided source document)"
                  : "(who set this standard and why)"}
                <textarea
                  name="evidence"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  className="mt-1 w-full rounded-[--radius-control] border border-border bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
            </>
          )}
          <label className="block text-xs font-medium text-ink-secondary">
            Effective from
            <input name="effectiveFrom" type="date" required className={input} />
          </label>
          <label className="block text-xs font-medium text-ink-secondary">
            Effective to (optional)
            <input name="effectiveTo" type="date" className={input} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            Create draft benchmark
          </button>
          <Feedback state={state} />
        </div>
      </form>
    </details>
  );
}

export function BenchmarkRowActions({
  benchmarkId,
  status,
  canApprove,
  canArchive,
}: {
  benchmarkId: string;
  status: string;
  canApprove: boolean;
  canArchive: boolean;
}) {
  const [approveState, approve, approvePending] = useActionState(approveBenchmarkAction, IDLE);
  const [deprecateState, deprecate, deprecatePending] = useActionState(deprecateBenchmarkAction, IDLE);
  const [archiveState, archive, archivePending] = useActionState(archiveBenchmarkAction, IDLE);
  const pending = approvePending || deprecatePending || archivePending;
  const button =
    "h-8 rounded-[--radius-control] border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";

  return (
    <div className="mt-2 flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "draft" && canApprove && (
          <form action={approve}>
            <input type="hidden" name="benchmarkId" value={benchmarkId} />
            <button type="submit" disabled={pending} className={button} data-testid="benchmark-approve">
              Approve
            </button>
          </form>
        )}
        {status === "approved" && canArchive && (
          <form action={deprecate}>
            <input type="hidden" name="benchmarkId" value={benchmarkId} />
            <button type="submit" disabled={pending} className={button}>
              Deprecate
            </button>
          </form>
        )}
        {(status === "draft" || status === "deprecated") && canArchive && (
          <form action={archive}>
            <input type="hidden" name="benchmarkId" value={benchmarkId} />
            <button type="submit" disabled={pending} className={button}>
              Archive
            </button>
          </form>
        )}
      </div>
      <Feedback state={approveState} />
      <Feedback state={deprecateState} />
      <Feedback state={archiveState} />
    </div>
  );
}
