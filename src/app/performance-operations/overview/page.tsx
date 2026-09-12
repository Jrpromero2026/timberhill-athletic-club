import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AlertListCard } from "@/components/widgets/alert-list";
import { DashboardGrid, SectionHeader, Widget, WidgetEmpty } from "@/components/widgets/section";
import { ListCard, type ListRow } from "@/components/widgets/list-card";
import { MetricCard } from "@/components/widgets/metric-card";
import { ReadinessCard } from "@/components/widgets/readiness-card";
import { SummaryCard } from "@/components/widgets/summary-card";
import { TimelineCard } from "@/components/widgets/timeline-card";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { formatCents } from "@/lib/money/money";
import { formatMetricValue } from "@/lib/intelligence/format";
import { getOverviewData } from "@/lib/data/overview";
import { loadOperationsSnapshot } from "@/lib/operations/snapshot";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { RUN_BADGE } from "../payroll/run-badge";

export const metadata: Metadata = { title: "Overview" };

/**
 * Executive Operations Center. ONE role-aware page: sections render by
 * capability (permission), so every role shares the same components while
 * seeing only what it may. Every number comes from the Intelligence Engine
 * via the operations snapshot; this page computes nothing.
 */

const FINANCIAL_KPIS = [
  { label: "Revenue", hint: "Awaiting Import Center" },
  { label: "Payroll", hint: "Not yet calculated" },
  { label: "Sessions", hint: "No imported data" },
  { label: "Active Clients", hint: "No imported data" },
  { label: "Revenue per Session", hint: "Awaiting Import Center" },
  { label: "Payroll Percentage", hint: "Not yet calculated" },
];

const BATCH_BADGE: Record<string, string> = {
  uploaded: "draft",
  parsing: "draft",
  validating: "draft",
  needs_review: "closed",
  ready_for_approval: "open",
  approved: "open",
  posted: "active",
  failed: "locked",
};

const SELF_OVERVIEW_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["completed_rate_bp", "Completed rate"],
  ["coaching_minutes", "Coaching time"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["payroll_gross_cents", "Gross payroll (posted)"],
  ["active_clients", "Active clients"],
];

const ORG_STATUS_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["payroll_gross_cents", "Gross payroll"],
  ["active_clients", "Active clients"],
];

