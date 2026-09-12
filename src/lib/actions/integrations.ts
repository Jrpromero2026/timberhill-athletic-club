"use server";

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "@/lib/actions/shared";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import { getProviderAdapter } from "@/lib/integrations/registry";
import { explainSecretResolutionFailure } from "@/lib/integrations/shared/credential-errors";
import { runSync } from "@/lib/integrations/sync/engine";
import {
  executeScheduledReport,
  deliverQueuedEmail,
} from "@/lib/integrations/reports/execute";
import type { Json } from "@/lib/supabase/types";

const INTEGRATIONS_PATH = "/performance-operations/configuration/integrations";

function revalidateIntegrations(connectionId?: string): void {
  revalidatePath(INTEGRATIONS_PATH);
  revalidatePath("/performance-operations/integrations");
  if (connectionId) revalidatePath(`${INTEGRATIONS_PATH}/${connectionId}`);
}

/* -------------------------------------------------------- connections */

export async function createConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const providerKey = String(formData.get("provider_key") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!actorCan(actor, organizationId, "integration:create")) return PERMISSION_DENIED;
  if (name.length < 3 || name.length > 60) {
    return { error: "Connection name must be 3–60 characters." };
  }
  const adapter = getProviderAdapter(providerKey);
  if (!adapter) return { error: "Unknown provider." };

  const { data: created, error } = await actor.supabase
    .from("integration_connections")
    .insert({
      organization_id: organizationId,
      provider_key: providerKey,
      name,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return {
      error:
        error?.code === "23505"
          ? "A connection with this name already exists for this provider."
          : "Could not create the connection.",
    };
  }
  await writeAudit(actor, {
    organizationId,
    entityType: "integration_connection",
    entityId: created.id,
    action: "integration_connection_created",
    metadata: { provider_key: providerKey, name },
  });
  revalidateIntegrations(created.id);
  return { message: "Connection created (draft).", data: { connectionId: created.id } };
}

export async function submitCredentials(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const connectionId = String(formData.get("connection_id") ?? "");
  const secret = String(formData.get("secret") ?? "");
  // Permission + state checks and auditing happen inside the definer RPC;
  // the secret goes straight to Vault and is never echoed back.
  const { data, error } = await actor.supabase.rpc("store_connection_secret", {
    p_connection_id: connectionId,
    p_secret: secret,
  });
  if (error) {
    const friendly: Record<string, string> = {
      secret_too_short: "The credential must be at least 8 characters.",
      not_authorized_to_manage_credentials: "You are not authorized to manage credentials.",
      connection_not_awaiting_credentials:
        "This connection is not in a state that accepts new credentials.",
    };
    return { error: friendly[error.message] ?? "Could not store the credential." };
  }
  const result = data as { fingerprint?: string } | null;
  revalidateIntegrations(connectionId);
  return {
    message: `Credential stored securely (fingerprint ${result?.fingerprint ?? "recorded"}). It will not be shown again.`,
  };
}

export async function revokeCredentials(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const connectionId = String(formData.get("connection_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const { error } = await actor.supabase.rpc("revoke_connection_secret", {
    p_connection_id: connectionId,
    p_reason: reason,
  });
  if (error) {
    return {
      error:
        error.message === "revoke_reason_required"
          ? "A reason (at least 5 characters) is required."
          : "Could not revoke the credential.",
    };
  }
  revalidateIntegrations(connectionId);
  return { message: "Credential revoked. The connection now fails closed." };
}

