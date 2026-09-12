import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { formatMetricValue } from "@/lib/intelligence/format";
import type { MetricUnit } from "@/lib/intelligence/shared/types";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { composeScorecard } from "@/lib/analytics/scorecards/compose";
import {
  DEFAULT_SCORECARDS,
  DEPARTMENT_SCORECARD,
  INTEGRATION_OPERATIONS_SCORECARD,
  ORGANIZATION_EXECUTIVE_SCORECARD,
  PAYROLL_OPERATIONS_SCORECARD,
  PERIOD_CLOSE_SCORECARD,
  TRAINER_SCORECARD,
} from "@/lib/analytics/scorecards/definitions";
import { loadGoalRecords } from "@/lib/analytics/presentations/packages";
import { ComparisonBadge, FinalityBadge } from "../shared/comparison-badges";

export const metadata: Metadata = { title: "Scorecards" };

/**
 * Scorecards: default role-aware scorecards over the analytics service.
 * Scope selection (department/trainer) narrows through the engine — a
 * trainer only ever composes their own slice; a department manager only
 * their departments.
 */
export default async function ScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; departmentId?: string; trainerId?: string }>;
}) {
  const { card: rawCard, departmentId, trainerId } = await searchParams;
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Scorecards" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Scorecards" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Scorecards are computed for the selected reporting period."
        />
      </div>
    );
  }
  const { service, window, actor, organizationId, can } = context;

  const definitionByKey = {
    organization_executive: ORGANIZATION_EXECUTIVE_SCORECARD,
    department: DEPARTMENT_SCORECARD,
    trainer: TRAINER_SCORECARD,
    payroll_operations: PAYROLL_OPERATIONS_SCORECARD,
    period_close: PERIOD_CLOSE_SCORECARD,
    integration_operations: INTEGRATION_OPERATIONS_SCORECARD,
  } as const;
  const card = (rawCard && rawCard in definitionByKey
    ? rawCard
    : "organization_executive") as keyof typeof definitionByKey;
  const definition = definitionByKey[card];

  // Scope pickers for department/trainer cards.
  const scope = {
    departmentId: card === "department" ? departmentId : undefined,
    trainerId: card === "trainer" ? trainerId : undefined,
  };
  const [departmentsRes, trainersRes] = await Promise.all([
    actor.supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    card === "trainer"
      ? actor.supabase
          .from("trainer_organization_assignments")
          .select("trainer_id, trainers ( id, display_name )")
          .eq("organization_id", organizationId)
          .is("effective_to", null)
      : Promise.resolve({ data: null }),
  ]);
  const trainers = (trainersRes.data ?? [])
    .flatMap((row) => {
      const trainer = row.trainers as unknown as { id: string; display_name: string } | null;
      return trainer ? [{ id: trainer.id, name: trainer.display_name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Trainer card without a selectable roster (trainer-role viewers) falls
  // through to the engine's self-scope — the viewer composes their own
  // slice; admins pick a trainer explicitly.
  const needsScope =
    (card === "department" && !scope.departmentId) ||
    (card === "trainer" && !scope.trainerId && trainers.length > 0);

  const goals = await loadGoalRecords(actor, organizationId);
  const scorecard = needsScope
    ? null
    : await composeScorecard(service, definition, window, scope, goals);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scorecards"
        description={`${definition.description} · ${window.label}`}
        actions={<FinalityBadge window={window} />}
      />

      <div className="flex flex-wrap gap-1.5" data-testid="scorecard-tabs">
        {DEFAULT_SCORECARDS.map((d) => (
          <Link
            key={d.key}
            href={`/performance-operations/analytics/scorecards?card=${d.key}`}
            className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
              card === d.key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {d.name.replace(" Scorecard", "")}
          </Link>
        ))}
      </div>

      {card === "department" && (
        <div className="flex flex-wrap gap-1.5" data-testid="scorecard-department-picker">
          {(departmentsRes.data ?? []).map((d) => (
            <Link
              key={d.id}
              href={`/performance-operations/analytics/scorecards?card=department&departmentId=${d.id}`}
              className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
                scope.departmentId === d.id
                  ? "border-ink bg-ink text-white"
                  : "border-border bg-surface text-ink hover:bg-surface-sunken"
              }`}
            >
              {d.name}
            </Link>
          ))}
        </div>
      )}
      {card === "trainer" && trainers.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="scorecard-trainer-picker">
          {trainers.map((t) => (
            <Link
              key={t.id}
              href={`/performance-operations/analytics/scorecards?card=trainer&trainerId=${t.id}`}
              className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
                scope.trainerId === t.id
                  ? "border-ink bg-ink text-white"
                  : "border-border bg-surface text-ink hover:bg-surface-sunken"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {needsScope ? (
        <EmptyState
          title={card === "department" ? "Choose a department" : "Choose a trainer"}
          description="Pick a scope above to compose its scorecard. Access is enforced per metric — you only see what your role allows."
        />
      ) : scorecard ? (
        <div className="space-y-4" data-testid="scorecard-view">
          {scorecard.sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
              <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-ink-muted">
                      <th scope="col" className="px-3 py-2 font-medium">Metric</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Current</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">vs previous</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">vs prior year</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr
                        key={row.metricId}
                        className="border-b border-border/60"
                        data-metric={row.metricId}
                        data-health={row.current.health}
                      >
                        <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                          {row.label}
                          {row.current.health !== "healthy" && (
                            <span className="ml-2 rounded bg-surface-sunken px-1.5 text-[10px] uppercase text-ink-muted">
                              {row.current.health.replaceAll("_", " ")}
                            </span>
                          )}
                        </th>
                        <td className="px-3 py-2 text-right font-mono text-ink">
                          {formatMetricValue(row.current.value, row.unit as MetricUnit)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <ComparisonBadge comparison={row.previousPeriod} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <ComparisonBadge comparison={row.priorYear} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {row.goal ? (
                            <span data-goal-status={row.goal.progress.status} title={row.goal.name}>
                              {row.goal.progress.status.replaceAll("_", " ")}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="text-xs text-ink-muted">
            Values come from the intelligence engine verbatim; unavailable metrics say so
            instead of showing zero.{" "}
            {can("goal:read") && (
              <Link href="/performance-operations/analytics/goals" className="text-accent hover:text-accent-strong">
                Manage goals
              </Link>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
