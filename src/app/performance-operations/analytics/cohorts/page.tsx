import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { HeatMapTable } from "@/components/charts/charts";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { buildCohortTable } from "@/lib/analytics/cohorts/cohorts";
import { resolveComparisonWindow } from "@/lib/analytics/comparisons/windows";
import { FinalityBadge } from "../shared/comparison-badges";

export const metadata: Metadata = { title: "Cohorts" };

/**
 * Cohort analysis: first-completed-visit cohorts (the engine's client
 * history definition) by activity month. Client COUNTS only — names never
 * appear; small cohorts can be suppressed; department filters narrow
 * through the same scope rules as every metric.
 */
export default async function CohortsPage({
  searchParams,
}: {
  searchParams: Promise<{ departmentId?: string; months?: string }>;
}) {
  const { departmentId, months: rawMonths } = await searchParams;
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Cohorts" />;
  }
  if (context.state === "ready" && !context.can("cohort:read")) {
    return <PermissionDenied title="Cohorts" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Cohorts" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Cohorts are anchored to the month of the selected reporting period."
        />
      </div>
    );
  }
  const { service, window, actor, organizationId } = context;

  const monthCount = Math.min(12, Math.max(3, Number(rawMonths) || 6));
  // Analysis window: `monthCount` whole calendar months ending with the
  // month of the selected period's end date.
  const rolling = resolveComparisonWindow(
    "rolling_12_months",
    window,
    service.periods,
    service.today,
  );
  if (!rolling.ok) {
    return <PermissionDenied title="Cohorts" />;
  }
  const monthsFrom = (() => {
    const [y, m] = rolling.window.dateTo.slice(0, 7).split("-").map(Number);
    let year = y;
    let month = m - (monthCount - 1);
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    return `${year}-${String(month).padStart(2, "0")}-01`;
  })();
  const cohortWindow = { dateFrom: monthsFrom, dateTo: rolling.window.dateTo };

  const dataset = await service.datasetFor({
    ...window,
    kind: "cohort_window",
    label: "Cohort window",
    dateFrom: cohortWindow.dateFrom,
    dateTo: cohortWindow.dateTo,
  });
  const table = buildCohortTable(
    dataset,
    cohortWindow,
    { departmentId: departmentId || undefined },
    0, // suppression threshold: business decision pending — see INPUTS_REQUIRED
  );

  const { data: departments } = await actor.supabase
    .from("departments")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client cohorts"
        description={`New clients by first-completed-visit month and their active months since — ${table.months[0] ?? ""} to ${table.months[table.months.length - 1] ?? ""}. Distinct client counts, never appointment counts.`}
        actions={<FinalityBadge window={window} />}
      />

      <div className="flex flex-wrap items-center gap-1.5" data-testid="cohort-filters">
        <Link
          href={`/performance-operations/analytics/cohorts?months=${monthCount}`}
          className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
            !departmentId
              ? "border-ink bg-ink text-white"
              : "border-border bg-surface text-ink hover:bg-surface-sunken"
          }`}
        >
          All departments
        </Link>
        {(departments ?? []).map((d) => (
          <Link
            key={d.id}
            href={`/performance-operations/analytics/cohorts?departmentId=${d.id}&months=${monthCount}`}
            className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
              departmentId === d.id
                ? "border-ink bg-ink text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {d.name}
          </Link>
        ))}
        <span className="mx-2 text-xs text-ink-muted">Months:</span>
        {[6, 9, 12].map((m) => (
          <Link
            key={m}
            href={`/performance-operations/analytics/cohorts?months=${m}${departmentId ? `&departmentId=${departmentId}` : ""}`}
            className={`h-8 rounded-[--radius-control] border px-2.5 text-sm leading-8 ${
              monthCount === m
                ? "border-ink bg-ink text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {m}
          </Link>
        ))}
      </div>

      {table.totalClients === 0 ? (
        <EmptyState
          title="No client activity in this window"
          description="Cohorts appear once completed appointments with identified clients exist."
        />
      ) : (
        <div className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <HeatMapTable
            caption={`Active clients by first-visit cohort (rows) and activity month (columns)${departmentId ? " for the selected department" : ""}`}
            columnLabels={table.months}
            rows={table.rows.map((row) => ({
              key: row.cohortMonth,
              label: `${row.cohortMonth} (${row.suppressed ? "•" : (row.newClients ?? 0)} new)`,
              cells: row.cells.map((cell) => ({
                key: cell.month,
                value: cell.activeClients,
                suppressed: cell.suppressed,
              })),
            }))}
          />
          <p className="mt-3 text-xs text-ink-muted" data-testid="cohort-privacy-note">
            {table.totalClients} distinct client(s) in the window
            {table.clientsUnidentified > 0 &&
              ` · ${table.clientsUnidentified} appointment(s) excluded for missing client identity`}
            {departmentId &&
              " · cohort membership is organization-wide; this view counts activity in the selected department"}
            . No client names appear in cohort analytics; row-level access stays inside the
            Clients area for authorized roles.
          </p>
        </div>
      )}
    </div>
  );
}
