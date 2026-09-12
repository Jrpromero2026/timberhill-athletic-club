/**
 * Close readiness classification — PURE. Consumes system states and
 * intelligence readiness results assembled by the loader (readiness.ts)
 * and produces the structured checklist. No metric formula lives here:
 * every number arrives already computed by its owning engine.
 *
 * Missing information NEVER passes: absent inputs fail their checks.
 */

export type CheckCategory =
  | "reporting_period"
  | "imports"
  | "appointments"
  | "payroll"
  | "configuration"
  | "reporting";

export type CheckSeverity = "blocking" | "warning" | "info";

export interface CloseCheck {
  code: string;
  category: CheckCategory;
  severity: CheckSeverity;
  /** pass = condition satisfied; fail = attention required. */
  status: "pass" | "fail";
  definition: string;
  source: string;
  entityId: string | null;
  explanation: string;
  action: string;
  link: string;
  waivable: boolean;
  acknowledged: boolean;
  resolutionState: "resolved" | "open" | "acknowledged";
  lastEvaluatedAt: string;
}

export interface ReadinessMetricLite {
  metricId: string;
  value: number | null;
  health: string;
  reason: string | null;
}

export interface CloseReadinessInputs {
  now: string;
  organizationId: string;
  closeRunId: string;
  period: {
    id: string;
    organizationId: string;
    startDate: string;
    endDate: string;
    status: string;
    label: string;
  } | null;
  policy: { allowSelfApproval: boolean; payrollRequiredState: "posted" | "locked" };
  imports: {
    processing: number;
    needsReview: number;
    readyForApproval: number;
    approvedUnposted: number;
    failed: number;
    reversedTouchingPeriod: number;
  };
  appointments: {
    activeInPeriod: number;
    correctionsInPeriod: number;
  };
  payroll: {
    finalizedRun: {
      id: string;
      name: string;
      status: string;
      snapshotVersion: number | null;
      totalsReconcile: boolean;
      wasReopened: boolean;
    } | null;
    activeRuns: { id: string; name: string; status: string; blockingIssueCount: number }[];
    openLateArrivalIssues: number;
    stale: boolean;
    pendingAdjustments: number;
    pendingTimeEntries: number;
  };
  configuration: {
    readiness: ReadinessMetricLite[];
    paidAmountsPresent: boolean;
  };
  reporting: {
    executivePackage: { id: string; version: number; status: string } | null;
    exportTypesPresent: string[];
  };
  acknowledgements: ReadonlySet<string>;
}

/** Export types required before close (provisional policy — see docs). */
export const REQUIRED_EXPORT_TYPES = [
  "payroll_register_csv",
  "executive_summary_csv",
] as const;

interface CheckSpec {
  code: string;
  category: CheckCategory;
  severity: CheckSeverity;
  definition: string;
  source: string;
  action: string;
  link: string;
  waivable: boolean;
}

function make(
  spec: CheckSpec,
  fail: boolean,
  explanation: string,
  inputs: CloseReadinessInputs,
  entityId: string | null = null,
): CloseCheck {
  const acknowledged = fail && spec.waivable && inputs.acknowledgements.has(spec.code);
  return {
    ...spec,
    status: fail ? "fail" : "pass",
    entityId,
    explanation,
    acknowledged,
    resolutionState: !fail ? "resolved" : acknowledged ? "acknowledged" : "open",
    lastEvaluatedAt: inputs.now,
  };
}

