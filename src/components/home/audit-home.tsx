import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { MILESTONES, comingUp, daysSince, needsYou } from "@/lib/home/needs-you";
import { summarize, type PackageBalanceRow } from "@/lib/package-audit/balances";
import { currentPeriodMonth } from "@/lib/package-audit/flow";

const AUDIT = "/performance-operations/package-audit";

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const SYNC_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

function ago(days: number | null): string {
  if (days === null) return "never";
  if (days <= 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Home for the director: what the package audit says needs attention today.
 * Every number is read from the audit views; nothing is calculated here.
 */
export async function AuditHome({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const now = new Date();
  const periodMonth = currentPeriodMonth(now);

  // The pkg_* tables and views are not in the generated Database types yet.
  const [balancesRes, holdsRes, syncRes, gmsRes] = await Promise.all([
    actor.supabase
      .from("v_pkg_balances" as never)
      .select("status, purchased, last_purchase_at")
      .eq("organization_id", organizationId),
    actor.supabase
      .from("v_pkg_payroll_holds" as never)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("period_month", periodMonth),
    actor.supabase
      .from("pkg_sync_runs" as never)
      .select("status, started_at")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(1),
    actor.supabase
      .from("pkg_purchases" as never)
      .select("created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (balancesRes.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" />
        <p className="border border-border bg-surface p-6 text-sm text-ink-secondary">
          The package audit could not be loaded: {balancesRes.error.message}
        </p>
      </div>
    );
  }

  const summary = summarize(
    (balancesRes.data ?? []) as unknown as PackageBalanceRow[],
  );
  const lastSync =
    ((syncRes.data ?? [])[0] as { status: string; started_at: string } | undefined) ??
    null;
  const lastGmsImportAt =
    ((gmsRes.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null;

  const items = needsYou({ summary, lastSync, lastGmsImportAt, now });
  const dates = comingUp(MILESTONES, now);
  const monthName = MONTH_NAME.format(new Date(`${periodMonth}T00:00:00Z`));

  const numbers = [
    { label: "On hold", value: summary.held, href: `${AUDIT}?status=held` },
    { label: "Negative", value: summary.negative, href: `${AUDIT}?status=negative` },
    { label: "Low", value: summary.low, href: `${AUDIT}?status=low` },
    {
      label: `Sessions held in ${monthName}`,
      value: holdsRes.count ?? 0,
      href: AUDIT,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Home" />

      <ul
        className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4"
        data-testid="home-numbers"
      >
        {numbers.map((n) => (
          <li key={n.label} className="bg-surface">
            <Link href={n.href} className="block p-5 hover:bg-surface-subtle">
              <span className="eyebrow block text-ink-muted">{n.label}</span>
              <span className="mt-3 block font-mono text-3xl font-semibold text-ink">
                {n.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="border border-border bg-surface" data-testid="home-needs-you">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
            Needs you
          </h2>
          {items.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">Nothing today.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.text} className="border-b border-border last:border-0">
                  <Link
                    href={item.href}
                    className="block px-6 py-3 text-sm text-ink hover:bg-surface-subtle"
                  >
                    {item.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-border bg-surface" data-testid="home-coming-up">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
            Coming up
          </h2>
          {dates.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">No dates set.</p>
          ) : (
            <ul>
              {dates.map((m) => (
                <li
                  key={m.date}
                  className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border px-6 py-3 text-sm last:border-0"
                >
                  <span className="font-medium text-ink">
                    {DAY_LABEL.format(new Date(`${m.date}T00:00:00Z`))}
                  </span>
                  <span className="text-ink-secondary">{m.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-ink-muted" data-testid="home-freshness">
        Setmore synced{" "}
        {lastSync
          ? `${SYNC_LABEL.format(new Date(lastSync.started_at))} (${lastSync.status})`
          : "never"}
        . GMS export imported {ago(daysSince(lastGmsImportAt, now))}.
      </p>
    </div>
  );
}
