import type { MembershipGrant } from "@/lib/authz/authz";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  formatMetricValue,
  HEALTH_CLASS,
  HEALTH_LABEL,
} from "@/lib/intelligence/format";
import type { IntelligenceSession } from "@/lib/intelligence/service";
import type { MetricBreakdown } from "@/lib/intelligence/shared/types";
import { MetricCard } from "@/components/widgets/metric-card";
import { SummaryCard } from "@/components/widgets/summary-card";

/**
 * The quick report — the full metric report from Phase 5, now a Report
 * Center tab. Every number comes from the IntelligenceSession; zero
 * formulas live here.
 */

const OVERVIEW_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["completed_rate_bp", "Completed rate"],
  ["cancellation_rate_bp", "Cancellation rate"],
  ["no_show_rate_bp", "No-show rate"],
  ["coaching_minutes", "Coaching time"],
  ["schedule_utilization_bp", "Schedule utilization"],
];

const REVENUE_CARDS: [string, string][] = [
  ["revenue_listed_cents", "Revenue (listed)"],
  ["revenue_per_session_cents", "Revenue / session"],
  ["revenue_per_hour_cents", "Revenue / hour"],
  ["revenue_growth_bp", "Revenue growth"],
];

const PAYROLL_CARDS: [string, string][] = [
  ["payroll_gross_cents", "Gross payroll"],
  ["payroll_pct_of_revenue_bp", "Payroll %"],
  ["payroll_per_hour_cents", "Payroll / hour"],
  ["payroll_variance_cents", "Payroll variance"],
];

const CLIENT_CARDS: [string, string][] = [
  ["active_clients", "Active clients"],
  ["new_clients", "New clients"],
  ["returning_clients", "Returning clients"],
  ["client_retention_rate_bp", "Client retention"],
];

const READINESS_ROWS: string[] = [
  "trainer_assignment_coverage_bp",
  "compensation_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
  "import_health_bp",
  "payroll_readiness_bp",
  "organization_readiness_bp",
];

function BreakdownTable({
  title,
  testId,
  firstColumn,
  breakdowns,
}: {
  title: string;
  testId: string;
  firstColumn: string;
  breakdowns: { label: string; breakdown: MetricBreakdown }[];
}) {
  const keys = new Map<string, string>();
  for (const { breakdown } of breakdowns) {
    for (const row of breakdown.rows) keys.set(row.key, row.label);
  }
  const sorted = [...keys.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">No data in this reporting period.</p>
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">{firstColumn}</th>
                {breakdowns.map((b) => (
                  <th key={b.label} className="px-4 py-2 text-right font-medium">
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(([key, label]) => (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{label}</td>
                  {breakdowns.map((b) => {
                    const row = b.breakdown.rows.find((r) => r.key === key);
                    return (
                      <td key={b.label} className="px-4 py-2.5 text-right font-mono text-xs">
                        {row ? formatMetricValue(row.value, b.breakdown.unit) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function QuickReport({
  session,
  memberships,
  organizationId,
}: {
  session: IntelligenceSession;
  memberships: MembershipGrant[];
  organizationId: string;
}) {
  const canManageReports = hasPermissionInOrganization(
    memberships,
    organizationId,
    "report:manage",
  );

  const cardSection = (testId: string, title: string, cards: [string, string][]) => (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([id, label]) => (
          <MetricCard key={id} result={session.getMetric(id)} label={label} />
        ))}
      </div>
    </section>
  );

  const departmentBreakdowns = [
    { label: "Sessions", breakdown: session.getBreakdown("appointments_completed", "department") },
    { label: "Coaching time", breakdown: session.getBreakdown("coaching_minutes", "department") },
    { label: "Revenue (listed)", breakdown: session.getBreakdown("revenue_listed_cents", "department") },
    { label: "Avg session value", breakdown: session.getBreakdown("average_session_value_cents", "department") },
    { label: "Active trainers", breakdown: session.getBreakdown("active_trainers", "department") },
    { label: "Active clients", breakdown: session.getBreakdown("active_clients", "department") },
  ];
  const trainerBreakdowns = [
    { label: "Sessions", breakdown: session.getBreakdown("appointments_completed", "trainer") },
    { label: "Coaching time", breakdown: session.getBreakdown("coaching_minutes", "trainer") },
    { label: "Revenue (listed)", breakdown: session.getBreakdown("revenue_listed_cents", "trainer") },
    { label: "Revenue / hour", breakdown: session.getBreakdown("revenue_per_hour_cents", "trainer") },
    { label: "Gross payroll", breakdown: session.getBreakdown("payroll_gross_cents", "trainer") },
  ];

  const summary = canManageReports ? session.getExecutiveSummary() : null;
  const readiness = canManageReports
    ? READINESS_ROWS.map((id) => session.getMetric(id))
    : [];

  return (
    <div className="space-y-8">
      {cardSection("report-org-metrics", "Appointments & utilization", OVERVIEW_CARDS)}
      {cardSection("report-revenue", "Revenue", REVENUE_CARDS)}
      {cardSection("report-payroll", "Payroll", PAYROLL_CARDS)}
      {cardSection("report-clients", "Clients & retention", CLIENT_CARDS)}

      <BreakdownTable
        title="Departments"
        testId="report-departments"
        firstColumn="Department"
        breakdowns={departmentBreakdowns}
      />
      <BreakdownTable
        title="Trainers"
        testId="report-trainers"
        firstColumn="Trainer"
        breakdowns={trainerBreakdowns}
      />

      {canManageReports && (
        <section className="space-y-2" data-testid="report-readiness">
          <h2 className="text-sm font-semibold text-ink">Configuration readiness</h2>
          <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {readiness.map((result) => (
                  <tr
                    key={result.metricId}
                    className="border-b border-border last:border-0"
                    data-metric={result.metricId}
                    data-health={result.health}
                  >
                    <td className="px-4 py-2.5 text-ink">
                      {result.metricId
                        .replaceAll("_bp", "")
                        .replaceAll("_", " ")
                        .replace(/^./, (c) => c.toUpperCase())}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatMetricValue(result.value, result.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${HEALTH_CLASS[result.health]}`}
                      >
                        {HEALTH_LABEL[result.health]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {result.reasons[0] ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary?.allowed && (
        <div data-testid="report-summary">
          <SummaryCard items={summary.items} />
        </div>
      )}

      <p className="text-xs text-ink-muted">
        All figures are computed by the Performance Intelligence Engine
        (intel-v1) from the canonical appointment ledger, finalized payroll
        runs, and configuration. Revenue is source listed/paid value; payroll
        uses posted runs only.
      </p>
    </div>
  );
}