export async function validateConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const connectionId = String(formData.get("connection_id") ?? "");
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return { error: "Connection not found." };
  if (!actorCan(actor, connection.organization_id, "integration:update")) {
    return PERMISSION_DENIED;
  }
  const adapter = getProviderAdapter(connection.provider_key);
  if (!adapter) return { error: "Unknown provider." };
  if (!["awaiting_credentials", "failed", "disabled", "active", "degraded"].includes(connection.status)) {
    return { error: `A ${connection.status} connection cannot be validated.` };
  }

  await actor.supabase
    .from("integration_connections")
    .update({ status: "validating" })
    .eq("id", connectionId);

  // Resolve the credential SERVER-SIDE (never sent to the browser).
  //
  // A resolution failure is reported as itself rather than swallowed:
  // passing `secret = null` onward makes an infrastructure problem
  // (missing/mismatched worker key) look like a provider rejecting the
  // credential, which sends the operator to rotate a token that was
  // never the problem.
  let secret: string | null = null;
  if (process.env.WORKER_SECRET && connection.secret_ref) {
    const { data, error: secretError } = await actor.supabase.rpc(
      "get_connection_secret_with_key",
      {
        p_connection_id: connectionId,
        p_server_key: process.env.WORKER_SECRET,
      },
    );
    if (secretError) {
      await actor.supabase
        .from("integration_connections")
        .update({ status: "failed", last_health_status: "worker_key_unavailable" })
        .eq("id", connectionId);
      return { error: explainSecretResolutionFailure(secretError.message) };
    }
    secret = (data as string | null) ?? null;
  }

  const validation = await adapter.validateConnection({
    connectionId,
    organizationId: connection.organization_id,
    window: { startDate: "1970-01-01", endDate: "1970-01-01" },
    cursor: null,
    secret,
    config: (connection.capabilities as Record<string, unknown>) ?? {},
    pageLimit: 1,
  });

  await actor.supabase
    .from("integration_connections")
    .update(
      validation.ok
        ? {
            status: "active",
            capabilities: (validation.capabilities ?? {}) as unknown as Json,
            last_health_check_at: new Date().toISOString(),
            last_health_status: "ok",
            failure_reason: null,
          }
        : {
            status: "failed",
            last_health_check_at: new Date().toISOString(),
            last_health_status: validation.failureCode ?? "validation_failed",
            failure_reason: validation.message.slice(0, 300),
          },
    )
    .eq("id", connectionId);

  await writeAudit(actor, {
    organizationId: connection.organization_id,
    entityType: "integration_connection",
    entityId: connectionId,
    action: validation.ok
      ? "integration_connection_activated"
      : "integration_connection_validation_failed",
    metadata: { outcome: validation.ok ? "active" : (validation.failureCode ?? "failed") },
  });
  if (!validation.ok) {
    await notifyPermissionHolders(actor, connection.organization_id, "integration:read", {
      category: "system",
      title: "Connection validation failed",
      body: `${connection.name}: ${validation.message}`,
      linkPath: `${INTEGRATIONS_PATH}/${connectionId}`,
      entityType: "integration_connection",
      entityId: connectionId,
    });
  }
  revalidateIntegrations(connectionId);
  return validation.ok
    ? { message: "Connection validated and ACTIVE." }
    : { error: validation.message };
}

export async function setConnectionEnabled(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const connectionId = String(formData.get("connection_id") ?? "");
  const enable = formData.get("enable") === "true";
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, organization_id, status, name")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return { error: "Connection not found." };
  if (!actorCan(actor, connection.organization_id, "integration:disable")) {
    return PERMISSION_DENIED;
  }
  if (!enable) {
    const { error } = await actor.supabase
      .from("integration_connections")
      .update({ status: "disabled" })
      .eq("id", connectionId);
    if (error) return { error: "This connection cannot be disabled from its current state." };
  } else {
    // Re-enable goes back through validation — never straight to active.
    const { error } = await actor.supabase
      .from("integration_connections")
      .update({ status: "awaiting_credentials" })
      .eq("id", connectionId);
    if (error) return { error: "This connection cannot be re-enabled from its current state." };
  }
  await writeAudit(actor, {
    organizationId: connection.organization_id,
    entityType: "integration_connection",
    entityId: connectionId,
    action: enable ? "integration_connection_reenabled" : "integration_connection_disabled",
  });
  revalidateIntegrations(connectionId);
  return {
    message: enable
      ? "Connection re-enabled — submit/confirm credentials and validate."
      : "Connection disabled. Its jobs will not execute.",
  };
}

/* --------------------------------------------------- sync definitions */

