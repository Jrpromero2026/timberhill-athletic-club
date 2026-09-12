import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardGrid, SectionHeader, Widget, WidgetEmpty } from "@/components/widgets/section";
import { MetricCard } from "@/components/widgets/metric-card";
import { TrendIndicator } from "@/components/widgets/trend-indicator";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { DEPARTMENT_SCOPED_ROLES } from "@/lib/authz/permissions";
import { formatMetricValue } from "@/lib/intelligence/format";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Department overview" };

const DEPT_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions"],
  ["coaching_minutes", "Coaching time"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["average_session_value_cents", "Avg session value"],
  ["schedule_utilization_bp", "Utilization"],
  ["active_trainers", "Active trainers"],
  ["active_clients", "Active clients"],
  ["cancellation_rate_bp", "Cancellation rate"],
];

/**
 * Department overview — every number from the Intelligence Engine at
 * department scope; deep links to the owning workflows. Department
 * managers see only their own departments (service + RLS enforced).
 */
export default async function DepartmentOverviewPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return <PermissionDenied title="Department overview" />;
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "department:read")) {
    return <PermissionDenied title="Department overview" />;
  }
  // Department-scoped roles may only open their own departments.
  const deptScoped = context.memberships.filter(
    (m) =>
      m.organizationId === organizationId &&
      DEPARTMENT_SCOPED_ROLES.includes(m.roleKey),
  );
  const hasOrgWide = context.memberships.some(
    (m) =>
      (m.organizationId === organizationId || m.roleKey === "platform_admin") &&
      !DEPARTMENT_SCOPED_ROLES.includes(m.roleKey),
  );
  if (!hasOrgWide && deptScoped.length > 0) {
    const allowed = deptScoped.flatMap((m) => m.departmentIds ?? []);
    if (!allowed.includes(departmentId)) {
      return <PermissionDenied title="Department overview" />;
    }
  }

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Department overview" />;
  const { data: department } = await actor.supabase
    .from("departments")
    .select("id, name, status, organization_id")
    .eq("id", departmentId)
    .maybeSingle();
  if (!department || department.organization_id !== organizationId) notFound();

  const period = await getPeriodContext(context);
  if (!period.selected) {
    return (
      <div className="space-y-6">
        <PageHeader title={department.name} description="Department overview" />
        <EmptyState
          title="Select a reporting period"
          description="Department metrics are computed for the selected reporting period."
        />
      </div>
    );
  }

  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    period.selected.startDate,
    period.selected.endDate,
  );
  const scope = { departmentId };
  const trainerSessions = session.getBreakdown("appointments_completed", "trainer", scope);
  const trainerRevenue = session.getBreakdown("revenue_listed_cents", "trainer", scope);
  const trainerMinutes = session.getBreakdown("coaching_minutes", "trainer", scope);
  const serviceSessions = session.getBreakdown("appointments_completed", "service", scope);
  const sessionsTrend = session.getTrend("appointments_completed", "weekly", scope);
  const revenueTrend = session.getTrend("revenue_listed_cents", "weekly", scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title={department.name}
        description={`${context.selected?.name ?? ""} · ${period.selected.label} · department overview (engine intel-v1)`}
        actions={
          <Link
            href="/performance-operations/reports"
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Full report →
          </Link>
        }
      />

      <DashboardGrid columns={4}>
        {DEPT_CARDS.map(([id, label]) => (
          <MetricCard key={id} result={session.getMetric(id, scope)} label={label} />
        ))}
      </DashboardGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget title="Sessions trend (weekly)" testId="dept-trend">
          {sessionsTrend.points.length === 0 ? (
            <WidgetEmpty reason="No trend points for this window." />
          ) : (
            <div className="space-y-1.5">
              {sessionsTrend.points.map((point) => (
                <div key={point.key} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-ink-muted">{point.key}</span>
                  <span className="font-mono text-xs text-ink">{point.value ?? "—"}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-xs text-ink-muted">vs previous period</span>
                <TrendIndicator
                  changeBp={sessionsTrend.comparisons[0]?.changeBp ?? null}
                />
              </div>
            </div>
          )}
        </Widget>
        <Widget title="Revenue trend (weekly)">
          {revenueTrend.points.length === 0 ? (
            <WidgetEmpty reason="No trend points for this window." />
          ) : (
            <div className="space-y-1.5">
              {revenueTrend.points.map((point) => (
                <div key={point.key} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-ink-muted">{point.key}</span>
                  <span className="font-mono text-xs text-ink">
                    {formatMetricValue(point.value, "cents")}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-xs text-ink-muted">vs previous period</span>
                <TrendIndicator changeBp={revenueTrend.comparisons[0]?.changeBp ?? null} />
              </div>
            </div>
          )}
        </Widget>
      </div>

      <section className="space-y-3" data-testid="dept-trainers">
        <SectionHeader title="Trainers" href="/performance-operations/trainers" hrefLabel="All trainers →" />
        <Widget>
          {trainerSessions.rows.length === 0 ? (
            <WidgetEmpty reason="No trainer activity in this department for the period." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-1.5 pr-2 font-medium">Trainer</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Sessions</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Coaching time</th>
                  <th className="py-1.5 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {trainerSessions.rows.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/performance-operations/trainers/${row.key}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {row.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">{row.value ?? "—"}</td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">
                      {formatMetricValue(
                        trainerMinutes.rows.find((r) => r.key === row.key)?.value ?? null,
                        "minutes",
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {formatMetricValue(
                        trainerRevenue.rows.find((r) => r.key === row.key)?.value ?? null,
                        "cents",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Widget>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Services" href="/performance-operations/configuration/services" hrefLabel="Configure →" />
        <Widget>
          {serviceSessions.rows.length === 0 ? (
            <WidgetEmpty reason="No service activity in this department for the period." />
          ) : (
            <ul className="divide-y divide-border">
              {serviceSessions.rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium text-ink">{row.label}</span>
                  <span className="font-mono text-xs text-ink">{row.value ?? "—"} sessions</span>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </section>
    </div>
  );
}