export default async function OverviewPage() {
  const context = await getWorkspaceContext();
  const periods = await getPeriodContext(context);

  const workspaceName =
    context.selection.kind === "all"
      ? "All Workspaces"
      : (context.selected?.name ?? "No workspace");

  const periodChip = periods.selected ? (
    <span className="inline-flex h-9 items-center gap-2 rounded-[--radius-control] border border-border bg-surface px-3 text-sm font-medium text-ink">
      {periods.selected.label}
      <StatusBadge status={periods.selected.status} />
    </span>
  ) : (
    <span className="inline-flex h-9 items-center rounded-[--radius-control] border border-dashed border-border-strong bg-surface px-3 text-sm text-ink-muted">
      {periods.selectable ? "No reporting period selected" : "Reporting period: n/a"}
    </span>
  );

  /* ------------------------- offline / all-workspaces fallbacks -------- */
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    const data = await getOverviewData(context);
    return (
      <div className="space-y-6">
        <PageHeader
          title={workspaceName}
          description={
            context.selection.kind === "all"
              ? "Cross-organization view. Select a single workspace for the full operations center."
              : "Operational overview for the selected workspace."
          }
          actions={periodChip}
        />
        {context.mode === "offline" && (
          <div className="rounded-[--radius-card] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            <strong className="font-semibold">Offline preview.</strong> Explicit
            development mode with no Supabase connection — structure only, no
            real data.
          </div>
        )}
        <section aria-label="Financial indicators">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {FINANCIAL_KPIS.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} hint={kpi.hint} />
            ))}
          </div>
        </section>
        <section
          aria-label="Department summary"
          className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Departments</h2>
            <span className="text-xs text-ink-muted">{data.departments.length} total</span>
          </div>
          {data.departments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No departments visible in this workspace.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((dept) => (
                  <tr key={dept.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{dept.name}</td>
                    <td className="px-4 py-2.5 text-ink-secondary">{dept.organizationName}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={dept.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    );
  }

  /* --------------------------------- live, single organization --------- */
  const organizationId = context.selection.organizationId;
  const actor = await getActorContext();
  if (!actor) return null;

  const can = (p: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, organizationId, p);
  const deptScopedIds = context.memberships
    .filter(
      (m) => m.organizationId === organizationId && m.roleKey === "department_manager",
    )
    .flatMap((m) => m.departmentIds ?? []);
  const isDeptManager = can("appointment:read") && deptScopedIds.length > 0 && !context.canAccessAll;
  const isTrainerSelf = !can("appointment:read") && can("trainer:read_self");

  const snapshot = await loadOperationsSnapshot(
    actor,
    organizationId,
    periods.selected
      ? {
          id: periods.selected.id,
          startDate: periods.selected.startDate,
          endDate: periods.selected.endDate,
        }
      : null,
  );
  const session = snapshot.session;

  /* --------------------------- trainer self dashboard ------------------ */
  if (isTrainerSelf) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My operations"
          description={`${workspaceName} · your sessions, pay, and updates`}
          actions={periodChip}
        />
        {session ? (
          <DashboardGrid columns={3}>
            {SELF_OVERVIEW_CARDS.map(([id, label]) => (
              <MetricCard key={id} result={session.getMetric(id)} label={label} />
            ))}
          </DashboardGrid>
        ) : (
          <Widget testId="overview-no-period">
            <WidgetEmpty reason="Select a reporting period in the header to see your metrics." />
          </Widget>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListCard
            title="Shortcuts"
            testId="overview-self-links"
            emptyReason=""
            rows={[
              { key: "reports", label: "My performance report", href: "/performance-operations/reports" },
              { key: "statements", label: "My payroll statements", href: "/performance-operations/payroll" },
              { key: "time", label: "Log a time entry", href: "/performance-operations/payroll/time" },
              { key: "notifications", label: "Notifications", href: "/performance-operations/notifications" },
            ]}
          />
          <TimelineCard entries={[]} title="Recent activity" />
        </div>
      </div>
    );
  }

  /* ---------------------- department manager dashboard ------------------ */
  if (isDeptManager) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`${workspaceName} · Departments`}
          description="Your department operations."
          actions={periodChip}
        />
        {!session && (
          <Widget testId="overview-no-period">
            <WidgetEmpty reason="Select a reporting period in the header to see department metrics." />
          </Widget>
        )}
        {session &&
          deptScopedIds.map((departmentId) => {
            const name =
              session.dataset.names.departments.get(departmentId) ?? "Department";
            return (
              <section key={departmentId} className="space-y-3" data-testid="overview-department">
                <SectionHeader
                  title={name}
                  href={`/performance-operations/departments/${departmentId}`}
                  hrefLabel="Department overview →"
                />
                <DashboardGrid columns={4}>
                  {(
                    [
                      ["appointments_completed", "Sessions"],
                      ["coaching_minutes", "Coaching time"],
                      ["revenue_listed_cents", "Revenue (listed)"],
                      ["schedule_utilization_bp", "Utilization"],
                    ] as [string, string][]
                  ).map(([id, label]) => (
                    <MetricCard
                      key={id}
                      result={session.getMetric(id, { departmentId })}
                      label={label}
                    />
                  ))}
                </DashboardGrid>
              </section>
            );
          })}
      </div>
    );
  }

  /* --------------------------- organization dashboard ------------------- */
  const payrollRows: ListRow[] = snapshot.activeRuns.map((run) => ({
    key: run.id,
    label: run.name,
    sublabel:
      run.blockingIssueCount > 0
        ? `${run.blockingIssueCount} blocking issue(s)`
        : undefined,
    href: `/performance-operations/payroll/${run.id}`,
    status: { style: RUN_BADGE[run.status] ?? "draft", text: run.status.replaceAll("_", " ") },
    value: formatCents(run.finalTotalCents),
  }));
  const importRows: ListRow[] = snapshot.pendingBatches.map((batch) => ({
    key: batch.id,
    label: batch.filename,
    sublabel: batch.blockedRows > 0 ? `${batch.blockedRows} blocked row(s)` : undefined,
    href: `/performance-operations/imports/${batch.id}`,
    status: {
      style: BATCH_BADGE[batch.status] ?? "draft",
      text: batch.status.replaceAll("_", " "),
    },
  }));

  const summary = session && can("report:manage") ? session.getExecutiveSummary() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workspaceName}
        description="Executive operations center — live pipeline status, readiness, and engine metrics."
        actions={periodChip}
      />

      <section className="space-y-3" data-testid="overview-status">
        <SectionHeader title="Today's operational status" />
        {session ? (
          <DashboardGrid columns={4}>
            {ORG_STATUS_CARDS.map(([id, label]) => (
              <MetricCard key={id} result={session.getMetric(id)} label={label} />
            ))}
          </DashboardGrid>
        ) : (
          <Widget testId="overview-no-period">
            <WidgetEmpty reason="Select a reporting period in the header — every metric is computed for that window." />
          </Widget>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {(can("payroll:read") || can("import:read")) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {can("payroll:read") && (
                <ListCard
                  title="Payroll status"
                  testId="overview-payroll"
                  emptyReason="No active payroll runs — finalized runs are in Payroll."
                  rows={payrollRows}
                  action={
                    <Link href="/performance-operations/payroll" className="text-xs font-medium text-accent hover:text-accent-strong">
                      Payroll →
                    </Link>
                  }
                />
              )}
              {can("import:read") && (
                <ListCard
                  title="Open imports"
                  testId="overview-imports"
                  emptyReason="No import batches awaiting action."
                  rows={importRows}
                  action={
                    <Link href="/performance-operations/imports" className="text-xs font-medium text-accent hover:text-accent-strong">
                      Imports →
                    </Link>
                  }
                />
              )}
            </div>
          )}

          {session && (
            <section className="space-y-3" data-testid="overview-departments">
              <SectionHeader title="Department snapshot" href="/performance-operations/reports" hrefLabel="Full report →" />
              <DepartmentSnapshot session={session} />
            </section>
          )}

          {session && (
            <section className="space-y-3" data-testid="overview-trainers">
              <SectionHeader title="Trainer snapshot" href="/performance-operations/reports" hrefLabel="Full report →" />
              <TrainerSnapshot session={session} />
            </section>
          )}

          {summary?.allowed && (
            <SummaryCard items={summary.items} testId="overview-summary" />
          )}
        </div>

        <div className="space-y-4">
          <AlertListCard alerts={snapshot.alerts} limit={8} testId="overview-alerts" />
          {can("report:manage") && (
            <ReadinessCard results={snapshot.readiness} testId="overview-readiness" />
          )}
          {can("audit:read") && (
            <TimelineCard entries={snapshot.timeline} testId="overview-timeline" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------- snapshot tables (engine breakdowns) ------------- */

function DepartmentSnapshot({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof loadOperationsSnapshot>>["session"]>;
}) {
  const sessions = session.getBreakdown("appointments_completed", "department");
  const revenue = session.getBreakdown("revenue_listed_cents", "department");
  const minutes = session.getBreakdown("coaching_minutes", "department");
  if (sessions.rows.length === 0) {
    return (
      <Widget>
        <WidgetEmpty reason="No department activity in this reporting period." />
      </Widget>
    );
  }
  return (
    <Widget>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-1.5 pr-2 font-medium">Department</th>
            <th className="py-1.5 pr-2 text-right font-medium">Sessions</th>
            <th className="py-1.5 pr-2 text-right font-medium">Coaching time</th>
            <th className="py-1.5 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {sessions.rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-2">
                <Link
                  href={`/performance-operations/departments/${row.key}`}
                  className="font-medium text-ink hover:text-accent"
                >
                  {row.label}
                </Link>
              </td>
              <td className="py-2 pr-2 text-right font-mono text-xs">{row.value ?? "—"}</td>
              <td className="py-2 pr-2 text-right font-mono text-xs">
                {formatMetricValue(
                  minutes.rows.find((r) => r.key === row.key)?.value ?? null,
                  "minutes",
                )}
              </td>
              <td className="py-2 text-right font-mono text-xs">
                {formatMetricValue(
                  revenue.rows.find((r) => r.key === row.key)?.value ?? null,
                  "cents",
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Widget>
  );
}

function TrainerSnapshot({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof loadOperationsSnapshot>>["session"]>;
}) {
  const sessions = session.getBreakdown("appointments_completed", "trainer");
  const revenue = session.getBreakdown("revenue_listed_cents", "trainer");
  const top = [...sessions.rows]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.label.localeCompare(b.label))
    .slice(0, 6);
  if (top.length === 0) {
    return (
      <Widget>
        <WidgetEmpty reason="No trainer activity in this reporting period." />
      </Widget>
    );
  }
  return (
    <Widget>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-1.5 pr-2 font-medium">Trainer</th>
            <th className="py-1.5 pr-2 text-right font-medium">Sessions</th>
            <th className="py-1.5 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {top.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-2 font-medium text-ink">{row.label}</td>
              <td className="py-2 pr-2 text-right font-mono text-xs">{row.value ?? "—"}</td>
              <td className="py-2 text-right font-mono text-xs">
                {formatMetricValue(
                  revenue.rows.find((r) => r.key === row.key)?.value ?? null,
                  "cents",
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Widget>
  );
}