export function classifyCloseChecks(inputs: CloseReadinessInputs): CloseCheck[] {
  const checks: CloseCheck[] = [];
  const push = (
    spec: CheckSpec,
    fail: boolean,
    explanation: string,
    entityId: string | null = null,
  ) => checks.push(make(spec, fail, explanation, inputs, entityId));

  /* ------------------------------------------------- reporting period */
  const period = inputs.period;
  push(
    {
      code: "period_exists",
      category: "reporting_period",
      severity: "blocking",
      definition: "The reporting period exists and belongs to this organization.",
      source: "reporting_periods",
      action: "Select a valid reporting period for this organization.",
      link: "/performance-operations/configuration/reporting-periods",
      waivable: false,
    },
    period === null || period.organizationId !== inputs.organizationId,
    period === null
      ? "No reporting period is attached to this close run."
      : period.organizationId !== inputs.organizationId
        ? "The reporting period belongs to a different organization."
        : `Period '${period.label}' (${period.startDate} – ${period.endDate}).`,
    period?.id ?? null,
  );
  push(
    {
      code: "period_dates_valid",
      category: "reporting_period",
      severity: "blocking",
      definition: "Period date boundaries are valid (start ≤ end).",
      source: "reporting_periods",
      action: "Correct the period dates before closing.",
      link: "/performance-operations/configuration/reporting-periods",
      waivable: false,
    },
    period !== null && period.startDate > period.endDate,
    period === null
      ? "Not evaluable without a period."
      : `${period.startDate} → ${period.endDate}.`,
    period?.id ?? null,
  );
  push(
    {
      code: "period_open",
      category: "reporting_period",
      severity: "blocking",
      definition: "The period is open (not already closed or locked).",
      source: "reporting_periods",
      action:
        "A closed period must be reopened through the close workflow; a locked period through payroll administration.",
      link: "/performance-operations/period-close",
      waivable: false,
    },
    period === null || period.status !== "open",
    period === null ? "Not evaluable without a period." : `Period status: ${period.status}.`,
    period?.id ?? null,
  );

  /* ------------------------------------------------------------ imports */
  const imports = inputs.imports;
  push(
    {
      code: "imports_processing",
      category: "imports",
      severity: "blocking",
      definition: "No import batches are still uploading, parsing, or validating.",
      source: "import_batches",
      action: "Wait for processing to finish or fail the stuck batch.",
      link: "/performance-operations/imports",
      waivable: false,
    },
    imports.processing > 0,
    `${imports.processing} batch(es) still processing.`,
  );
  push(
    {
      code: "imports_awaiting_review",
      category: "imports",
      severity: "blocking",
      definition: "No import batches are awaiting required review.",
      source: "import_batches",
      action: "Resolve the review queues, then approve or fail the batch.",
      link: "/performance-operations/imports",
      waivable: false,
    },
    imports.needsReview > 0,
    `${imports.needsReview} batch(es) in needs_review.`,
  );
  push(
    {
      code: "imports_awaiting_approval",
      category: "imports",
      severity: "blocking",
      definition: "No fully-resolved import batches are awaiting approval.",
      source: "import_batches",
      action: "Approve and post, or reject the batch.",
      link: "/performance-operations/imports",
      waivable: false,
    },
    imports.readyForApproval > 0,
    `${imports.readyForApproval} batch(es) ready for approval.`,
  );
  push(
    {
      code: "imports_approved_unposted",
      category: "imports",
      severity: "blocking",
      definition: "No approved import batches are waiting to post.",
      source: "import_batches",
      action: "Post the approved batch to the ledger (or reject it).",
      link: "/performance-operations/imports",
      waivable: false,
    },
    imports.approvedUnposted > 0,
    `${imports.approvedUnposted} approved batch(es) not yet posted.`,
  );
  push(
    {
      code: "imports_failed_disposition",
      category: "imports",
      severity: "warning",
      definition: "Failed import batches have been reviewed and dispositioned.",
      source: "import_batches",
      action: "Review each failed batch; acknowledge here once dispositioned.",
      link: "/performance-operations/imports?status=failed",
      waivable: true,
    },
    imports.failed > 0,
    `${imports.failed} failed batch(es) on record.`,
  );
  push(
    {
      code: "import_reversed_in_period",
      category: "imports",
      severity: "warning",
      definition: "No import touching this period was reversed.",
      source: "import_batches",
      action: "Confirm the reversal was intentional and acknowledge.",
      link: "/performance-operations/imports",
      waivable: true,
    },
    imports.reversedTouchingPeriod > 0,
    `${imports.reversedTouchingPeriod} reversed appointment(s) remain on record inside this period.`,
  );

  /* ------------------------------------------------------- appointments */
  push(
    {
      code: "late_arrivals_reviewed",
      category: "appointments",
      severity: "blocking",
      definition:
        "No open late-arriving appointment issues remain on payroll for this period.",
      source: "payroll_issues",
      action:
        "Recalculate payroll with a refreshed cutoff, or resolve the late-arrival issue with a reason.",
      link: "/performance-operations/payroll",
      waivable: false,
    },
    inputs.payroll.openLateArrivalIssues > 0,
    `${inputs.payroll.openLateArrivalIssues} open late-arrival issue(s).`,
  );
  push(
    {
      code: "appointment_corrections_reviewed",
      category: "appointments",
      severity: "warning",
      definition: "Manual appointment corrections in the period are reviewed.",
      source: "appointment_corrections",
      action: "Review the corrections and acknowledge.",
      link: "/performance-operations/appointments",
      waivable: true,
    },
    inputs.appointments.correctionsInPeriod > 0,
    `${inputs.appointments.correctionsInPeriod} manual correction(s) in the period.`,
  );
  push(
    {
      code: "zero_activity_period",
      category: "appointments",
      severity: "warning",
      definition: "The period contains appointment activity.",
      source: "appointments",
      action: "Confirm a zero-activity close is intended and acknowledge.",
      link: "/performance-operations/appointments",
      waivable: true,
    },
    inputs.appointments.activeInPeriod === 0,
    inputs.appointments.activeInPeriod === 0
      ? "No active appointments fall inside this period."
      : `${inputs.appointments.activeInPeriod} active appointment(s) in the period.`,
  );

  /* ------------------------------------------------------------ payroll */
  const payroll = inputs.payroll;
  const payrollRequired = inputs.appointments.activeInPeriod > 0;
  push(
    {
      code: "payroll_finalized",
      category: "payroll",
      severity: "blocking",
      definition: `A ${inputs.policy.payrollRequiredState}-or-stronger payroll run exists for this period (required whenever the period has activity).`,
      source: "payroll_runs",
      action: "Complete the payroll workflow through posting (and locking if policy requires).",
      link: "/performance-operations/payroll",
      waivable: false,
    },
    payrollRequired &&
      (payroll.finalizedRun === null ||
        (inputs.policy.payrollRequiredState === "locked" &&
          payroll.finalizedRun.status !== "locked")),
    payroll.finalizedRun === null
      ? payrollRequired
        ? "No posted or locked payroll run exists for this period."
        : "No payroll required — the period has no active appointments."
      : `Run '${payroll.finalizedRun.name}' is ${payroll.finalizedRun.status} (policy requires ${inputs.policy.payrollRequiredState}).`,
    payroll.finalizedRun?.id ?? null,
  );
  push(
    {
      code: "payroll_no_active_runs",
      category: "payroll",
      severity: "blocking",
      definition: "No unfinished payroll run remains for this period.",
      source: "payroll_runs",
      action: "Finish, void, or supersede the unfinished run.",
      link: payroll.activeRuns[0] ? `/performance-operations/payroll/${payroll.activeRuns[0].id}` : "/performance-operations/payroll",
      waivable: false,
    },
    payroll.activeRuns.length > 0,
    payroll.activeRuns.length > 0
      ? payroll.activeRuns
          .map((r) => `'${r.name}' is ${r.status.replaceAll("_", " ")}`)
          .join("; ") + "."
      : "No unfinished runs.",
    payroll.activeRuns[0]?.id ?? null,
  );
  push(
    {
      code: "payroll_not_stale",
      category: "payroll",
      severity: "blocking",
      definition:
        "The finalized payroll reflects the current ledger (no appointments imported after its cutoff).",
      source: "payroll_runs",
      action:
        "Reopen/supersede payroll and recalculate with a refreshed cutoff, or reverse the late import.",
      link: payroll.finalizedRun ? `/performance-operations/payroll/${payroll.finalizedRun.id}` : "/performance-operations/payroll",
      waivable: false,
    },
    payrollRequired && payroll.stale,
    payroll.stale
      ? "Active appointments in the period were imported after the payroll cutoff."
      : "Payroll cutoff covers all active appointments in the period.",
    payroll.finalizedRun?.id ?? null,
  );
  push(
    {
      code: "payroll_totals_reconcile",
      category: "payroll",
      severity: "blocking",
      definition: "The posted snapshot total reconciles with the payroll run total.",
      source: "payroll_snapshots",
      action: "Investigate the discrepancy before closing (contact support if it persists).",
      link: payroll.finalizedRun ? `/performance-operations/payroll/${payroll.finalizedRun.id}` : "/performance-operations/payroll",
      waivable: false,
    },
    payrollRequired &&
      payroll.finalizedRun !== null &&
      !payroll.finalizedRun.totalsReconcile,
    payroll.finalizedRun === null
      ? "Not evaluable without a finalized run."
      : payroll.finalizedRun.totalsReconcile
        ? `Snapshot v${payroll.finalizedRun.snapshotVersion ?? "?"} matches the run total.`
        : "Snapshot total does NOT match the run total.",
    payroll.finalizedRun?.id ?? null,
  );
  push(
    {
      code: "payroll_no_pending_adjustments",
      category: "payroll",
      severity: "blocking",
      definition: "No submitted payroll adjustments are awaiting a decision for this period.",
      source: "payroll_adjustments",
      action: "Approve, reject, or void the pending adjustments.",
      link: "/performance-operations/payroll/adjustments",
      waivable: false,
    },
    payroll.pendingAdjustments > 0,
    `${payroll.pendingAdjustments} pending adjustment(s).`,
  );
  push(
    {
      code: "payroll_no_pending_time",
      category: "payroll",
      severity: "blocking",
      definition: "No submitted manual time entries are awaiting a decision for this period.",
      source: "manual_time_entries",
      action: "Approve, reject, or void the pending time entries.",
      link: "/performance-operations/payroll/time",
      waivable: false,
    },
    payroll.pendingTimeEntries > 0,
    `${payroll.pendingTimeEntries} pending time entr(ies).`,
  );
  push(
    {
      code: "payroll_was_reopened",
      category: "payroll",
      severity: "warning",
      definition: "The finalized payroll run was never reopened.",
      source: "payroll_runs",
      action: "Confirm the reopen history is understood and acknowledge.",
      link: payroll.finalizedRun ? `/performance-operations/payroll/${payroll.finalizedRun.id}` : "/performance-operations/payroll",
      waivable: true,
    },
    payroll.finalizedRun !== null && payroll.finalizedRun.wasReopened,
    payroll.finalizedRun?.wasReopened
      ? "The payroll run was reopened at least once before its current posting."
      : "No reopen history.",
    payroll.finalizedRun?.id ?? null,
  );

  /* ------------------------------------------------------ configuration */
  const readinessById = new Map(
    inputs.configuration.readiness.map((r) => [r.metricId, r]),
  );
  const configCheck = (
    metricId: string,
    code: string,
    definition: string,
    action: string,
    link: string,
    severity: CheckSeverity,
  ) => {
    const metric = readinessById.get(metricId);
    // Missing information never passes.
    const fail =
      metric === undefined ||
      (metric.value !== null && metric.value < 10_000) ||
      (metric.value === null && metric.health !== "healthy");
    push(
      {
        code,
        category: "configuration",
        severity,
        definition,
        source: "intelligence:readiness",
        action,
        link,
        waivable: severity !== "blocking",
      },
      fail,
      metric === undefined
        ? "Readiness metric was not evaluated."
        : (metric.reason ?? `Engine value: ${metric.value ?? "n/a"} (${metric.health}).`),
    );
  };
  configCheck(
    "compensation_coverage_bp",
    "compensation_coverage",
    "Roster trainers carry active compensation assignments.",
    "Assign compensation plans, or acknowledge gaps that do not affect this period's posted payroll.",
    "/performance-operations/configuration/compensation",
    "warning",
  );
  configCheck(
    "trainer_assignment_coverage_bp",
    "trainer_assignment_coverage",
    "Roster trainers carry active department assignments.",
    "Assign departments, or acknowledge.",
    "/performance-operations/trainers",
    "warning",
  );
  configCheck(
    "service_alias_coverage_bp",
    "service_alias_coverage",
    "Active services have import aliases.",
    "Add aliases, or acknowledge.",
    "/performance-operations/configuration/services",
    "info",
  );
  configCheck(
    "reporting_period_coverage_bp",
    "reporting_period_coverage",
    "Reporting periods fully cover the close window.",
    "Fix period coverage, or acknowledge.",
    "/performance-operations/configuration/reporting-periods",
    "warning",
  );
  push(
    {
      code: "paid_amounts_available",
      category: "configuration",
      severity: "warning",
      definition: "The import source provided paid amounts for this period.",
      source: "intelligence:flags",
      action:
        "Acknowledge that paid-amount metrics are unavailable for this period (source limitation).",
      link: "/performance-operations/reports",
      waivable: true,
    },
    !inputs.configuration.paidAmountsPresent,
    inputs.configuration.paidAmountsPresent
      ? "Paid amounts present."
      : "The source did not provide paid amounts — paid-revenue metrics are incomplete.",
  );
  push(
    {
      code: "revenue_definitions_unapproved",
      category: "configuration",
      severity: "warning",
      definition:
        "Eligible/recognized revenue definitions are approved (they are not — reports mark them unavailable).",
      source: "intelligence:catalog",
      action:
        "Acknowledge that eligible/recognized revenue remain unavailable pending business definitions.",
      link: "/performance-operations/reports",
      waivable: true,
    },
    true, // permanently failing warning until the business approves definitions
    "Eligible and recognized revenue have no approved business definition; the close proceeds with source listed/paid facts only.",
  );

  /* ---------------------------------------------------------- reporting */
  const reporting = inputs.reporting;
  push(
    {
      code: "report_package_ready",
      category: "reporting",
      severity: "blocking",
      definition: "The executive report package for this period is generated and ready.",
      source: "report_packages",
      action: "Generate the executive package in the Reports step.",
      link: `/performance-operations/period-close/${inputs.closeRunId}/reports`,
      waivable: false,
    },
    reporting.executivePackage === null || reporting.executivePackage.status !== "ready",
    reporting.executivePackage === null
      ? "No executive package generated yet."
      : `Package v${reporting.executivePackage.version} is ${reporting.executivePackage.status}.`,
    reporting.executivePackage?.id ?? null,
  );
  for (const requiredType of REQUIRED_EXPORT_TYPES) {
    // The payroll register derives from a posted payroll run, which a
    // zero-activity period does not have (mirrors the close RPC's
    // conditional payroll requirement) — required only with activity.
    const applicable =
      requiredType !== "payroll_register_csv" || payrollRequired;
    push(
      {
        code: `export_${requiredType}`,
        category: "reporting",
        severity: "blocking",
        definition: `Required export '${requiredType}' is generated.`,
        source: "close_exports",
        action: "Generate the export in the Exports step.",
        link: `/performance-operations/period-close/${inputs.closeRunId}/exports`,
        waivable: false,
      },
      applicable && !reporting.exportTypesPresent.includes(requiredType),
      !applicable
        ? "Not required — the period has no active appointments (no payroll register exists without posted payroll)."
        : reporting.exportTypesPresent.includes(requiredType)
          ? "Export present."
          : "Export not generated yet.",
    );
  }
  push(
    {
      code: "package_regenerated",
      category: "reporting",
      severity: "warning",
      definition: "The report package was generated exactly once.",
      source: "report_packages",
      action: "Confirm the latest version is the intended one and acknowledge.",
      link: `/performance-operations/period-close/${inputs.closeRunId}/reports`,
      waivable: true,
    },
    (reporting.executivePackage?.version ?? 1) > 1,
    `Package version: ${reporting.executivePackage?.version ?? "n/a"}.`,
    reporting.executivePackage?.id ?? null,
  );

  return checks;
}

/* --------------------------------------------------------- summarizers */

export interface ChecklistSummary {
  blockingOpen: number;
  warningsOpen: number;
  warningsAcknowledged: number;
  infoOpen: number;
  warningCodes: string[];
  blockingCodes: string[];
  readyToClose: boolean;
}

export function summarizeChecks(checks: readonly CloseCheck[]): ChecklistSummary {
  const failing = checks.filter((c) => c.status === "fail");
  const blocking = failing.filter((c) => c.severity === "blocking");
  const warnings = failing.filter((c) => c.severity === "warning");
  const info = failing.filter((c) => c.severity === "info");
  const unacknowledged = warnings.filter((c) => !c.acknowledged);
  return {
    blockingOpen: blocking.length,
    warningsOpen: unacknowledged.length,
    warningsAcknowledged: warnings.length - unacknowledged.length,
    infoOpen: info.length,
    warningCodes: warnings.map((c) => c.code).sort(),
    blockingCodes: blocking.map((c) => c.code).sort(),
    readyToClose: blocking.length === 0 && unacknowledged.length === 0,
  };
}
