/**
 * Sync engine — executes one synchronization run end-to-end:
 *
 *   validate connection → resolve capabilities → acquire execution lock
 *   → load cursor → fetch bounded pages (respecting rate limits)
 *   → preserve raw source records (immutable, content-addressed)
 *   → detect schema drift (fail closed, degrade connection)
 *   → build a deterministic evidence CSV → upload to the imports bucket
 *   → create an import batch (created_via='integration')
 *   → stage + match through the EXISTING Phase 3 pipeline
 *   → advance the cursor ONLY after durable persistence
 *   → record statistics → notify → release the lock.
 *
 * The engine NEVER writes to canonical appointments: posting still
 * requires the human review/approval workflow (auto-approve/auto-post
 * are CHECK-constrained off at the database).
 */

import { randomUUID } from "node:crypto";
import type { ActorContext } from "@/lib/actions/shared";
import { actorCan, writeAudit } from "@/lib/actions/shared";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import { escapeCsvCell, parseCsv } from "@/lib/imports/csv";
import { sha256Hex, stageBatch, runMatching } from "@/lib/imports/pipeline";
import { stableStringify } from "@/lib/close/manifest";
import type { Json, Tables } from "@/lib/supabase/types";
import { getProviderAdapter } from "../registry";
import { classifyFailure, IntegrationFailure } from "../shared/failures";
import {
  applyObservation,
  initialRateLimitState,
  pauseSeconds,
  type RateLimitState,
} from "../shared/rate-limit";
import { detectDrift, summarizeDrift, type DriftReport } from "../shared/drift";
import { TEST_EXPECTED_FIELDS } from "../providers/test-provider";
import type {
  FetchContext,
  FetchWindow,
  ProviderRecord,
} from "../shared/contract";

const BUCKET = "performance-operations-imports";
const MAX_PAGES_PER_RUN = 20;
const MAX_INLINE_PAUSE_SECONDS = 3;

export interface SyncRunResult {
  ok: boolean;
  runId: string | null;
  status: "succeeded" | "partial" | "failed" | "not_started";
  importBatchId: string | null;
  recordsFetched: number;
  recordsAccepted: number;
  recordsUnchanged: number;
  failureCode: string | null;
  message: string;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** Resolve the requested date window from the definition strategy. */
export function resolveWindow(
  definition: Pick<
    Tables<"integration_sync_definitions">,
    "window_strategy" | "window_days" | "window_start" | "window_end"
  >,
  today: string,
): FetchWindow {
  if (definition.window_strategy === "fixed_range") {
    return {
      startDate: definition.window_start ?? today,
      endDate: definition.window_end ?? today,
    };
  }
  // trailing_days (and since_cursor's fallback bound): [today - N, today]
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end.getTime() - definition.window_days * 86_400_000);
  return { startDate: start.toISOString().slice(0, 10), endDate: today };
}

