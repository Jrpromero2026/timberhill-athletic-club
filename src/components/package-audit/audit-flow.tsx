import type { PackageStatus } from "@/lib/package-audit/balances";
import type { StatusSlice, TrainerHolds } from "@/lib/package-audit/flow";

const NUMBER = new Intl.NumberFormat("en-US");
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const BAR_CLASS: Record<PackageStatus, string> = {
  held: "bg-negative",
  length_mismatch: "bg-warning",
  negative: "bg-warning/60",
  low: "bg-ink-faint",
  payment_plan: "bg-border-strong",
  ok: "bg-positive",
};

export interface FlowStep {
  label: string;
  value: string;
  detail: string;
}

/** The ledger as a left-to-right pipeline, with the live count at each step. */
export function AuditFlow({ steps }: { steps: readonly FlowStep[] }) {
  return (
    <section aria-label="How the ledger works">
      <ol className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.label} className="relative bg-surface p-5">
            <p className="eyebrow text-accent">
              {step.label}
            </p>
            <p className="mt-3 font-mono text-2xl font-semibold text-ink">
              {step.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">
              {step.detail}
            </p>
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute right-0 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center bg-ink text-xs text-white xl:flex"
              >
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every account, as one bar split by status. */
export function StatusBar({
  slices,
  total,
  note,
}: {
  slices: readonly StatusSlice[];
  total: number;
  note?: string;
}) {
  return (
    <section className="border border-border bg-surface p-6">
      <h2 className="text-sm text-ink">
        {NUMBER.format(total)} client balances by status
      </h2>
      <div
        className="mt-4 flex h-4 w-full overflow-hidden bg-surface-sunken"
        role="img"
        aria-label={slices.map((s) => `${s.label} ${s.count}`).join(", ")}
      >
        {slices.map((slice) => (
          <span
            key={slice.status}
            className={BAR_CLASS[slice.status]}
            style={{ width: `${slice.percent}%` }}
          />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.status} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 ${BAR_CLASS[slice.status]}`} aria-hidden />
            <span className="text-ink-secondary">{slice.label}</span>
            <span className="font-mono font-semibold text-ink">{slice.count}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-xs text-ink-muted">{note}</p>}
    </section>
  );
}

/** Held sessions this month, one bar per trainer. */
export function TrainerHoldBars({
  rows,
  monthLabel,
  live,
}: {
  rows: readonly TrainerHolds[];
  monthLabel: string;
  live: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.sessions));
  return (
    <section className="border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm text-ink">Held sessions by trainer · {monthLabel}</h2>
        <span className="eyebrow bg-surface-sunken px-2 py-1 !text-[10px] text-ink-secondary">
          {live ? "Deducted from pay" : "Trial: shown, not deducted"}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Sessions · session price</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-secondary">No held sessions this month.</p>
      ) : (
        <ul className="mt-4 space-y-2.5" aria-label="Sessions held and their session value">
          {rows.map((row) => (
            <li
              key={row.trainer}
              className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm"
            >
              <span className="truncate text-ink">{row.trainer}</span>
              <span className="h-3 bg-surface-sunken">
                <span
                  className="block h-3 bg-negative"
                  style={{ width: `${(row.sessions / max) * 100}%` }}
                />
              </span>
              <span className="whitespace-nowrap font-mono text-ink">
                {row.sessions}{" "}
                <span className="text-ink-muted">· {DOLLARS.format(row.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
