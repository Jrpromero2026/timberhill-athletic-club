/**
 * Integration alert derivation — PURE over pipeline states (connection
 * statuses, run outcomes, job states, delivery states). No business
 * metrics; these are operational conditions with deep links.
 */

export interface IntegrationAlert {
  id: string;
  code: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  link: string;
}

export interface IntegrationAlertInputs {
  connections: {
    id: string;
    name: string;
    status: string;
    lastHealthStatus: string | null;
  }[];
  recentRuns: { id: string; status: string; failureCode: string | null; connectionName: string }[];
  jobs: { status: string; jobType: string; id: string; attemptCount: number }[];
  deliveries: { id: string; status: string; recipientMasked: string }[];
  batchesAwaitingReview: { id: string; filename: string }[];
}

export function deriveIntegrationAlerts(
  inputs: IntegrationAlertInputs,
): IntegrationAlert[] {
  const alerts: IntegrationAlert[] = [];

  for (const connection of inputs.connections) {
    if (connection.status === "failed") {
      alerts.push({
        id: `connection_failed:${connection.id}`,
        code: "connection_validation_failed",
        severity: "critical",
        title: "Connection validation failed",
        detail: connection.name,
        link: `/performance-operations/configuration/integrations/${connection.id}`,
      });
    }
    if (connection.status === "revoked") {
      alerts.push({
        id: `credentials_revoked:${connection.id}`,
        code: "credentials_revoked",
        severity: "critical",
        title: "Credentials revoked",
        detail: `${connection.name} fails closed until new credentials are stored.`,
        link: `/performance-operations/configuration/integrations/${connection.id}`,
      });
    }
    if (connection.status === "degraded") {
      alerts.push({
        id: `connection_degraded:${connection.id}`,
        code:
          connection.lastHealthStatus === "schema_drift"
            ? "schema_drift_detected"
            : "provider_degraded",
        severity: "critical",
        title:
          connection.lastHealthStatus === "schema_drift"
            ? "Schema drift detected"
            : "Provider degraded",
        detail: connection.name,
        link: `/performance-operations/configuration/integrations/${connection.id}/health`,
      });
    }
  }

  for (const run of inputs.recentRuns) {
    if (run.status === "failed") {
      alerts.push({
        id: `sync_failed:${run.id}`,
        code: run.failureCode === "rate_limited" ? "provider_rate_limited" : "sync_failed",
        severity: run.failureCode === "rate_limited" ? "warning" : "critical",
        title: run.failureCode === "rate_limited" ? "Provider rate limited" : "Sync failed",
        detail: `${run.connectionName} · ${run.failureCode ?? "failure"}`,
        link: `/performance-operations/integrations/runs/${run.id}`,
      });
    }
  }

  const deadLetters = inputs.jobs.filter((j) => j.status === "dead_lettered");
  for (const job of deadLetters) {
    alerts.push({
      id: `dead_letter:${job.id}`,
      code: "dead_letter_job_created",
      severity: "critical",
      title: "Dead-letter job",
      detail: `${job.jobType} after ${job.attemptCount} attempt(s)`,
      link: "/performance-operations/integrations/jobs",
    });
  }
  const exhausted = inputs.jobs.filter(
    (j) => j.status === "permanently_failed" || (j.status === "retryable_failed" && j.attemptCount >= 3),
  );
  for (const job of exhausted) {
    alerts.push({
      id: `job_failed:${job.id}`,
      code:
        job.status === "permanently_failed"
          ? "job_permanently_failed"
          : "repeated_retry_threshold",
      severity: job.status === "permanently_failed" ? "critical" : "warning",
      title:
        job.status === "permanently_failed"
          ? "Job permanently failed"
          : "Job retrying repeatedly",
      detail: `${job.jobType} (attempt ${job.attemptCount})`,
      link: "/performance-operations/integrations/jobs",
    });
  }

  for (const delivery of inputs.deliveries) {
    if (["failed", "bounced", "rejected"].includes(delivery.status)) {
      alerts.push({
        id: `delivery_failed:${delivery.id}`,
        code: "report_delivery_failed",
        severity: "warning",
        title: "Report delivery failed",
        detail: `${delivery.recipientMasked} · ${delivery.status}`,
        link: "/performance-operations/integrations/deliveries",
      });
    }
  }

  for (const batch of inputs.batchesAwaitingReview) {
    alerts.push({
      id: `integration_batch_review:${batch.id}`,
      code: "import_batch_requires_review",
      severity: "info",
      title: "Integration import awaits review",
      detail: batch.filename,
      link: `/performance-operations/imports/${batch.id}`,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Mask an email for broad display: k***@domain. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${(local ?? "").slice(0, 1)}***@${domain}`;
}
