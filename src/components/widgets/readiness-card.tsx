import Link from "next/link";
import {
  formatMetricValue,
  HEALTH_CLASS,
  HEALTH_LABEL,
} from "@/lib/intelligence/format";
import type { MetricResult } from "@/lib/intelligence/shared/types";
import { Widget, WidgetEmpty } from "./section";

/** Readiness row config: label + the workflow the gap links to. */
export const READINESS_LINKS: Record<string, { label: string; href: string }> = {
  organization_readiness_bp: { label: "Organization readiness", href: "/performance-operations/configuration" },
  trainer_assignment_coverage_bp: { label: "Trainer assignments", href: "/performance-operations/trainers" },
  compensation_coverage_bp: { label: "Compensation", href: "/performance-operations/configuration/compensation" },
  service_alias_coverage_bp: { label: "Import aliases", href: "/performance-operations/configuration/services" },
  reporting_period_coverage_bp: { label: "Reporting periods", href: "/performance-operations/configuration/reporting-periods" },
  import_health_bp: { label: "Import health", href: "/performance-operations/imports" },
  payroll_readiness_bp: { label: "Payroll readiness", href: "/performance-operations/payroll" },
};

function Bar({ valueBp }: { valueBp: number | null }) {
  const pct = valueBp === null ? 0 : Math.min(Math.max(valueBp / 100, 0), 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-sunken">
      <div
        className={`h-1.5 rounded-full ${pct === 100 ? "bg-positive" : "bg-warning"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Readiness scorecard — engine readiness results with deep links. */
export function ReadinessCard({
  results,
  title = "Workspace readiness",
  testId,
}: {
  results: MetricResult[];
  title?: string;
  testId?: string;
}) {
  return (
    <Widget title={title} testId={testId}>
      {results.length === 0 ? (
        <WidgetEmpty reason="Select a reporting period to compute readiness." />
      ) : (
        <ul className="space-y-3">
          {results.map((result) => {
            const link = READINESS_LINKS[result.metricId];
            return (
              <li key={result.metricId} data-metric={result.metricId} data-health={result.health}>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={link?.href ?? "/performance-operations/configuration"}
                    className="text-sm font-medium text-ink hover:text-accent"
                  >
                    {link?.label ?? result.metricId}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink">
                      {formatMetricValue(result.value, result.unit)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${HEALTH_CLASS[result.health]}`}
                    >
                      {HEALTH_LABEL[result.health]}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar valueBp={result.value} />
                </div>
                {result.reasons[0] && (
                  <p className="mt-1 text-[11px] text-ink-muted">{result.reasons[0]}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
