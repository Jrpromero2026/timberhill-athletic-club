/**
 * Operational Alert Center — PURE derivation. Alerts come from two honest
 * sources only: intelligence-engine readiness results and pipeline STATES
 * (run/batch statuses, open engine-generated issues). No business logic is
 * re-implemented here; thresholds live in the engine.
 */

import type { MetricResult } from "@/lib/intelligence/shared/types";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "payroll" | "imports" | "configuration" | "reporting";

export interface OperationalAlert {
  /** Stable id: code[:entity] — used for rendering and dedupe. */
  id: string;
  code: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  action: string;
  link: string;
  organizationId: string;
  entityId: string | null;
}

export interface AlertPayrollRun {
  id: string;
  name: string;
  status: string;
  blockingIssueCount: number;
  openLateArrivals: number;
}

export interface AlertImportBatch {
  id: string;
  filename: string;
  status: string;
}

export interface AlertInputs {
  organizationId: string;
  /** Readiness metric results from the intelligence engine. */
  readiness: Pick<MetricResult, "metricId" | "value" | "health" | "reasons">[];
  /** Payroll runs in NON-terminal, non-finalized states. */
  activePayrollRuns: AlertPayrollRun[];
  /** Import batches in non-terminal states. */
  pendingImportBatches: AlertImportBatch[];
  periodSelected: boolean;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function deriveAlerts(inputs: AlertInputs): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const org = inputs.organizationId;
  const push = (a: Omit<OperationalAlert, "organizationId" | "id">) =>
    alerts.push({
      ...a,
      id: a.entityId ? `${a.code}:${a.entityId}` : a.code,
      organizationId: org,
    });

  // ---- payroll pipeline states -----------------------------------------
  for (const run of inputs.activePayrollRuns) {
    if (run.status === "failed") {
      push({
        code: "payroll_run_failed",
        severity: "critical",
        category: "payroll",
        title: "Payroll calculation failed",
        detail: `${run.name} is in a failed state.`,
        action: "Open the run, fix the underlying issue, and recalculate.",
        link: `/performance-operations/payroll/${run.id}`,
        entityId: run.id,
      });
      continue;
    }
    if (run.blockingIssueCount > 0) {
      push({
        code: "payroll_blocked",
        severity: "critical",
        category: "payroll",
        title: "Payroll blocked",
        detail: `${run.name} has ${run.blockingIssueCount} open blocking issue(s).`,
        action: "Resolve the blocking issues in the review workspace.",
        link: `/performance-operations/payroll/${run.id}/review`,
        entityId: run.id,
      });
    }
    if (run.status === "ready_for_approval") {
      push({
        code: "payroll_awaiting_approval",
        severity: "warning",
        category: "payroll",
        title: "Payroll awaiting approval",
        detail: `${run.name} is ready for approval.`,
        action: "Review and approve the run.",
        link: `/performance-operations/payroll/${run.id}`,
        entityId: run.id,
      });
    } else if (run.status === "needs_review") {
      push({
        code: "payroll_in_review",
        severity: "info",
        category: "payroll",
        title: "Payroll in review",
        detail: `${run.name} needs review before approval.`,
        action: "Complete trainer reviews and submit for approval.",
        link: `/performance-operations/payroll/${run.id}/review`,
        entityId: run.id,
      });
    } else if (run.status === "reopened") {
      push({
        code: "payroll_reopened",
        severity: "warning",
        category: "payroll",
        title: "Payroll reopened",
        detail: `${run.name} was reopened and must be recalculated and re-posted.`,
        action: "Recalculate, re-review, and re-post the run.",
        link: `/performance-operations/payroll/${run.id}`,
        entityId: run.id,
      });
    }
    if (run.openLateArrivals > 0) {
      push({
        code: "late_arriving_appointments",
        severity: "warning",
        category: "payroll",
        title: "Late-arriving appointments",
        detail: `${run.name}: ${run.openLateArrivals} appointment(s) imported after the cutoff are not included.`,
        action: "Recalculate with a refreshed cutoff or leave for a supplemental run.",
        link: `/performance-operations/payroll/${run.id}/review`,
        entityId: run.id,
      });
    }
  }

  // ---- import pipeline states ------------------------------------------
  for (const batch of inputs.pendingImportBatches) {
    if (batch.status === "failed") {
      push({
        code: "import_failed",
        severity: "critical",
        category: "imports",
        title: "Import failed",
        detail: `${batch.filename} failed processing.`,
        action: "Open the batch to inspect its failure code.",
        link: `/performance-operations/imports/${batch.id}`,
        entityId: batch.id,
      });
    } else if (batch.status === "needs_review") {
      push({
        code: "import_awaiting_review",
        severity: "warning",
        category: "imports",
        title: "Import awaiting review",
        detail: `${batch.filename} has rows to resolve.`,
        action: "Work the review queues, then approve the batch.",
        link: `/performance-operations/imports/${batch.id}/review`,
        entityId: batch.id,
      });
    } else if (batch.status === "ready_for_approval") {
      push({
        code: "import_awaiting_approval",
        severity: "warning",
        category: "imports",
        title: "Import ready for approval",
        detail: `${batch.filename} is fully resolved and awaiting approval.`,
        action: "Approve and post the batch.",
        link: `/performance-operations/imports/${batch.id}/approval`,
        entityId: batch.id,
      });
    } else if (batch.status === "approved") {
      push({
        code: "import_awaiting_posting",
        severity: "info",
        category: "imports",
        title: "Import approved, not posted",
        detail: `${batch.filename} is approved and can be posted to the ledger.`,
        action: "Post the batch.",
        link: `/performance-operations/imports/${batch.id}`,
        entityId: batch.id,
      });
    }
  }

  // ---- configuration readiness (engine results, engine reasons) --------
  const readinessAlert = (
    metricId: string,
    code: string,
    title: string,
    action: string,
    link: string,
    severity: AlertSeverity,
  ) => {
    const result = inputs.readiness.find((r) => r.metricId === metricId);
    if (!result) return;
    if (result.value !== null && result.value < 10_000) {
      push({
        code,
        severity,
        category: "configuration",
        title,
        detail: result.reasons[0] ?? "Configuration is incomplete.",
        action,
        link,
        entityId: null,
      });
    }
  };
  readinessAlert(
    "compensation_coverage_bp",
    "compensation_missing",
    "Compensation missing",
    "Assign published compensation plans to the remaining trainers.",
    "/performance-operations/configuration/compensation",
    "warning",
  );
  readinessAlert(
    "trainer_assignment_coverage_bp",
    "trainer_missing_assignment",
    "Trainer department assignments incomplete",
    "Assign the remaining trainers to departments.",
    "/performance-operations/trainers",
    "warning",
  );
  readinessAlert(
    "service_alias_coverage_bp",
    "service_alias_missing",
    "Service aliases missing",
    "Add import aliases so services auto-match during imports.",
    "/performance-operations/configuration/services",
    "info",
  );
  readinessAlert(
    "reporting_period_coverage_bp",
    "reporting_period_gap",
    "Reporting period gap",
    "Create reporting periods covering the selected range.",
    "/performance-operations/configuration/reporting-periods",
    "warning",
  );

  if (!inputs.periodSelected) {
    push({
      code: "no_period_selected",
      severity: "info",
      category: "reporting",
      title: "No reporting period selected",
      detail: "Metrics and payroll views need a reporting period.",
      action: "Choose a reporting period in the header.",
      link: "/performance-operations/overview",
      entityId: null,
    });
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.title.localeCompare(b.title) ||
      (a.entityId ?? "").localeCompare(b.entityId ?? ""),
  );
}
