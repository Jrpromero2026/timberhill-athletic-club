"use client";

import { useRef, useTransition } from "react";
import { switchPeriod } from "@/lib/period/actions";
import type { PeriodOption } from "@/lib/period/server";

/**
 * Header reporting-period selector. Server-validated: the chosen period must
 * belong to the selected organization or the selection is cleared.
 */
export function PeriodSelector({
  options,
  selectedId,
  selectable,
}: {
  options: PeriodOption[];
  selectedId: string | null;
  selectable: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  if (!selectable) {
    return (
      <span
        className="hidden sm:flex h-9 items-center rounded-[--radius-control] border border-dashed border-border-strong bg-surface-subtle px-3 text-sm text-ink-muted"
        title="No reporting period available."
      >
        No reporting period
      </span>
    );
  }

  if (options.length === 0) {
    return (
      <span
        className="hidden sm:flex h-9 items-center rounded-[--radius-control] border border-dashed border-border-strong bg-surface-subtle px-3 text-sm text-ink-muted"
        title="Create reporting periods under Configuration."
      >
        No reporting periods
      </span>
    );
  }

  return (
    <form ref={formRef} action={switchPeriod} className="hidden sm:flex items-center">
      <label htmlFor="period-selector" className="sr-only">
        Reporting period
      </label>
      <select
        id="period-selector"
        name="period"
        value={selectedId ?? ""}
        disabled={isPending}
        onChange={() => startTransition(() => formRef.current?.requestSubmit())}
        className="h-9 appearance-none rounded-[--radius-control] border border-border bg-surface pl-3 pr-8 text-sm font-medium text-ink shadow-sm hover:border-border-strong focus:border-accent disabled:opacity-60 max-w-[230px] truncate"
      >
        <option value="">No period selected</option>
        {options.map((period) => (
          <option key={period.id} value={period.id}>
            {period.label} ({period.status})
          </option>
        ))}
      </select>
    </form>
  );
}
