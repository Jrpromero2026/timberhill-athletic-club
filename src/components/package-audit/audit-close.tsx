import Link from "next/link";
import { TrainerHoldBars } from "@/components/package-audit/audit-flow";
import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { pacificToday } from "@/lib/home/needs-you";
import { summarize, type PackageBalanceRow } from "@/lib/package-audit/balances";
import {
  SEND_BEFORE_CLOSING,
  closeChecks,
  closedMonths,
  type StatementRow,
} from "@/lib/package-audit/close";
import {
  currentPeriodMonth,
  holdsAreLive,
  holdsByTrainer,
  type HoldRow,
} from "@/lib/package-audit/flow";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const monthLabel = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));
const pacificDate = (iso: string | undefined) =>
  iso ? pacificToday(new Date(iso)) : null;

/**
 * Month-end close for the director: is the month ready, what will freeze,
 * and what has been closed. Read-only; the close itself is run for the
 * director after the GMS export is imported.
 */
export async function AuditClose({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const now = new Date();
  const month = currentPeriodMonth(now);
  // The pkg_* tables and views are not in the generated Database types yet.
  const from = (table: string, columns = "*") =>
    actor.supabase.from(table as never).select(columns).eq("organization_id", organizationId);

  const [balancesRes, holdsRes, syncRes, importRes, purchaseRes, periodsRes, statementRes, settingsRes] =
    await Promise.all([
      from("v_pkg_balances", "status, purchased, last_purchase_at"),
      from("v_pkg_payroll_holds", "trainer, cost").eq("period_month", month),
      from("pkg_sync_runs", "status, started_at").order("started_at", { ascending: false }).limit(1),
      from("pkg_purchases", "created_at").order("created_at", { ascending: false }).limit(1),
      from("pkg_purchases", "purchased_at").order("purchased_at", { ascending: false }).limit(1),
      from("pkg_payroll_periods", "period_month").order("period_month", { ascending: false }).limit(12),
      from("v_pkg_payroll_statement"),
      from("pkg_settings", "holds_live_from").limit(1),
    ]);

  const summary = summarize((balancesRes.data ?? []) as unknown as PackageBalanceRow[]);
  const lastSync =
    ((syncRes.data ?? []) as unknown as { status: string; started_at: string }[])[0] ?? null;
  const checks = closeChecks({
    month,
    today: pacificToday(now),
    now,
    lastSync,
    lastGmsImportDate: pacificDate(
      ((importRes.data ?? []) as unknown as { created_at: string }[])[0]?.created_at,
    ),
    lastPurchaseDate: pacificDate(
      ((purchaseRes.data ?? []) as unknown as { purchased_at: string }[])[0]?.purchased_at,
    ),
    heldNoPackage: summary.heldNoPackage,
  });
  const periods = (periodsRes.data ?? []) as unknown as { period_month: string }[];
  const closed = closedMonths(periods, (statementRes.data ?? []) as unknown as StatementRow[]);
  const isClosed = periods.some((p) => p.period_month === month);
  const settings = ((settingsRes.data ?? []) as unknown as { holds_live_from: string | null }[])[0];
  const live = holdsAreLive(settings?.holds_live_from ?? null, month);
  const ready = checks.every((c) => c.done);

  return (
    <div className="space-y-6">
      <PageHeader title="Month-end close" />

      <section className="border border-border bg-surface" data-testid="close-checklist">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-3">
          <h2 className="text-sm text-ink">{monthLabel(month)}</h2>
          <span className="eyebrow bg-surface-sunken px-2 py-1 !text-[10px] text-ink-secondary">
            {isClosed ? "Closed" : ready ? "Ready to close" : "Not ready"}
          </span>
        </div>
        <ul>
          {checks.map((check) => (
            <li
              key={check.label}
              className="grid grid-cols-[1.5rem_1fr] gap-3 border-b border-border px-6 py-3 text-sm"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 items-center justify-center text-[11px] font-bold ${
                  check.done ? "bg-positive text-white" : "border border-border-strong text-transparent"
                }`}
              >
                ✓
              </span>
              <span>
                <span className="block font-medium text-ink">
                  {check.label}
                  <span className="sr-only">{check.done ? " (done)" : " (not done)"}</span>
                </span>
                <span className="block text-ink-secondary">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="px-6 py-4 text-sm">
          <p className="font-medium text-ink">Send before closing</p>
          <p className="mt-1 text-ink-secondary">{SEND_BEFORE_CLOSING.join(". ")}.</p>
          {summary.heldNoPackage > 0 && (
            <p className="mt-3">
              <Link
                href="/performance-operations/package-audit?status=unlinked"
                className="font-medium text-accent hover:text-accent-strong"
              >
                Review the {summary.heldNoPackage} holds with no package linked
              </Link>
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <TrainerHoldBars
          rows={holdsByTrainer((holdsRes.data ?? []) as unknown as HoldRow[])}
          monthLabel={monthLabel(month)}
          live={live}
        />

        <section className="border border-border bg-surface" data-testid="close-history">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">Closed months</h2>
          {closed.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">No month has been closed yet.</p>
          ) : (
            <ul>
              {closed.map((c) => (
                <li
                  key={c.month}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border px-6 py-3 text-sm last:border-0"
                >
                  <span className="font-medium text-ink">{monthLabel(c.month)}</span>
                  <span className="text-ink-secondary">
                    {c.held} held ({DOLLARS.format(c.heldValue)}) · {c.released} released (
                    {DOLLARS.format(c.releasedValue)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
