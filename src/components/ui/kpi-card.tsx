/**
 * KPI card. Until real imported data exists, cards render an explicit
 * "waiting for imported data" state — never a fake number.
 */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  /** Omit to show the awaiting-data state. Real values only — never fakes. */
  value?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
      <p className="eyebrow text-ink-muted">
        {label}
      </p>
      {value !== undefined ? (
        <p className="mt-2 font-mono text-2xl font-semibold text-ink">{value}</p>
      ) : (
        <div className="mt-2">
          <p className="font-mono text-2xl font-semibold text-ink-faint">—</p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
            Waiting for imported data
          </p>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
