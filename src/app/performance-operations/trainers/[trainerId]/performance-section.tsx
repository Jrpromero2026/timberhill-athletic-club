import { DashboardGrid, SectionHeader, Widget, WidgetEmpty } from "@/components/widgets/section";
import { MetricCard } from "@/components/widgets/metric-card";
import { TrendIndicator } from "@/components/widgets/trend-indicator";
import type { ActorContext } from "@/lib/actions/shared";
import { IntelligenceSession } from "@/lib/intelligence/service";
import type { PeriodContext } from "@/lib/period/server";

const TRAINER_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions"],
  ["completed_rate_bp", "Completed rate"],
  ["cancellation_rate_bp", "Cancellation rate"],
  ["coaching_minutes", "Coaching time"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["revenue_per_hour_cents", "Revenue / hour"],
  ["payroll_gross_cents", "Gross payroll"],
  ["active_clients", "Active clients"],
];

/**
 * Trainer performance overview — engine metrics at trainer scope. For a
 * trainer viewing themself the service forces self scope and hides
 * anything unauthorized; org readers see the same widget composition.
 */
export async function TrainerPerformanceSection({
  actor,
  organizationId,
  trainerId,
  period,
}: {
  actor: ActorContext;
  organizationId: string;
  trainerId: string;
  period: PeriodContext;
}) {
  if (!period.selected) {
    return (
      <section className="space-y-3" data-testid="trainer-performance">
        <SectionHeader title="Performance" />
        <Widget>
          <WidgetEmpty reason="Select a reporting period in the header to see performance metrics." />
        </Widget>
      </section>
    );
  }
  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    period.selected.startDate,
    period.selected.endDate,
  );
  const scope = { trainerId };
  const trend = session.getTrend("appointments_completed", "weekly", scope);

  return (
    <section className="space-y-3" data-testid="trainer-performance">
      <SectionHeader
        title={`Performance · ${period.selected.label}`}
        href="/performance-operations/reports"
        hrefLabel="Full report →"
      />
      <DashboardGrid columns={4}>
        {TRAINER_CARDS.map(([id, label]) => (
          <MetricCard key={id} result={session.getMetric(id, scope)} label={label} />
        ))}
      </DashboardGrid>
      {trend.points.length > 0 && (
        <Widget title="Sessions vs previous period">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-ink-muted">
              {trend.comparisons[0]?.previous ?? "—"} → {trend.comparisons[0]?.current ?? "—"} sessions
            </span>
            <TrendIndicator changeBp={trend.comparisons[0]?.changeBp ?? null} />
          </div>
        </Widget>
      )}
    </section>
  );
}
