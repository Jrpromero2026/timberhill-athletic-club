/**
 * Scheduled-report execution — turns Phase 7 definitions into governed
 * artifact generation + delivery jobs.
 *
 * Controls: one execution per intended occurrence (DB unique on
 * definition+intended_run_at), authorization re-verified at execution
 * time, recipients re-resolved against current memberships,
 * closed-period reports reference FROZEN close artifacts (is_final),
 * active-period reports are explicitly labeled not final.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { actorCan, writeAudit } from "@/lib/actions/shared";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import { generateExecutivePackage, generatePayrollPackage } from "@/lib/close/packages";
import {
  ANALYTICS_REPORT_TYPES,
  generateAnalyticsSubscriptionArtifact,
} from "@/lib/analytics/exports/subscriptions";
import { buildMetricReportCsv } from "@/lib/reports/metric-report";
import { resolveRecipients } from "../delivery/recipients";
import { safeSubject } from "../delivery/email";
import { classifyFailure, IntegrationFailure } from "../shared/failures";
import type { Json, Tables } from "@/lib/supabase/types";

export interface ScheduledRunResult {
  ok: boolean;
  runId: string | null;
  status: "succeeded" | "failed" | "skipped" | "not_started";
  deliveriesQueued: number;
  message: string;
}

/** Normalize an intended occurrence to a stable minute-precision key. */
export function occurrenceKey(intendedRunAt: Date): string {
  const d = new Date(intendedRunAt);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/** Resolve the reporting period a definition targets. */
async function resolvePeriod(
  actor: ActorContext,
  definition: Tables<"scheduled_report_definitions">,
): Promise<{ id: string; label: string; start_date: string; end_date: string; status: string } | null> {
  if (definition.saved_view_id) {
    const { data: view } = await actor.supabase
      .from("saved_views")
      .select("config, organization_id, shared_scope, owner_id")
      .eq("id", definition.saved_view_id)
      .maybeSingle();
    // Inaccessible saved views (RLS-hidden or cross-org) fail safely below.
    const config = (view?.config ?? {}) as { reportingPeriodId?: string };
    if (view && config.reportingPeriodId) {
      const { data: period } = await actor.supabase
        .from("reporting_periods")
        .select("id, label, start_date, end_date, status")
        .eq("id", config.reportingPeriodId)
        .eq("organization_id", definition.organization_id)
        .maybeSingle();
      if (period) return period;
    }
    return null; // configured view unusable — do NOT silently substitute
  }
  // No view: most recent period that has started.
  const today = new Date().toISOString().slice(0, 10);
  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, start_date, end_date, status")
    .eq("organization_id", definition.organization_id)
    .lte("start_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return period ?? null;
}

export async function executeScheduledReport(
  actor: ActorContext,
  args: {
    definitionId: string;
    intendedRunAt: string;
    trigger: "schedule" | "manual";
    jobId?: string | null;
  },
): Promise<ScheduledRunResult> {
  const notStarted = (message: string): ScheduledRunResult => ({
    ok: false,
    runId: null,
    status: "not_started",
    deliveriesQueued: 0,
    message,
  });

  /* 1–2. Resolve + re-verify authorization at execution time. */
  const { data: definition } = await actor.supabase
    .from("scheduled_report_definitions")
    .select("*")
    .eq("id", args.definitionId)
    .maybeSingle();
  if (!definition) return notStarted("Definition not found.");
  if (!actorCan(actor, definition.organization_id, "scheduled_report:execute")) {
    return notStarted("Not authorized to execute scheduled reports.");
  }
  if (!definition.active) return notStarted("Definition is disabled.");
  if (!definition.execution_enabled && args.trigger === "schedule") {
    return notStarted("Execution is not enabled for this definition.");
  }

  /* 3. One execution per occurrence — DB-enforced. */
  const { data: run, error: runError } = await actor.supabase
    .from("scheduled_report_runs")
    .insert({
      definition_id: definition.id,
      organization_id: definition.organization_id,
      intended_run_at: args.intendedRunAt,
      trigger_source: args.trigger,
      status: "running",
      job_id: args.jobId ?? null,
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (runError) {
    if (runError.code === "23505") {
      return {
        ok: true,
        runId: null,
        status: "skipped",
        deliveriesQueued: 0,
        message: "This occurrence has already executed (duplicate suppressed).",
      };
    }
    return notStarted("Could not record the execution.");
  }

  const finish = async (patch: Record<string, unknown>) => {
    await actor.supabase
      .from("scheduled_report_runs")
      .update({ ...patch, completed_at: new Date().toISOString() })
      .eq("id", run.id);
  };

  try {
    await actor.supabase
      .from("scheduled_report_runs")
      .update({ started_at: new Date().toISOString() })
      .eq("id", run.id);

    /* 4. Resolve period; closed periods use frozen artifacts. */
    const period = await resolvePeriod(actor, definition);
    if (!period) {
      throw new IntegrationFailure(
        "permanent_configuration_failure",
        "No usable reporting period (the configured saved view is missing, inaccessible, or stale).",
      );
    }
    const isClosed = period.status === "closed";

    /* 5–7. Generate or reference the artifact; verify its hash. */
    let artifact: Record<string, unknown>;
    let artifactSha: string | null = null;
    let reportPackageId: string | null = null;

    if (definition.report_type === "quick_report") {
      const report = await buildMetricReportCsv(actor, definition.organization_id, period, {
        finalityNote: isClosed
          ? "FINAL — period is closed"
          : "NOT FINAL — the reporting period is still active; figures may change",
      });
      artifact = {
        kind: "metric_report_csv",
        file_name: report.fileName,
        sha256: report.sha256,
        metric_count: report.metricCount,
      };
      artifactSha = report.sha256;
    } else if (ANALYTICS_REPORT_TYPES.has(definition.report_type)) {
      // Phase 9 analytics subscriptions: versioned analytics packages on
      // the same infrastructure. These are compositions, not close
      // financial artifacts — they regenerate per occurrence and carry
      // the finality label instead of referencing frozen close packages.
      const result = await generateAnalyticsSubscriptionArtifact(
        actor,
        definition,
        period,
      );
      reportPackageId = result.id;
      const { data: pkg } = await actor.supabase
        .from("report_packages")
        .select("package_sha256")
        .eq("id", result.id)
        .maybeSingle();
      artifactSha = pkg?.package_sha256 ?? null;
      artifact = {
        kind: "analytics_package",
        report_type: definition.report_type,
        package_id: result.id,
        version: result.version,
        sha256: artifactSha,
        finality: isClosed
          ? "FINAL — period is closed"
          : "NOT FINAL — generated from an active period",
      };
    } else {
      const params = {
        organizationId: definition.organization_id,
        period: {
          id: period.id,
          label: period.label,
          start_date: period.start_date,
          end_date: period.end_date,
        },
      };
      if (isClosed) {
        // Frozen close artifact: reference the finalized package, never
        // regenerate financial artifacts for a closed period.
        const { data: frozen } = await actor.supabase
          .from("report_packages")
          .select("id, version, package_sha256, status")
          .eq("organization_id", definition.organization_id)
          .eq("reporting_period_id", period.id)
          .eq("package_type", definition.report_type === "payroll_package" ? "payroll" : "executive")
          .in("status", ["finalized"])
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (frozen) {
          reportPackageId = frozen.id;
          artifactSha = frozen.package_sha256;
          artifact = {
            kind: "frozen_close_package",
            package_id: frozen.id,
            version: frozen.version,
            sha256: frozen.package_sha256,
          };
        } else {
          throw new IntegrationFailure(
            "permanent_configuration_failure",
            "The period is closed but no finalized package exists to deliver.",
          );
        }
      } else {
        const result =
          definition.report_type === "payroll_package"
            ? await generatePayrollPackage(actor, params)
            : await generateExecutivePackage(actor, params);
        if ("error" in result) {
          throw new IntegrationFailure("permanent_configuration_failure", result.error);
        }
        if (result.status !== "ready") {
          throw new IntegrationFailure(
            "internal_transaction_failure",
            result.failureReason ?? "Package generation failed.",
          );
        }
        reportPackageId = result.id;
        const { data: pkg } = await actor.supabase
          .from("report_packages")
          .select("package_sha256")
          .eq("id", result.id)
          .maybeSingle();
        artifactSha = pkg?.package_sha256 ?? null;
        artifact = {
          kind: "report_package",
          package_id: result.id,
          version: result.version,
          sha256: artifactSha,
          finality: "NOT FINAL — generated from an active period",
        };
      }
    }

    /* 8. Resolve recipients NOW and create delivery jobs (idempotent). */
    const { data: channel } = await actor.supabase
      .from("delivery_channels")
      .select("*")
      .eq("organization_id", definition.organization_id)
      .eq("channel_type", "email")
      .maybeSingle();
    const requested = (definition.recipients as unknown as string[]) ?? [];
    const resolution = await resolveRecipients(
      actor,
      definition.organization_id,
      requested,
      channel,
    );

    let deliveriesQueued = 0;
    const canQueueDelivery = actorCan(
      actor,
      definition.organization_id,
      "report_delivery:manage",
    );
    if (resolution.recipients.length > 0 && channel && canQueueDelivery) {
      for (const recipient of resolution.recipients) {
        const idempotencyKey = `delivery:${run.id}:${recipient.email}`;
        const { error: eventError } = await actor.supabase
          .from("email_delivery_events")
          .insert({
            organization_id: definition.organization_id,
            channel_id: channel.id,
            scheduled_report_run_id: run.id,
            recipient_email: recipient.email,
            recipient_type: recipient.recipientType,
            recipient_profile_id: recipient.profileId,
            template_key: "scheduled_report",
            subject: safeSubject(
              definition.report_type.replaceAll("_", " "),
              period.label,
            ),
            artifact_type: String(artifact.kind),
            artifact_id: reportPackageId,
            artifact_sha256: artifactSha,
            idempotency_key: idempotencyKey,
          });
        if (eventError && eventError.code !== "23505") continue;
        if (!eventError) {
          await actor.supabase.rpc("enqueue_background_job", {
            p_organization_id: definition.organization_id,
            p_job_type: "report_email_delivery",
            p_payload: { delivery_idempotency_key: idempotencyKey } as unknown as Json,
            p_idempotency_key: `job:${idempotencyKey}`,
          });
          deliveriesQueued += 1;
        }
      }
    }

    /* 9–11. Record, bookkeep, notify. */
    await finish({
      status: "succeeded",
      report_package_id: reportPackageId,
      artifact: {
        ...artifact,
        recipients_resolved: resolution.recipients.length,
        recipients_skipped: resolution.skipped,
      } as unknown as Json,
      is_final: isClosed,
    });
    await actor.supabase
      .from("scheduled_report_definitions")
      .update({
        last_intended_run: args.intendedRunAt.slice(0, 10),
      })
      .eq("id", definition.id);
    await writeAudit(actor, {
      organizationId: definition.organization_id,
      entityType: "scheduled_report_run",
      entityId: run.id,
      action: "scheduled_report_executed",
      metadata: {
        report_type: definition.report_type,
        trigger: args.trigger,
        deliveries_queued: deliveriesQueued,
        is_final: isClosed,
      },
    });
    await notifyPermissionHolders(actor, definition.organization_id, "report_delivery:read", {
      category: "reporting",
      title: "Scheduled report executed",
      body: `${definition.report_type.replaceAll("_", " ")} for ${period.label}: ${deliveriesQueued} delivery job(s) queued.`,
      linkPath: "/performance-operations/reports?tab=scheduled",
      entityType: "scheduled_report_run",
      entityId: run.id,
    });

    return {
      ok: true,
      runId: run.id,
      status: "succeeded",
      deliveriesQueued,
      message: `Report generated (${isClosed ? "final — frozen close artifact" : "not final — active period"}); ${deliveriesQueued} delivery job(s) queued.`,
    };
  } catch (error) {
    const classified = classifyFailure(error);
    await finish({
      status: "failed",
      failure_code: classified.code,
      failure_message: classified.operatorMessage,
    });
    await notifyPermissionHolders(actor, definition.organization_id, "scheduled_report:execute", {
      category: "reporting",
      title: "Scheduled report failed",
      body: classified.operatorMessage,
      linkPath: "/performance-operations/reports?tab=scheduled",
      entityType: "scheduled_report_run",
      entityId: run.id,
    });
    return {
      ok: false,
      runId: run.id,
      status: "failed",
      deliveriesQueued: 0,
      message: classified.operatorMessage,
    };
  }
}

/**
 * Deliver one queued email event (invoked by the job runner). Reads the
 * event by idempotency key, resolves the channel provider, sends, and
 * records the honest outcome state.
 */
export async function deliverQueuedEmail(
  actor: ActorContext,
  deliveryIdempotencyKey: string,
): Promise<{ ok: boolean; state: string; message: string }> {
  const { data: event } = await actor.supabase
    .from("email_delivery_events")
    .select("*")
    .eq("idempotency_key", deliveryIdempotencyKey)
    .maybeSingle();
  if (!event) return { ok: false, state: "missing", message: "Delivery event not found." };
  if (!["pending", "deferred"].includes(event.status)) {
    return { ok: true, state: event.status, message: "Already processed (idempotent)." };
  }

  // Channel state is re-read at send time (policy may have changed since
  // queueing). An unconfigured/disabled channel finalizes the event as
  // failed BEFORE any sending state, so operators see an actionable
  // failure with a Retry path instead of a stuck "sending" row.
  const { data: channel } = await actor.supabase
    .from("delivery_channels")
    .select("*")
    .eq("organization_id", event.organization_id)
    .eq("channel_type", "email")
    .maybeSingle();

  const { resolveDeliveryProvider } = await import("../delivery/email");
  let provider;
  try {
    provider = resolveDeliveryProvider(channel);
  } catch (error) {
    await actor.supabase
      .from("email_delivery_events")
      .update({
        status: "failed",
        last_error: "delivery_not_configured",
        finalized_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    throw error;
  }

  await actor.supabase
    .from("email_delivery_events")
    .update({ status: "sending", attempt_count: event.attempt_count + 1 })
    .eq("id", event.id);

  const outcome = await provider.send({
    to: event.recipient_email,
    subject: event.subject,
    bodyText:
      "A scheduled report artifact is ready. Open Performance Operations to view it. " +
      "(Artifacts are not attached in test mode; no financial amounts are included in email.)",
    linkPath: "/performance-operations/reports?tab=scheduled",
    attachment: null,
  });

  await actor.supabase
    .from("email_delivery_events")
    .update({
      status: outcome.state,
      provider: provider.key,
      provider_message_id: outcome.providerMessageId,
      last_error: outcome.error,
      sent_at: outcome.accepted ? new Date().toISOString() : null,
      finalized_at: outcome.retryable ? null : new Date().toISOString(),
    })
    .eq("id", event.id);

  await writeAudit(actor, {
    organizationId: event.organization_id,
    entityType: "email_delivery_event",
    entityId: event.id,
    action: outcome.accepted ? "email_delivery_accepted" : "email_delivery_failed",
    metadata: { state: outcome.state, provider: provider.key },
  });

  if (!outcome.accepted && outcome.retryable) {
    throw new IntegrationFailure("recipient_failure", outcome.error ?? "Deferred by provider.");
  }
  return {
    ok: outcome.accepted,
    state: outcome.state,
    message: outcome.error ?? "Accepted by delivery provider (test mode).",
  };
}