export async function createSyncDefinition(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const connectionId = String(formData.get("connection_id") ?? "");
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("id, organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return { error: "Connection not found." };
  if (!actorCan(actor, connection.organization_id, "integration:update")) {
    return PERMISSION_DENIED;
  }
  const windowStrategy = String(formData.get("window_strategy") ?? "trailing_days");
  const mode = String(formData.get("mode") ?? "incremental");
  const frequency = String(formData.get("frequency") ?? "manual");
  const windowStart = String(formData.get("window_start") ?? "") || null;
  const windowEnd = String(formData.get("window_end") ?? "") || null;
  const windowDaysRaw = Number(formData.get("window_days") ?? 30);
  if (windowStrategy === "fixed_range" && (!windowStart || !windowEnd)) {
    return { error: "A fixed range needs both start and end dates." };
  }

  const { data: created, error } = await actor.supabase
    .from("integration_sync_definitions")
    .insert({
      connection_id: connectionId,
      organization_id: connection.organization_id,
      data_type: "appointments",
      window_strategy: windowStrategy,
      window_days:
        Number.isInteger(windowDaysRaw) && windowDaysRaw >= 1 && windowDaysRaw <= 366
          ? windowDaysRaw
          : 30,
      window_start: windowStart,
      window_end: windowEnd,
      mode,
      frequency,
      owner_id: actor.userId,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "Could not create the sync definition." };
  await writeAudit(actor, {
    organizationId: connection.organization_id,
    entityType: "integration_sync_definition",
    entityId: created.id,
    action: "integration_sync_definition_created",
    metadata: { window_strategy: windowStrategy, mode, frequency },
  });
  revalidateIntegrations(connectionId);
  return { message: "Sync definition created. Auto-approve and auto-post remain OFF by design." };
}

export async function toggleSyncDefinition(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const definitionId = String(formData.get("definition_id") ?? "");
  const active = formData.get("active") === "true";
  const { data: definition } = await actor.supabase
    .from("integration_sync_definitions")
    .select("id, organization_id, connection_id")
    .eq("id", definitionId)
    .maybeSingle();
  if (!definition) return { error: "Definition not found." };
  if (!actorCan(actor, definition.organization_id, "integration:update")) {
    return PERMISSION_DENIED;
  }
  await actor.supabase
    .from("integration_sync_definitions")
    .update({ active: !active })
    .eq("id", definitionId);
  await writeAudit(actor, {
    organizationId: definition.organization_id,
    entityType: "integration_sync_definition",
    entityId: definitionId,
    action: active ? "integration_sync_paused" : "integration_sync_resumed",
  });
  revalidateIntegrations(definition.connection_id);
  return { message: active ? "Sync paused." : "Sync resumed." };
}

export async function runSyncNow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const definitionId = String(formData.get("definition_id") ?? "");
  const result = await runSync(actor, { definitionId, trigger: "manual" });
  revalidateIntegrations();
  if (result.runId) revalidatePath(`/performance-operations/integrations/runs/${result.runId}`);
  return result.ok
    ? {
        message: result.message,
        data: {
          runId: result.runId ?? "",
          importBatchId: result.importBatchId ?? "",
        },
      }
    : { error: result.message, data: result.runId ? { runId: result.runId } : undefined };
}

export async function resetCursor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const definitionId = String(formData.get("definition_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) {
    return { error: "Cursor resets require a reason of at least 10 characters." };
  }
  const { data: definition } = await actor.supabase
    .from("integration_sync_definitions")
    .select("id, organization_id, connection_id, data_type")
    .eq("id", definitionId)
    .maybeSingle();
  if (!definition) return { error: "Definition not found." };
  // Elevated permission: platform admin only per role matrix.
  if (!actorCan(actor, definition.organization_id, "integration:reset_cursor")) {
    return PERMISSION_DENIED;
  }
  const { data: cursor } = await actor.supabase
    .from("integration_cursors")
    .select("*")
    .eq("definition_id", definitionId)
    .eq("data_type", definition.data_type)
    .maybeSingle();
  if (!cursor || cursor.cursor_value === null) {
    return { error: "No cursor to reset — the next sync already starts from the beginning." };
  }
  await actor.supabase
    .from("integration_cursors")
    .update({
      previous_value: cursor.cursor_value,
      cursor_value: null,
      advanced_at: null,
      reset_by: actor.userId,
      reset_reason: reason,
    })
    .eq("id", cursor.id);
  await writeAudit(actor, {
    organizationId: definition.organization_id,
    entityType: "integration_cursor",
    entityId: cursor.id,
    action: "integration_cursor_reset",
    metadata: { previous_cursor: cursor.cursor_value, reason },
  });
  revalidateIntegrations(definition.connection_id);
  return {
    message:
      "Cursor reset. The next sync re-fetches from the start of the window; already-stored records deduplicate by content hash.",
  };
}

/**
 * Discard a staged INTEGRATION batch that will not be posted (operator
 * disposal — the U9g gap). Only unposted, unapproved integration batches
 * qualify; the batch transitions to failed with an explicit code, its
 * evidence (file + rows + source records) is preserved, and the action
 * is audited. Manual batches keep their existing workflows.
 */
export async function discardIntegrationBatch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const batchId = String(formData.get("batch_id") ?? "");
  const { data: batch } = await actor.supabase
    .from("import_batches")
    .select("id, organization_id, status, created_via, original_filename")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:manage")) return PERMISSION_DENIED;
  if (batch.created_via !== "integration") {
    return { error: "Only integration-created batches can be discarded here." };
  }
  if (!["uploaded", "validating", "needs_review", "ready_for_approval"].includes(batch.status)) {
    return { error: `A ${batch.status} batch cannot be discarded.` };
  }
  const { transition } = await import("@/lib/imports/pipeline");
  // ready_for_approval must step back before failing (state machine).
  if (batch.status === "ready_for_approval") {
    await transition(actor, batch.id, batch.organization_id, "needs_review");
  }
  if (batch.status === "uploaded") {
    await transition(actor, batch.id, batch.organization_id, "parsing");
    await transition(actor, batch.id, batch.organization_id, "failed", "discarded_by_operator");
  } else {
    await transition(actor, batch.id, batch.organization_id, "failed", "discarded_by_operator");
  }
  await actor.supabase
    .from("import_batches")
    .update({
      failure_code: "discarded_by_operator",
      sanitized_failure_message:
        "Discarded by an operator before approval. Evidence is preserved; nothing was posted.",
    })
    .eq("id", batch.id);
  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: "integration_batch_discarded",
    metadata: { filename: batch.original_filename, prior_status: batch.status },
  });
  revalidatePath("/performance-operations/imports");
  revalidateIntegrations();
  return { message: "Batch discarded (evidence preserved; nothing was posted)." };
}

