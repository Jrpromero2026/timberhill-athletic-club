import type { Metadata } from "next";
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

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-ink">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-ink-muted">{hint}</p>
    </div>
  );
}

export default async function PackageAuditPage() {
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
  const [balancesRes, syncRes] = await Promise.all([
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
  const lastSync = (syncRes.data ?? [])[0] as
    | { status: string; started_at: string }
    | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Package audit"
        description={
          lastSync
            ? `${DESCRIPTION} Setmore last synced ${shortDate(lastSync.started_at)} (${lastSync.status}).`
            : DESCRIPTION
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No package activity yet"
          description="Balances show once Setmore has synced and a GMS export is imported."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="On hold" value={summary.held} hint="Past package + grace" />
            <Tile label="Likely real overdraws" value={summary.heldWithPackage} hint="Bought, then used more" />
            <Tile label="No package linked" value={summary.heldNoPackage} hint="Name mismatch or older package" />
            <Tile label="Wrong length" value={summary.lengthMismatch} hint="Credit on another length" />
            <Tile label="Negative" value={summary.negative} hint="Within the grace" />
            <Tile label="Low" value={summary.low} hint="Renewal due" />
          </div>

          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
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
                {rows.map((row) => (
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
    </div>
  );
}