/** Server-side credential resolution (never reaches a browser). */
async function resolveSecret(
  actor: ActorContext,
  connectionId: string,
): Promise<string | null> {
  const workerKey = process.env.WORKER_SECRET;
  if (!workerKey) return null;
  const { data, error } = await actor.supabase.rpc("get_connection_secret_with_key", {
    p_connection_id: connectionId,
    p_server_key: workerKey,
  });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function runSync(
  actor: ActorContext,
  args: {
    definitionId: string;
    trigger: "manual" | "schedule" | "webhook" | "retry";
    jobId?: string | null;
  },
): Promise<SyncRunResult> {
  const notStarted = (message: string, failureCode: string): SyncRunResult => ({
    ok: false,
    runId: null,
    status: "not_started",
    importBatchId: null,
    recordsFetched: 0,
    recordsAccepted: 0,
    recordsUnchanged: 0,
    failureCode,
    message,
  });

  /* 1–2. Load definition + connection; validate authorization. */
  const { data: definition } = await actor.supabase
    .from("integration_sync_definitions")
    .select("*")
    .eq("id", args.definitionId)
    .maybeSingle();
  if (!definition) return notStarted("Sync definition not found.", "permanent_configuration_failure");
  if (!actorCan(actor, definition.organization_id, "integration:sync")) {
    return notStarted("Not authorized to run synchronization.", "authorization_failed");
  }
  if (!definition.active && args.trigger !== "manual") {
    return notStarted("Sync definition is paused.", "permanent_configuration_failure");
  }
  const { data: connection } = await actor.supabase
    .from("integration_connections")
    .select("*")
    .eq("id", definition.connection_id)
    .maybeSingle();
  if (!connection) return notStarted("Connection not found.", "permanent_configuration_failure");
  if (!["active", "degraded"].includes(connection.status)) {
    return notStarted(
      `Connection is ${connection.status} — validate/activate it before syncing.`,
      "permanent_configuration_failure",
    );
  }
  const adapter = getProviderAdapter(connection.provider_key);
  if (!adapter) return notStarted("Unknown provider.", "permanent_configuration_failure");
  if (adapter.status === "blocked") {
    return notStarted(
      `Provider '${adapter.displayName}' is blocked: ${adapter.blockedReasons[0]}`,
      "provider_blocked",
    );
  }
  const capabilities = adapter.getCapabilities();
  if (!capabilities.appointmentsByDate || !adapter.fetchAppointments) {
    return notStarted("Provider does not support appointment sync.", "permanent_configuration_failure");
  }

  /* 3. Execution lock: one running sync per connection. */
  const { data: runningRuns } = await actor.supabase
    .from("integration_sync_runs")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("status", "running")
    .limit(1);
  if ((runningRuns ?? []).length > 0) {
    return notStarted("A sync is already running for this connection.", "permanent_configuration_failure");
  }

  /* 4. Load the last safe cursor. */
  const { data: cursorRow } = await actor.supabase
    .from("integration_cursors")
    .select("*")
    .eq("definition_id", definition.id)
    .eq("data_type", definition.data_type)
    .maybeSingle();
  const cursorBefore =
    definition.mode === "incremental" ? (cursorRow?.cursor_value ?? null) : null;

  const today = new Date().toISOString().slice(0, 10);
  const window = resolveWindow(definition, today);

  const { data: runRow, error: runError } = await actor.supabase
    .from("integration_sync_runs")
    .insert({
      connection_id: connection.id,
      organization_id: definition.organization_id,
      definition_id: definition.id,
      trigger_source: args.trigger,
      cursor_before: cursorBefore,
      requested_window: window as unknown as Json,
      job_id: args.jobId ?? null,
    })
    .select("*")
    .single();
  if (runError || !runRow) {
    return notStarted("Could not create the sync run.", "internal_transaction_failure");
  }

  const finishRun = async (patch: Record<string, unknown>) => {
    await actor.supabase
      .from("integration_sync_runs")
      .update({ ...patch, completed_at: new Date().toISOString() })
      .eq("id", runRow.id);
  };

  const failRun = async (error: unknown): Promise<SyncRunResult> => {
    const classified = classifyFailure(error);
    await finishRun({
      status: "failed",
      failure_code: classified.code,
      failure_message: classified.operatorMessage,
    });
    await actor.supabase
      .from("integration_failures")
      .upsert(
        {
          organization_id: definition.organization_id,
          provider_key: connection.provider_key,
          connection_id: connection.id,
          job_id: args.jobId ?? null,
          failure_code: classified.code,
          retryable: classified.retryable,
          message: classified.operatorMessage,
          recommended_action: classified.recommendedAction,
          correlation_id: runRow.correlation_id,
          last_seen_at: new Date().toISOString(),
          resolved: false,
        },
        { onConflict: "connection_id,failure_code" },
      );
    await writeAudit(actor, {
      organizationId: definition.organization_id,
      entityType: "integration_sync_run",
      entityId: runRow.id,
      action: "integration_sync_failed",
      metadata: { failure_code: classified.code, correlation_id: runRow.correlation_id },
    });
    await notifyPermissionHolders(actor, definition.organization_id, "integration:read", {
      category: "system",
      title: "Integration sync failed",
      body: `${connection.name}: ${classified.operatorMessage}`,
      linkPath: `/performance-operations/integrations/runs/${runRow.id}`,
      entityType: "integration_sync_run",
      entityId: runRow.id,
    });
    return {
      ok: false,
      runId: runRow.id,
      status: "failed",
      importBatchId: null,
      recordsFetched: 0,
      recordsAccepted: 0,
      recordsUnchanged: 0,
      failureCode: classified.code,
      message: classified.operatorMessage,
    };
  };

  try {
    /* 5–6. Resolve credential + fetch bounded pages. */
    const secret = await resolveSecret(actor, connection.id);
    const config = (connection.capabilities as Record<string, unknown>)?.config
      ? ((connection.capabilities as Record<string, unknown>).config as Record<string, unknown>)
      : ((connection.capabilities as Record<string, unknown>) ?? {});

    let cursor = cursorBefore;
    let pagesFetched = 0;
    let rateState: RateLimitState = initialRateLimitState();
    const fetched: ProviderRecord[] = [];
    const driftReports: DriftReport[] = [];
    const expectations =
      connection.provider_key === "test_provider" ? TEST_EXPECTED_FIELDS : [];

    while (pagesFetched < MAX_PAGES_PER_RUN) {
      const ctx: FetchContext = {
        connectionId: connection.id,
        organizationId: definition.organization_id,
        window,
        cursor,
        secret,
        config,
        pageLimit: capabilities.maxPageSize ?? 100,
      };
      const page = await adapter.fetchAppointments(ctx);
      pagesFetched += 1;
      rateState = applyObservation(rateState, page.rateLimit);

      if (rateState.throttled) {
        const pause = pauseSeconds(rateState);
        if (pause > MAX_INLINE_PAUSE_SECONDS) {
          // Too long to hold a request open: fail retryable so the job
          // system reschedules with backoff. Cursor untouched — the page
          // is safely re-fetchable.
          throw new IntegrationFailure(
            "rate_limited",
            `Provider throttled (retry after ${pause}s).`,
          );
        }
        await sleep(pause);
        continue; // same cursor — retry the page
      }

      for (const record of page.records) {
        fetched.push(record);
        if (expectations.length > 0) {
          driftReports.push(detectDrift(record.payload, expectations));
        }
      }
      if (page.nextCursor === null || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }
    const cursorAfter = cursor;

    /* 7. Preserve raw source records (immutable evidence, idempotent). */
    let accepted = 0;
    let unchanged = 0;
    const acceptedRecords: ProviderRecord[] = [];
    for (const record of fetched) {
      const payloadSha = sha256Hex(stableStringify(record.payload));
      const { data: inserted } = await actor.supabase
        .from("integration_source_records")
        .upsert(
          {
            organization_id: definition.organization_id,
            connection_id: connection.id,
            sync_run_id: runRow.id,
            data_type: definition.data_type,
            external_id: record.externalId,
            source_updated_at: record.sourceUpdatedAt,
            payload: record.payload as Json,
            payload_sha256: payloadSha,
          },
          {
            onConflict: "connection_id,data_type,external_id,payload_sha256",
            ignoreDuplicates: true,
          },
        )
        .select("id");
      if ((inserted ?? []).length > 0) {
        accepted += 1;
        acceptedRecords.push(record);
      } else {
        unchanged += 1; // identical payload already on record — idempotent
      }
    }

    /* 8. Schema drift fails closed BEFORE any batch is created. */
    const drift = summarizeDrift(driftReports);
    if (drift.hasDrift) {
      await actor.supabase
        .from("integration_connections")
        .update({
          status: "degraded",
          failure_reason: "schema_drift",
          last_health_status: "schema_drift",
        })
        .eq("id", connection.id)
        .eq("status", "active");
      await writeAudit(actor, {
        organizationId: definition.organization_id,
        entityType: "integration_connection",
        entityId: connection.id,
        action: "integration_schema_drift_detected",
        metadata: {
          missing_required: drift.missingRequired,
          new_fields: drift.newFields,
          type_changes: drift.typeChanges,
        } as unknown as Record<string, Json>,
      });
      throw new IntegrationFailure(
        "schema_drift",
        `Provider data shape changed: missing [${drift.missingRequired.join(", ")}]; ` +
          `type changes [${drift.typeChanges.map((c) => c.field).join(", ")}]. ` +
          "Raw evidence preserved; adapter review required.",
      );
    }

    /* 9–11. Evidence CSV → import batch → existing pipeline. */
    let importBatchId: string | null = null;
    if (definition.auto_create_batch && acceptedRecords.length > 0) {
      importBatchId = await createIntegrationBatch(actor, {
        connection,
        definition,
        runId: runRow.id,
        records: acceptedRecords,
        adapterKey: connection.provider_key,
      });
    }

    /* 12. Advance the cursor ONLY now — everything above is durable. */
    if (definition.mode === "incremental" && cursorAfter !== cursorBefore) {
      await actor.supabase.from("integration_cursors").upsert(
        {
          connection_id: connection.id,
          definition_id: definition.id,
          organization_id: definition.organization_id,
          data_type: definition.data_type,
          cursor_value: cursorAfter,
          previous_value: cursorBefore,
          advanced_at: new Date().toISOString(),
        },
        { onConflict: "definition_id,data_type" },
      );
    }

    /* 13–15. Statistics, definition bookkeeping, notification. */
    await finishRun({
      status: "succeeded",
      cursor_after: cursorAfter,
      pages_fetched: pagesFetched,
      records_fetched: fetched.length,
      records_accepted: accepted,
      records_unchanged: unchanged,
      records_rejected: 0,
      import_batch_id: importBatchId,
      rate_limit_state: {
        requests_made: rateState.requestsMade,
        remaining: rateState.remaining,
        consecutive_throttles: rateState.consecutiveThrottles,
      } as unknown as Json,
    });
    await actor.supabase
      .from("integration_sync_definitions")
      .update({ last_successful_run_at: new Date().toISOString() })
      .eq("id", definition.id);
    await actor.supabase
      .from("integration_connections")
      .update({
        last_health_check_at: new Date().toISOString(),
        last_health_status: "ok",
      })
      .eq("id", connection.id);
    // A clean run resolves this connection's outstanding failures.
    await actor.supabase
      .from("integration_failures")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("connection_id", connection.id)
      .eq("resolved", false);
    await writeAudit(actor, {
      organizationId: definition.organization_id,
      entityType: "integration_sync_run",
      entityId: runRow.id,
      action: "integration_sync_succeeded",
      metadata: {
        records_fetched: fetched.length,
        records_accepted: accepted,
        records_unchanged: unchanged,
        import_batch_id: importBatchId,
        correlation_id: runRow.correlation_id,
      },
    });
    if (importBatchId) {
      await notifyPermissionHolders(actor, definition.organization_id, "import:resolve", {
        category: "imports",
        title: "Integration sync created an import batch",
        body: `${connection.name}: ${accepted} record(s) staged — review required before posting.`,
        linkPath: `/performance-operations/imports/${importBatchId}`,
        entityType: "import_batch",
        entityId: importBatchId,
      });
    }

    return {
      ok: true,
      runId: runRow.id,
      status: "succeeded",
      importBatchId,
      recordsFetched: fetched.length,
      recordsAccepted: accepted,
      recordsUnchanged: unchanged,
      failureCode: null,
      message: importBatchId
        ? `Synced ${accepted} record(s) into a new import batch (review required).`
        : unchanged > 0 && accepted === 0
          ? `No changes: ${unchanged} record(s) already on file.`
          : `Fetched ${fetched.length} record(s); nothing to stage.`,
    };
  } catch (error) {
    return failRun(error);
  }
}

/**
 * Build the deterministic evidence CSV from provider records, store it in
 * the SAME private bucket as manual uploads, and run the records through
 * the EXISTING import pipeline. The CSV — not the API response — is the
 * batch's original file, giving integration batches the same immutable
 * file evidence + hash identity as manual imports (raw payloads are
 * additionally preserved in integration_source_records).
 */
async function createIntegrationBatch(
  actor: ActorContext,
  args: {
    connection: Tables<"integration_connections">;
    definition: Tables<"integration_sync_definitions">;
    runId: string;
    records: ProviderRecord[];
    adapterKey: string;
  },
): Promise<string> {
  const adapter = getProviderAdapter(args.adapterKey)!;
  const sorted = [...args.records].sort((a, b) =>
    a.externalId.localeCompare(b.externalId),
  );
  const lines = [adapter.evidenceColumns.map(escapeCsvCell).join(",")];
  for (const record of sorted) {
    const row = adapter.toEvidenceRow(record);
    lines.push(adapter.evidenceColumns.map((c) => escapeCsvCell(row[c] ?? "")).join(","));
  }
  const csv = lines.join("\r\n") + "\r\n";
  const buffer = Buffer.from(csv, "utf8");
  const fileHash = sha256Hex(buffer);
  const filename = `${args.adapterKey}-sync-${args.runId.slice(0, 8)}-${randomUUID().slice(0, 8)}.csv`;

  const { data: org } = await actor.supabase
    .from("organizations")
    .select("timezone")
    .eq("id", args.definition.organization_id)
    .maybeSingle();
  const timezone = org?.timezone ?? "America/Los_Angeles";

  const { data: batch, error: batchError } = await actor.supabase
    .from("import_batches")
    .insert({
      organization_id: args.definition.organization_id,
      source: adapter.importAdapter.source,
      original_filename: filename,
      storage_path: "pending",
      file_hash: fileHash,
      file_size: buffer.length,
      mime_type: "text/csv",
      uploaded_by: actor.userId,
      created_via: "integration",
      integration_connection_id: args.connection.id,
      integration_sync_run_id: args.runId,
      metadata: {
        provider_key: args.adapterKey,
        adapter_version: adapter.adapterVersion,
        sync_run_id: args.runId,
      } as unknown as Json,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    throw new IntegrationFailure(
      "internal_transaction_failure",
      "Could not create the import batch for the sync run.",
    );
  }

  const now = new Date();
  const storagePath = `${args.definition.organization_id}/${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}/${batch.id}/${filename}`;
  const { error: storageError } = await actor.supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "text/csv", upsert: false });
  if (storageError) {
    throw new IntegrationFailure(
      "internal_transaction_failure",
      "Evidence file could not be stored; batch not staged.",
    );
  }
  await actor.supabase
    .from("import_batches")
    .update({ storage_path: storagePath })
    .eq("id", batch.id);

  await writeAudit(actor, {
    organizationId: args.definition.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: "import_batch_created_by_integration",
    metadata: {
      provider_key: args.adapterKey,
      connection_id: args.connection.id,
      sync_run_id: args.runId,
      record_count: sorted.length,
    },
  });

  if (args.definition.auto_parse) {
    const parsed = parseCsv(csv, { maxRows: 10_000 });
    await stageBatch(
      actor,
      { id: batch.id, organization_id: args.definition.organization_id },
      parsed,
      adapter.importAdapter,
      timezone,
      // Non-secret connection config only (same source the fetch context
      // uses). `secret` is never in this object — credentials do not
      // travel with staged rows.
      ((args.connection.capabilities as Record<string, unknown> | null)?.config as
        | Record<string, unknown>
        | undefined) ?? undefined,
    );
    if (args.definition.auto_validate) {
      await runMatching(actor, {
        id: batch.id,
        organization_id: args.definition.organization_id,
        source: adapter.importAdapter.source,
        status: "validating",
      });
    }
  }
  return batch.id;
}
