import { HubLibrary } from "@/components/hub/hub-library";
import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { currentPeriodMonth, holdsAreLive } from "@/lib/package-audit/flow";
import {
  buildPreview,
  previewTotals,
  splitReviews,
  type HoldRow,
  type ProgressRow,
  type RecommendationRow,
  type SplitRow,
} from "@/lib/payroll-preview/preview";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});
const pct = (v: number) => `${Math.round(v * 100)}%`;
const monthLabel = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));

interface ClosedPeriod {
  period_month: string;
  closed_at: string;
  closed_by: string | null;
}

/**
 * Payroll for the director: this month so far, from the package audit.
 * A running preview only; additions and the final figures are in the PDF.
 */
export async function AuditPayroll({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const month = currentPeriodMonth();
  // The pkg_* tables and views are not in the generated Database types yet.
  const from = (table: string) =>
    actor.supabase.from(table as never).select("*").eq("organization_id", organizationId);

  const [progressRes, splitsRes, holdsRes, recsRes, periodsRes, settingsRes] =
    await Promise.all([
      from("v_pkg_trainer_month_progress").eq("month", month),
      from("pkg_trainer_splits"),
      from("v_pkg_payroll_holds").eq("period_month", month),
      from("v_pkg_split_recommendations"),
      from("pkg_payroll_periods").order("period_month", { ascending: false }).limit(12),
      from("pkg_settings").limit(1),
    ]);

  if (progressRes.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll" />
        <p className="border border-border bg-surface p-6 text-sm text-ink-secondary">
          Payroll could not be loaded: {progressRes.error.message}
        </p>
      </div>
    );
  }

  const rows = buildPreview(
    (progressRes.data ?? []) as unknown as ProgressRow[],
    (splitsRes.data ?? []) as unknown as SplitRow[],
    (holdsRes.data ?? []) as unknown as HoldRow[],
    month,
  );
  const totals = previewTotals(rows);
  const reviews = splitReviews((recsRes.data ?? []) as unknown as RecommendationRow[]);
  const closed = (periodsRes.data ?? []) as unknown as ClosedPeriod[];
  const settings = ((settingsRes.data ?? []) as unknown as { holds_live_from: string | null }[])[0];
  const live = holdsAreLive(settings?.holds_live_from ?? null, month);
  const isClosed = closed.some((p) => p.period_month === month);

  const th = "px-4 py-2";
  const td = "px-4 py-2.5";
  const right = "text-right font-mono";

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" />

      <section className="border border-border bg-surface" data-testid="payroll-preview">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-3">
          <h2 className="text-sm text-ink">
            {monthLabel(month)} so far
          </h2>
          <span className="eyebrow bg-surface-sunken px-2 py-1 !text-[10px] text-ink-secondary">
            {isClosed ? "Closed" : live ? "Open · holds deducted" : "Open · trial, holds not deducted"}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-ink-secondary">No sessions this month yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-ink-muted">
                <tr>
                  <th className={th}>Trainer</th>
                  <th className={`${th} text-right`}>Sessions</th>
                  <th className={`${th} text-right`}>Gross</th>
                  <th className={`${th} text-right`}>Still booked</th>
                  <th className={`${th} text-right`}>Split</th>
                  <th className={`${th} text-right`}>Commission</th>
                  <th className={`${th} text-right`}>Held</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.trainer} className="border-b border-border">
                    <td className={`${td} font-medium text-ink`}>{row.trainer}</td>
                    <td className={`${td} ${right}`}>{row.sessions}</td>
                    <td className={`${td} ${right}`}>{MONEY.format(row.gross)}</td>
                    <td className={`${td} ${right} text-ink-muted`}>{DOLLARS.format(row.booked)}</td>
                    <td className={`${td} ${right}`}>{row.split === null ? "—" : pct(row.split)}</td>
                    <td className={`${td} ${right} font-semibold text-ink`}>
                      {MONEY.format(row.commission)}
                    </td>
                    <td className={`${td} ${right} ${row.heldSessions > 0 ? "text-negative" : "text-ink-muted"}`}>
                      {row.heldSessions > 0
                        ? `${row.heldSessions} · ${MONEY.format(row.heldPay)}`
                        : "0"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken font-semibold text-ink">
                  <td className={td}>Total</td>
                  <td className={`${td} ${right}`}>{totals.sessions}</td>
                  <td className={`${td} ${right}`}>{MONEY.format(totals.gross)}</td>
                  <td className={`${td} ${right}`}>{DOLLARS.format(totals.booked)}</td>
                  <td className={td} />
                  <td className={`${td} ${right}`}>{MONEY.format(totals.commission)}</td>
                  <td className={`${td} ${right}`}>
                    {totals.heldSessions} · {MONEY.format(totals.heldPay)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-6 py-3 text-xs text-ink-muted">
          Sessions up to now, from Setmore. Commission is gross times split, before
          additions (free trials, Performance Lab, intro sessions, director commission)
          and manual lines. Held is the trainer&rsquo;s share of sessions past the
          package. The payroll PDF is the final figure.
        </p>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="border border-border bg-surface" data-testid="payroll-splits">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
            Splits to review
          </h2>
          {reviews.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">
              Every split matches SOP 2.1.
            </p>
          ) : (
            <ul>
              {reviews.map((r) => (
                <li
                  key={r.trainer}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border px-6 py-3 text-sm last:border-0"
                >
                  <span className="font-medium text-ink">{r.trainer}</span>
                  <span className="text-ink-secondary">
                    {r.direction === "raise"
                      ? `Qualifies for ${pct(r.rule)}, now at ${pct(r.current)}`
                      : `At ${pct(r.current)}, SOP 2.1 gives ${pct(r.rule)}`}
                    <span className="text-ink-muted">
                      {" "}· best month {DOLLARS.format(r.bestMonth)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-border bg-surface" data-testid="payroll-closed">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
            Closed months
          </h2>
          {closed.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">
              No month has been closed yet.
            </p>
          ) : (
            <ul>
              {closed.map((p) => (
                <li
                  key={p.period_month}
                  className="flex items-baseline justify-between gap-6 border-b border-border px-6 py-3 text-sm last:border-0"
                >
                  <span className="font-medium text-ink">{monthLabel(p.period_month)}</span>
                  <span className="text-ink-muted">
                    Closed {DAY.format(new Date(p.closed_at))}
                    {p.closed_by ? ` by ${p.closed_by}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <HubLibrary section="payroll" />
    </div>
  );
}
