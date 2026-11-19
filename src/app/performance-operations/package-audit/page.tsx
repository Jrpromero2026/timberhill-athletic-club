import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  summarize,
  type PackageBalanceRow,
  type PackageStatus,
} from "@/lib/package-audit/balances";
import {
  filterChips,
  filterRows,
  parseFilter,
} from "@/lib/package-audit/ledger-filter";
import {
  currentPeriodMonth,
  holdsAreLive,
  holdsByTrainer,
  statusBreakdown,
  type HoldRow,
} from "@/lib/package-audit/flow";
import { HubLibrary } from "@/components/hub/hub-library";
import {
  AuditFlow,
  StatusBar,
  TrainerHoldBars,
  type FlowStep,
} from "@/components/package-audit/audit-flow";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Package audit" };

const DESCRIPTION =
  "Sessions used in Setmore against packages bought in GMS.";

const STATUS_CLASS: Record<PackageStatus, string> = {
  held: "bg-negative-soft text-negative",
  length_mismatch: "bg-warning-soft text-warning",
  negative: "bg-warning-soft text-warning",
  low: "bg-surface-sunken text-ink-secondary",
  payment_plan: "bg-surface-sunken text-ink-secondary",
  ok: "bg-positive-soft text-positive",
};

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

function shortDate(value: string | null): string {
  return value ? SHORT_DATE.format(new Date(value)) : "";
}

