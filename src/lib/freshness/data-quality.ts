/**
 * Operational data-quality assessment.
 *
 * This is an OPERATIONS health panel, not an engineering dashboard: every
 * item is something a manager can act on, phrased as what is wrong and
 * what to do, with a count. Anything that only an engineer could act on
 * does not belong here.
 *
 * Pure: the caller gathers the counts, this decides severity and wording.
 */

import type { FreshnessReport } from "./model";

export type QualitySeverity = "ok" | "attention" | "blocking";

export interface QualityCheck {
  key: string;
  label: string;
  severity: QualitySeverity;
  /** The number the operator cares about (0 when clear). */
  count: number;
  detail: string;
  /** Where to go to fix it. */
  href: string | null;
}

export interface DataQualityCounts {
  /** Import rows whose trainer could not be matched or is ambiguous. */
  unresolvedTrainerMappings: number;
  /** Import rows whose client could not be matched or is ambiguous. */
  unresolvedClientMappings: number;
  /** Import rows whose service has no alias or name match. */
  unmatchedServices: number;
  /** Rows whose source status has no canonical mapping (land as `unknown`). */
  unknownStatuses: number;
  /** Posted appointments currently sitting at canonical status `unknown`. */
  unknownStatusAppointments: number;
  /** Open blocking issues across import batches. */
  openImportExceptions: number;
  /** Open payroll issues. */
  openPayrollExceptions: number;
  /** Trainers with an active organization assignment but no compensation plan. */
  trainersMissingCompensation: number;
  /** Integration connections in a failed/degraded state. */
  failedConnections: number;
}

function severityFor(count: number, blockingThreshold: number): QualitySeverity {
  if (count === 0) return "ok";
  return count >= blockingThreshold ? "blocking" : "attention";
}

export function assessDataQuality(
  counts: DataQualityCounts,
  freshness: FreshnessReport
): QualityCheck[] {
  const checks: QualityCheck[] = [];

  const setmore = freshness.sources.find((s) => s.key === "setmore");
  checks.push({
    key: "setmore_connection",
    label: "Setmore connection",
    severity:
      setmore?.state === "never_loaded"
        ? "blocking"
        : setmore?.ingest === "manual_snapshot"
          ? "attention"
          : "ok",
    count: counts.failedConnections,
    detail:
      setmore?.state === "never_loaded"
        ? "No appointment data has been loaded. Every production, revenue and utilization figure is unavailable until an import is posted."
        : setmore?.ingest === "manual_snapshot"
          ? "Appointments arrive by manual CSV import. Currency depends on someone uploading an export; there is no automated sync."
          : "Connected and syncing.",
    href: "/performance-operations/integrations",
  });

  checks.push({
    key: "setmore_data_through",
    label: "Setmore data through",
    severity:
      setmore?.state === "stale"
        ? "blocking"
        : setmore?.state === "aging" || setmore?.state === "never_loaded"
          ? "attention"
          : "ok",
    count: 0,
    detail: setmore?.summary ?? "Unknown.",
    href: "/performance-operations/imports",
  });

  const club = freshness.sources.find((s) => s.key === "gym_management_solutions");
  checks.push({
    key: "gms_snapshot",
    label: "Latest GMS snapshot",
    severity:
      club?.state === "never_loaded" || club?.state === "stale"
        ? "attention"
        : "ok",
    count: 0,
    detail: club?.summary ?? "Unknown.",
    href: "/performance-operations/snapshots",
  });

  checks.push({
    key: "trainer_mappings",
    label: "Unresolved trainer mappings",
    severity: severityFor(counts.unresolvedTrainerMappings, 1),
    count: counts.unresolvedTrainerMappings,
    detail:
      counts.unresolvedTrainerMappings > 0
        ? "Imported rows name a trainer this organization does not recognize. These rows cannot post, so the affected sessions are missing from every trainer's production."
        : "Every imported trainer name resolves.",
    href: "/performance-operations/imports",
  });

  checks.push({
    key: "client_mappings",
    label: "Unresolved client mappings",
    severity: severityFor(counts.unresolvedClientMappings, 25),
    count: counts.unresolvedClientMappings,
    detail:
      counts.unresolvedClientMappings > 0
        ? "Imported rows reference a client that could not be matched. Sessions still post, but client counts and retention will understate reality."
        : "Every imported client resolves.",
    href: "/performance-operations/imports",
  });

  checks.push({
    key: "unmatched_services",
    label: "Unmatched services",
    severity: severityFor(counts.unmatchedServices, 1),
    count: counts.unmatchedServices,
    detail:
      counts.unmatchedServices > 0
        ? "Imported rows name a service with no alias. These rows cannot post; map the name to a service (saving an alias fixes it permanently)."
        : "Every imported service name maps to a catalogued service.",
    href: "/performance-operations/configuration/services",
  });

  const unknownTotal = counts.unknownStatuses + counts.unknownStatusAppointments;
  checks.push({
    key: "unknown_statuses",
    label: "Unknown appointment statuses",
    severity: severityFor(unknownTotal, 1),
    count: unknownTotal,
    detail:
      unknownTotal > 0
        ? "Appointments whose source status has no canonical mapping sit at `unknown`. They are excluded from completed counts and from every revenue figure — deliberately, since an unknown status is not evidence of delivered work."
        : "Every source status maps to a canonical status.",
    href: "/performance-operations/appointments",
  });

  checks.push({
    key: "import_exceptions",
    label: "Open import exceptions",
    severity: severityFor(counts.openImportExceptions, 1),
    count: counts.openImportExceptions,
    detail:
      counts.openImportExceptions > 0
        ? "Blocking issues are holding rows out of the ledger. Nothing in the affected batches counts until they are resolved."
        : "No blocking import issues.",
    href: "/performance-operations/imports",
  });

  checks.push({
    key: "payroll_exceptions",
    label: "Open payroll exceptions",
    severity: severityFor(counts.openPayrollExceptions, 1),
    count: counts.openPayrollExceptions,
    detail:
      counts.openPayrollExceptions > 0
        ? "Payroll issues are open. A run with unresolved issues must not be approved."
        : "No open payroll issues.",
    href: "/performance-operations/payroll",
  });

  checks.push({
    key: "missing_compensation",
    label: "Trainers without compensation",
    severity: severityFor(counts.trainersMissingCompensation, 1),
    count: counts.trainersMissingCompensation,
    detail:
      counts.trainersMissingCompensation > 0
        ? "These trainers have no compensation plan assignment, so payroll cannot be calculated for them at all."
        : "Every active trainer has a compensation assignment.",
    href: "/performance-operations/configuration/compensation",
  });

  return checks;
}

/** The panel's one-line verdict, for a header or a report preamble. */
export function summarizeDataQuality(checks: QualityCheck[]): {
  severity: QualitySeverity;
  message: string;
} {
  const blocking = checks.filter((c) => c.severity === "blocking");
  if (blocking.length > 0) {
    return {
      severity: "blocking",
      message: `${blocking.length} issue(s) are keeping data out of reports: ${blocking
        .map((c) => c.label.toLowerCase())
        .join(", ")}.`,
    };
  }
  const attention = checks.filter((c) => c.severity === "attention");
  if (attention.length > 0) {
    return {
      severity: "attention",
      message: `${attention.length} item(s) need attention: ${attention
        .map((c) => c.label.toLowerCase())
        .join(", ")}.`,
    };
  }
  return { severity: "ok", message: "All operational data checks are clear." };
}