/* ---------------------------------------------------------- job admin */

async function jobAction(
  rpc: "retry_background_job" | "cancel_background_job" | "dead_letter_background_job" | "requeue_dead_letter_job",
  formData: FormData,
  needsReason: boolean,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const jobId = String(formData.get("job_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const args: Record<string, string> = { p_job_id: jobId };
  if (needsReason || reason) args.p_reason = reason;
  const { error } = await actor.supabase.rpc(rpc, args as never);
  if (error) {
    const friendly: Record<string, string> = {
      job_not_retryable_state: "Only failed jobs can be retried.",
      job_not_cancellable: "Only queued or retry-waiting jobs can be cancelled.",
      job_not_permanently_failed: "Only permanently failed jobs can be dead-lettered.",
      job_not_dead_lettered: "Only dead-letter jobs can be requeued.",
      requeue_reason_required: "A reason (at least 5 characters) is required.",
    };
    return { error: friendly[error.message] ?? "The job action was rejected." };
  }
  revalidatePath("/performance-operations/integrations/jobs");
  revalidatePath("/performance-operations/integrations");
  return { message: "Done." };
}

export async function retryJob(_p: ActionState, f: FormData): Promise<ActionState> {
  return jobAction("retry_background_job", f, false);
}
export async function cancelJob(_p: ActionState, f: FormData): Promise<ActionState> {
  return jobAction("cancel_background_job", f, false);
}
export async function deadLetterJob(_p: ActionState, f: FormData): Promise<ActionState> {
  return jobAction("dead_letter_background_job", f, false);
}
export async function requeueDeadLetterJob(_p: ActionState, f: FormData): Promise<ActionState> {
  return jobAction("requeue_dead_letter_job", f, true);
}

/* ---------------------------------------------------------- delivery */

export async function configureDeliveryChannel(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const provider = String(formData.get("provider") ?? "none_configured");
  const senderAddress = String(formData.get("sender_address") ?? "").trim() || null;
  const allowExternal = formData.get("allow_external_recipients") === "on";
  const allowStatements = formData.get("allow_trainer_statements") === "on";
  if (!actorCan(actor, organizationId, "email_policy:manage")) return PERMISSION_DENIED;
  if (!["none_configured", "test"].includes(provider)) {
    return {
      error:
        "Only the TEST provider can be configured in this phase — a real email provider is an unresolved business decision (see DECISION_LOG).",
    };
  }
  const { error } = await actor.supabase.from("delivery_channels").upsert(
    {
      organization_id: organizationId,
      channel_type: "email",
      provider,
      status: provider === "test" ? "test_mode" : "unconfigured",
      sender_address: senderAddress,
      allow_external_recipients: allowExternal,
      allow_trainer_statements: allowStatements,
      updated_by: actor.userId,
    },
    { onConflict: "organization_id,channel_type" },
  );
  if (error) return { error: "Could not save the delivery channel." };
  await writeAudit(actor, {
    organizationId,
    entityType: "delivery_channel",
    entityId: organizationId,
    action: "delivery_channel_configured",
    metadata: {
      provider,
      allow_external_recipients: allowExternal,
      allow_trainer_statements: allowStatements,
    },
  });
  revalidatePath("/performance-operations/integrations/deliveries");
  revalidatePath("/performance-operations/reports");
  return {
    message:
      provider === "test"
        ? "Delivery channel set to TEST MODE — sends are recorded, no real email leaves the system."
        : "Delivery channel unconfigured — deliveries fail closed.",
  };
}

export async function toggleReportExecution(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const definitionId = String(formData.get("definition_id") ?? "");
  const enable = formData.get("enable") === "true";
  const { data: definition } = await actor.supabase
    .from("scheduled_report_definitions")
    .select("id, organization_id")
    .eq("id", definitionId)
    .maybeSingle();
  if (!definition) return { error: "Definition not found." };
  if (!actorCan(actor, definition.organization_id, "scheduled_report:execute")) {
    return PERMISSION_DENIED;
  }
  const { error } = await actor.supabase
    .from("scheduled_report_definitions")
    .update({ execution_enabled: enable })
    .eq("id", definitionId);
  if (error) return { error: "Could not update execution." };
  await writeAudit(actor, {
    organizationId: definition.organization_id,
    entityType: "scheduled_report_definition",
    entityId: definitionId,
    action: enable ? "scheduled_report_execution_enabled" : "scheduled_report_execution_disabled",
  });
  revalidatePath("/performance-operations/reports");
  return {
    message: enable
      ? "Execution enabled — the worker will run this schedule when due."
      : "Execution disabled.",
  };
}

export async function runReportNow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const definitionId = String(formData.get("definition_id") ?? "");
  const result = await executeScheduledReport(actor, {
    definitionId,
    intendedRunAt: new Date().toISOString(),
    trigger: "manual",
  });
  revalidatePath("/performance-operations/reports");
  revalidatePath("/performance-operations/integrations/deliveries");
  return result.ok ? { message: result.message } : { error: result.message };
}

export async function retryDelivery(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const eventId = String(formData.get("event_id") ?? "");
  const { data: event } = await actor.supabase
    .from("email_delivery_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "Delivery event not found." };
  if (!actorCan(actor, event.organization_id, "report_delivery:retry")) {
    return PERMISSION_DENIED;
  }
  if (!["failed", "bounced", "rejected", "deferred"].includes(event.status)) {
    return { error: "Only failed deliveries can be retried." };
  }
  // Finalized events are immutable — a retry is a NEW delivery event.
  const retryKey = `retry:${event.id}:${event.attempt_count + 1}`;
  const { error: insertError } = await actor.supabase.from("email_delivery_events").insert({
    organization_id: event.organization_id,
    channel_id: event.channel_id,
    scheduled_report_run_id: event.scheduled_report_run_id,
    recipient_email: event.recipient_email,
    recipient_type: event.recipient_type,
    recipient_profile_id: event.recipient_profile_id,
    template_key: event.template_key,
    subject: event.subject,
    artifact_type: event.artifact_type,
    artifact_id: event.artifact_id,
    artifact_sha256: event.artifact_sha256,
    idempotency_key: retryKey,
  });
  if (insertError && insertError.code !== "23505") {
    return { error: "Could not create the retry delivery." };
  }
  const result = await deliverQueuedEmail(actor, retryKey).catch((e: unknown) => ({
    ok: false,
    state: "failed",
    message: e instanceof Error ? e.message : "Retry failed.",
  }));
  await writeAudit(actor, {
    organizationId: event.organization_id,
    entityType: "email_delivery_event",
    entityId: eventId,
    action: "email_delivery_manually_retried",
    metadata: { retry_key: retryKey, outcome: result.state },
  });
  revalidatePath("/performance-operations/integrations/deliveries");
  return result.ok
    ? { message: `Retry ${result.state}.` }
    : { error: `Retry ${result.state}: ${result.message}` };
}