const NUMBER = new Intl.NumberFormat("en-US");

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function PackageAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: requestedStatus, q: requestedQuery } = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return (
      <div className="space-y-6">
        <PageHeader title="Package audit" description={DESCRIPTION} />
        <EmptyState
          title="Sign in to see the package audit"
          description="Balances need a signed-in session."
        />
      </div>
    );
  }

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);
  const readable = orgIds.filter((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "payroll:read"),
  );
  if (readable.length === 0) return <PermissionDenied title="Package audit" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Package audit" />;

  // The pkg_* views are not in the generated Database types yet; the row
  // shape is declared in @/lib/package-audit/balances and RLS (payroll:read)
  // scopes what comes back.
  const periodMonth = currentPeriodMonth();
  const count = (table: string) =>
    actor.supabase
      .from(table as never)
      .select("*", { count: "exact", head: true })
      .in("organization_id", readable);

  const [
    balancesRes,
    syncRes,
    sessionsRes,
    purchasesRes,
    accountsRes,
    holdsRes,
    settingsRes,
  ] = await Promise.all([
    actor.supabase
      .from("v_pkg_balances" as never)
      .select(
        "billing_account_id, account_name, clients, minutes, purchased, delivered, balance, booked_next_30d, last_purchase_at, last_session_at, recent_trainers, status, other_length_credit",
      )
      .in("organization_id", readable),
    actor.supabase
      .from("pkg_sync_runs" as never)
      .select("status, started_at")
      .in("organization_id", readable)
      .order("started_at", { ascending: false })
      .limit(1),
    count("pkg_setmore_sessions"),
    count("pkg_purchases"),
    count("pkg_billing_accounts"),
    actor.supabase
      .from("v_pkg_payroll_holds" as never)
      .select("trainer, cost")
      .in("organization_id", readable)
      .eq("period_month", periodMonth),
    actor.supabase
      .from("pkg_settings" as never)
      .select("hold_grace_sessions, holds_live_from")
      .in("organization_id", readable)
      .limit(1),
  ]);

  if (balancesRes.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Package audit" description={DESCRIPTION} />
        <EmptyState
          title="Balances could not be loaded"
          description={balancesRes.error.message}
        />
      </div>
    );
  }

  const rows = ((balancesRes.data ?? []) as unknown as PackageBalanceRow[]).sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.balance - b.balance ||
      a.account_name.localeCompare(b.account_name),
  );
  const summary = summarize(rows);
  // Filters apply to the table only; the visuals above it show every account.
  const filter = parseFilter(requestedStatus);
  const query = (requestedQuery ?? "").slice(0, 80);
  const tableRows = filterRows(rows, filter, query);
  const chips = filterChips(rows, query);
  const lastSync = (syncRes.data ?? [])[0] as
    | { status: string; started_at: string }
    | undefined;
  const settings = (settingsRes.data ?? [])[0] as
    | { hold_grace_sessions: number; holds_live_from: string | null }
    | undefined;
  const grace = settings?.hold_grace_sessions ?? 2;
  const trainerHolds = holdsByTrainer(
    (holdsRes.data ?? []) as unknown as HoldRow[],
  );
  const heldSessions = trainerHolds.reduce((sum, t) => sum + t.sessions, 0);
  const live = holdsAreLive(settings?.holds_live_from ?? null, periodMonth);
  const monthLabel = MONTH_LABEL.format(new Date(`${periodMonth}T00:00:00Z`));
  const shown = (res: { count: number | null }) =>
    res.count === null ? "—" : NUMBER.format(res.count);

  const steps: FlowStep[] = [
    {
      label: "Setmore",
      value: shown(sessionsRes),
      detail: lastSync
        ? `Sessions synced. Last sync ${shortDate(lastSync.started_at)} (${lastSync.status}).`
        : "Sessions synced nightly.",
    },
    {
      label: "GMS",
      value: shown(purchasesRes),
      detail: "Package purchases imported from the GMS export.",
    },
    {
      label: "Match",
      value: shown(accountsRes),
      detail: "Paying accounts, with their Setmore clients linked by name.",
    },
    {
      label: "Balance",
      value: NUMBER.format(rows.length),
      detail: "Bought minus used, per account and session length.",
    },
    {
      label: "Payroll",
      value: NUMBER.format(heldSessions),
      detail: `Sessions held in ${monthLabel}: more than ${grace} past the package.`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Package audit"
        description={DESCRIPTION}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No package activity yet"
          description="Balances show once Setmore has synced and a GMS export is imported."
        />
      ) : (
        <>
          <AuditFlow steps={steps} />

          <div className="grid gap-3 xl:grid-cols-2">
            <StatusBar
              slices={statusBreakdown(rows)}
              total={rows.length}
              note={
                summary.held > 0
                  ? `Of ${summary.held} on hold: ${summary.heldWithPackage} bought a package and used more, ${summary.heldNoPackage} have no package linked (name mismatch or older package).`
                  : undefined
              }
            />
            <TrainerHoldBars
              rows={trainerHolds}
              monthLabel={monthLabel}
              live={live}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap gap-2" aria-label="Filter the ledger">
              {chips.map((chip) => {
                const active = chip.key === (filter ?? "all");
                return (
                  <li key={chip.key}>
                    <Link
                      href={chip.href}
                      aria-current={active ? "true" : undefined}
                      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-sm ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-border bg-surface text-ink-secondary hover:border-ink"
                      }`}
                    >
                      {chip.label}
                      <span className="font-mono text-xs">{chip.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <form method="get" className="flex items-center gap-2" role="search">
              {filter && <input type="hidden" name="status" value={filter} />}
              <label htmlFor="ledger-search" className="sr-only">
                Search clients or trainers
              </label>
              <input
                id="ledger-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search client or trainer"
                className="h-9 w-56 border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent"
              />
              <button
                type="submit"
                className="h-9 border border-ink bg-ink px-3 text-sm font-medium text-white"
              >
                Search
              </button>
            </form>
          </div>

          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Paying account</th>
                  <th className="px-3 py-2">Setmore client(s)</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Bought</th>
                  <th className="px-3 py-2 text-right">Used</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">Booked 30d</th>
                  <th className="px-3 py-2">Last purchase</th>
                  <th className="px-3 py-2">Last session</th>
                  <th className="px-3 py-2">Trainers (90 days)</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-ink-secondary">
                      No accounts match.
                    </td>
                  </tr>
                )}
                {tableRows.map((row) => (
                  <tr
                    key={`${row.billing_account_id}:${row.minutes}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[row.status]}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{row.account_name}</td>
                    <td className="px-3 py-2 text-ink-secondary">{row.clients ?? ""}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.minutes}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.purchased}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.delivered}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${row.balance < 0 ? "text-negative" : "text-ink"}`}
                    >
                      {row.balance}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{row.booked_next_30d}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-secondary">{shortDate(row.last_purchase_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-secondary">{shortDate(row.last_session_at)}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {(row.recent_trainers ?? "").replaceAll(", CSCS", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HubLibrary section="audit" />
    </div>
  );
}
