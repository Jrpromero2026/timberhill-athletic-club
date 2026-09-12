"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { looksLikeLegacyXls, looksLikeZip, workbookToCsvText } from "@/lib/imports/workbook";
import { parseCsv, MAX_IMPORT_ROWS } from "@/lib/imports/csv";
import {
  detectAdapter,
  headerSignature,
} from "@/lib/imports/adapters";
import {
  createGenericAdapter,
  CANONICAL_FIELDS,
  type ColumnMappings,
} from "@/lib/imports/adapters/generic";
import {
  reconcileBatch,
  runMatching,
  sha256Hex,
  stageBatch,
  transition,
} from "@/lib/imports/pipeline";
import { normalizeText } from "@/lib/imports/values";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import type { Json } from "@/lib/supabase/types";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "./shared";

const IMPORTS_PATH = "/performance-operations/imports";
const BUCKET = "performance-operations-imports";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload.csv";
  return base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "upload.csv";
}

async function loadBatch(actor: ActorContext, batchId: string) {
  const { data } = await actor.supabase
    .from("import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  return data;
}

async function logResolution(
  actor: ActorContext,
  batch: { id: string; organization_id: string },
  action: string,
  payload: Record<string, Json>,
  rowId: string | null = null,
  affected = 1
): Promise<void> {
  await actor.supabase.from("import_resolutions").insert({
    import_batch_id: batch.id,
    organization_id: batch.organization_id,
    import_row_id: rowId,
    action,
    payload: payload as unknown as Json,
    affected_row_count: affected,
    actor_id: actor.userId,
  });
  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: `import_${action}`,
    metadata: { ...payload, affected_row_count: affected },
  });
}

/** Any change during ready_for_approval/approved drops the batch back to review. */
async function invalidateApproval(
  actor: ActorContext,
  batch: { id: string; organization_id: string; status: string }
): Promise<void> {
  if (batch.status === "approved" || batch.status === "ready_for_approval") {
    if (batch.status === "approved") {
      await actor.supabase
        .from("import_batches")
        .update({ approved_by: null, approved_at: null })
        .eq("id", batch.id);
    }
    await transition(
      actor,
      batch.id,
      batch.organization_id,
      "needs_review",
      "Material change after approval readiness — approval revoked."
    );
  }
}

/* ------------------------------------------------------------------ upload */

const uploadSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  source: z.enum(["setmore", "acuity", "manual_csv"]),
  confirmDuplicateFile: z.boolean().default(false),
});

export async function uploadImportFile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsedInput = uploadSchema.safeParse({
    organizationId: formData.get("organizationId"),
    source: formData.get("source"),
    confirmDuplicateFile: formData.get("confirmDuplicateFile") === "true",
  });
  if (!parsedInput.success) {
    return { error: parsedInput.error.issues[0]?.message ?? "Invalid input." };
  }
  const { organizationId, source, confirmDuplicateFile } = parsedInput.data;

  if (!actorCan(actor, organizationId, "import:upload")) return PERMISSION_DENIED;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "The file exceeds the 10 MB limit." };
  }
  const filename = sanitizeFilename(file.name);
  if (!/\.(csv|xlsx)$/i.test(filename)) {
    return {
      error:
        "Upload the Setmore export as it downloaded (.xlsx) or as a .csv.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (looksLikeLegacyXls(buffer)) {
    return {
      error:
        "This is a legacy .xls workbook, which is not supported. Re-export from Setmore (downloads as .xlsx) and upload that file.",
    };
  }

  const fileHash = sha256Hex(buffer);

  // Duplicate-file detection: same content already uploaded for this org.
  const { data: existingSameHash } = await actor.supabase
    .from("import_batches")
    .select("id, status, original_filename, uploaded_at")
    .eq("organization_id", organizationId)
    .eq("file_hash", fileHash)
    .limit(3);
  if ((existingSameHash ?? []).length > 0) {
    if ((existingSameHash ?? []).some((b) => ["posted", "posting"].includes(b.status))) {
      return {
        error:
          "This exact file has already been POSTED for this organization. Posting it twice is not allowed; if the source data changed, export a fresh file.",
      };
    }
    if (!confirmDuplicateFile) {
      return {
        error: `This exact file was already uploaded (${existingSameHash![0].original_filename}, status ${existingSameHash![0].status}). Confirm to upload it again anyway.`,
        data: { duplicateFileWarning: "true" },
      };
    }
  }

  // Content decides the parse path (an .xlsx renamed to .csv still reads
  // as a workbook): ZIP magic → Excel workbook, first sheet, converted
  // server-side into the same CSV dialect the pipeline consumes. The
  // ORIGINAL bytes are stored unmodified as the batch evidence file.
  let text: string;
  if (looksLikeZip(buffer)) {
    try {
      const converted = await workbookToCsvText(buffer);
      text = converted.csvText;
    } catch {
      return {
        error:
          "This Excel workbook could not be read. Re-export it from Setmore and upload the fresh file; if it fails again, the format changed and needs a look.",
      };
    }
  } else {
    text = buffer.toString("utf8");
  }
  const parsed = parseCsv(text, { maxRows: MAX_IMPORT_ROWS });
  const fatal = parsed.issues.find((i) =>
    ["empty_file", "unclosed_quote"].includes(i.code)
  );

  // Adapter detection (setmore auto; acuity blocked → generic mapping path).
  const trimmedHeaders = parsed.headers.map((h) => h.trim());
  const detection = detectAdapter(parsed.headers);
  const adapter =
    source === "setmore" && detection.adapter?.source === "setmore"
      ? detection.adapter
      : null;
  const signature = headerSignature(parsed.headers);

  // Existing mapping profile for generic/acuity files with this signature.
  const { data: profile } = await actor.supabase
    .from("import_schema_profiles")
    .select("id, column_mappings, version")
    .eq("organization_id", organizationId)
    .eq("source", source)
    .eq("header_signature", signature)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: org } = await actor.supabase
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  const timezone = org?.timezone ?? "America/Los_Angeles";

  // Create the batch first (uploaded), then store the original file.
  const { data: batch, error: batchError } = await actor.supabase
    .from("import_batches")
    .insert({
      organization_id: organizationId,
      source,
      original_filename: filename,
      storage_path: "pending",
      file_hash: fileHash,
      file_size: file.size,
      mime_type: file.type || "text/csv",
      uploaded_by: actor.userId,
      metadata: {
        header_signature: signature,
        headers: trimmedHeaders,
        detected_adapter: detection.adapter?.version ?? null,
        detection_confidence: detection.confidence,
      } as unknown as Json,
    })
    .select("id")
    .single();
  if (batchError || !batch) return { error: "Could not create the import batch." };

  const now = new Date();
  const storagePath = `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${batch.id}/${filename}`;
  const { error: storageError } = await actor.supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "text/csv", upsert: false });
  if (storageError) {
    await transition(actor, batch.id, organizationId, "failed", "storage_upload_failed");
    await actor.supabase
      .from("import_batches")
      .update({ failure_code: "storage_upload_failed", sanitized_failure_message: "The original file could not be stored." })
      .eq("id", batch.id);
    return { error: "The original file could not be stored. Nothing was imported." };
  }
  await actor.supabase
    .from("import_batches")
    .update({ storage_path: storagePath })
    .eq("id", batch.id);

  await writeAudit(actor, {
    organizationId,
    entityType: "import_batch",
    entityId: batch.id,
    action: "import_file_uploaded",
    metadata: { filename, file_size: file.size, source, row_count: parsed.rows.length },
  });

  if (fatal) {
    await transition(actor, batch.id, organizationId, "parsing");
    await transition(actor, batch.id, organizationId, "failed", fatal.code);
    await actor.supabase
      .from("import_batches")
      .update({
        failure_code: fatal.code,
        sanitized_failure_message: fatal.message,
      })
      .eq("id", batch.id);
    revalidatePath(IMPORTS_PATH);
    redirect(`${IMPORTS_PATH}/${batch.id}`);
  }

  try {
    if (adapter) {
      await stageBatch(actor, { id: batch.id, organization_id: organizationId }, parsed, adapter, timezone);
      await runMatching(actor, {
        id: batch.id,
        organization_id: organizationId,
        source,
        status: "validating",
      });
    } else if (profile) {
      const generic = createGenericAdapter(profile.column_mappings as unknown as ColumnMappings);
      await actor.supabase
        .from("import_batches")
        .update({ schema_profile_id: profile.id })
        .eq("id", batch.id);
      await stageBatch(actor, { id: batch.id, organization_id: organizationId }, parsed, generic, timezone);
      await runMatching(actor, {
        id: batch.id,
        organization_id: organizationId,
        source,
        status: "validating",
      });
    }
    // No adapter + no profile: batch stays `uploaded` pending column mapping.
  } catch (e) {
    await failBatchSafely(actor, batch.id, organizationId, e);
    revalidatePath(IMPORTS_PATH);
    redirect(`${IMPORTS_PATH}/${batch.id}`);
  }

  revalidatePath(IMPORTS_PATH);
  redirect(
    adapter || profile ? `${IMPORTS_PATH}/${batch.id}` : `${IMPORTS_PATH}/${batch.id}/mapping`
  );
}

async function failBatchSafely(
  actor: ActorContext,
  batchId: string,
  organizationId: string,
  cause: unknown
): Promise<void> {
  const code =
    cause instanceof Error && /^[a-z_:0-9]+$/i.test(cause.message)
      ? cause.message.slice(0, 60)
      : "processing_failed";
  try {
    await transition(actor, batchId, organizationId, "failed", code);
  } catch {
    // already failed or in a terminal state — leave as-is
  }
  await actor.supabase
    .from("import_batches")
    .update({
      failure_code: code,
      sanitized_failure_message:
        "Processing failed before completion. The uploaded file is preserved; retry after fixing the cause.",
    })
    .eq("id", batchId);
}

/* ---------------------------------------------------------------- mapping */

export async function saveSchemaMapping(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return { error: "Invalid batch." };
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:manage")) return PERMISSION_DENIED;
  if (batch.status !== "uploaded") {
    return { error: "This batch has already been parsed." };
  }

  const metadata = batch.metadata as unknown as { headers?: string[]; header_signature?: string };
  const headers = metadata.headers ?? [];
  const mappings: ColumnMappings = {};
  for (const header of headers) {
    const value = formData.get(`map:${header}`);
    if (typeof value === "string" && value !== "" && (CANONICAL_FIELDS as readonly string[]).includes(value)) {
      mappings[header] = value as ColumnMappings[string];
    }
  }
  const mappedFields = new Set(Object.values(mappings));
  if (!mappedFields.has("trainer_name") || !mappedFields.has("service_name") || !mappedFields.has("appointment_date")) {
    return { error: "Map at least: appointment date, trainer name, and service name." };
  }
  const timeOk =
    mappedFields.has("time_range") ||
    (mappedFields.has("start_time") &&
      (mappedFields.has("end_time") || mappedFields.has("duration_minutes")));
  if (!timeOk) {
    return { error: "Map a time range, or a start time plus an end time or duration." };
  }

  const { data: latest } = await actor.supabase
    .from("import_schema_profiles")
    .select("version")
    .eq("organization_id", batch.organization_id)
    .eq("source", batch.source)
    .eq("header_signature", metadata.header_signature ?? "")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile, error } = await actor.supabase
    .from("import_schema_profiles")
    .insert({
      organization_id: batch.organization_id,
      source: batch.source,
      name: `${batch.source} mapping v${(latest?.version ?? 0) + 1}`,
      header_signature: metadata.header_signature ?? "",
      column_mappings: mappings as unknown as Json,
      version: (latest?.version ?? 0) + 1,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !profile) return { error: "Could not save the mapping." };

  await actor.supabase
    .from("import_batches")
    .update({ schema_profile_id: profile.id, adapter_version: "generic-v1" })
    .eq("id", batch.id);
  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_schema_profile",
    entityId: profile.id,
    action: "import_schema_mapping_saved",
    metadata: { batch_id: batch.id, mapped_columns: Object.keys(mappings).length },
  });

  // Stage using the fresh mapping.
  const { data: org } = await actor.supabase
    .from("organizations")
    .select("timezone")
    .eq("id", batch.organization_id)
    .maybeSingle();
  try {
    const { data: fileData, error: downloadError } = await actor.supabase.storage
      .from(BUCKET)
      .download(batch.storage_path);
    if (downloadError || !fileData) throw new Error("original_file_unavailable");
    const parsed = parseCsv(await fileData.text(), { maxRows: MAX_IMPORT_ROWS });
    const generic = createGenericAdapter(mappings);
    await stageBatch(
      actor,
      { id: batch.id, organization_id: batch.organization_id },
      parsed,
      generic,
      org?.timezone ?? "America/Los_Angeles"
    );
    await runMatching(actor, {
      id: batch.id,
      organization_id: batch.organization_id,
      source: batch.source,
      status: "validating",
    });
  } catch (e) {
    await failBatchSafely(actor, batch.id, batch.organization_id, e);
  }

  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  redirect(`${IMPORTS_PATH}/${batch.id}`);
}

/* ------------------------------------------------------------ resolutions */

const rowActionSchema = z.object({
  batchId: z.uuid(),
  rowId: z.uuid(),
});

async function loadRowAndBatch(actor: ActorContext, formData: FormData) {
  const parsed = rowActionSchema.safeParse({
    batchId: formData.get("batchId"),
    rowId: formData.get("rowId"),
  });
  if (!parsed.success) return null;
  const batch = await loadBatch(actor, parsed.data.batchId);
  if (!batch) return null;
  if (!actorCan(actor, batch.organization_id, "import:resolve")) return null;
  if (["posted", "posting", "reversed"].includes(batch.status)) return null;
  const { data: row } = await actor.supabase
    .from("import_rows")
    .select("*")
    .eq("id", parsed.data.rowId)
    .eq("import_batch_id", batch.id)
    .maybeSingle();
  if (!row) return null;
  return { batch, row };
}

async function applyCorrection(
  actor: ActorContext,
  batch: { id: string; organization_id: string; status: string; source: string },
  rowId: string,
  corrections: Record<string, Json>,
  issueCodesToResolve: string[],
  resolutionAction: string,
  payload: Record<string, Json>,
  applyToSimilarValue?: { field: "trainer" | "service" | "client"; sourceValue: string }
): Promise<number> {
  const { supabase } = actor;
  await invalidateApproval(actor, batch);

  let affectedRowIds = [rowId];
  if (applyToSimilarValue) {
    // bulk: rows in the SAME batch with the exact same source value, still unresolved
    const { data: rows } = await supabase
      .from("import_rows")
      .select("id, normalized_row, matched_trainer_id, matched_service_id, matched_client_id")
      .eq("import_batch_id", batch.id)
      .not("processing_status", "in", '("excluded","posted")');
    const fieldKey =
      applyToSimilarValue.field === "trainer"
        ? "sourceTrainerName"
        : applyToSimilarValue.field === "service"
          ? "sourceServiceName"
          : "sourceClientName";
    const matchedKey =
      applyToSimilarValue.field === "trainer"
        ? "matched_trainer_id"
        : applyToSimilarValue.field === "service"
          ? "matched_service_id"
          : "matched_client_id";
    affectedRowIds = (rows ?? [])
      .filter((r) => {
        const normalized = r.normalized_row as unknown as Record<string, string>;
        return (
          normalizeText(normalized[fieldKey] ?? "") ===
            normalizeText(applyToSimilarValue.sourceValue) &&
          (r[matchedKey as keyof typeof r] === null || r.id === rowId)
        );
      })
      .map((r) => r.id);
    if (!affectedRowIds.includes(rowId)) affectedRowIds.push(rowId);
  }

  for (const id of affectedRowIds) {
    const { data: current } = await supabase
      .from("import_rows")
      .select("corrections")
      .eq("id", id)
      .maybeSingle();
    const merged = {
      ...((current?.corrections as Record<string, Json>) ?? {}),
      ...corrections,
    };
    await supabase
      .from("import_rows")
      .update({ corrections: merged as unknown as Json })
      .eq("id", id);
    if (issueCodesToResolve.length > 0) {
      await supabase
        .from("import_row_issues")
        .update({
          resolution_status: "resolved",
          resolved_by: actor.userId,
          resolved_at: new Date().toISOString(),
          resolution_note: resolutionAction,
        })
        .eq("import_row_id", id)
        .in("code", issueCodesToResolve)
        .eq("resolution_status", "open");
    }
  }

  await logResolution(actor, batch, resolutionAction, payload, rowId, affectedRowIds.length);
  return affectedRowIds.length;
}

export async function resolveTrainerMatch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const ctx = await loadRowAndBatch(actor, formData);
  if (!ctx) return PERMISSION_DENIED;
  const trainerId = z.uuid().safeParse(formData.get("trainerId"));
  if (!trainerId.success) return { error: "Choose a trainer." };

  // The trainer must belong to the batch's organization.
  const { data: assignment } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("id")
    .eq("trainer_id", trainerId.data)
    .eq("organization_id", ctx.batch.organization_id)
    .is("effective_to", null)
    .maybeSingle();
  if (!assignment) {
    return { error: "That trainer has no active assignment in this organization." };
  }

  const saveAlias = formData.get("saveAlias") === "true";
  const normalized = ctx.row.normalized_row as unknown as { sourceTrainerName?: string };
  const applyToSimilar = formData.get("applyToSimilar") === "true";

  const affected = await applyCorrection(
    actor,
    ctx.batch,
    ctx.row.id,
    { matched_trainer_id: trainerId.data },
    ["unmatched_trainer", "ambiguous_trainer"],
    "trainer_mapped",
    { trainer_id: trainerId.data, save_alias: saveAlias },
    applyToSimilar && normalized.sourceTrainerName
      ? { field: "trainer", sourceValue: normalized.sourceTrainerName }
      : undefined
  );

  if (saveAlias && normalized.sourceTrainerName) {
    await actor.supabase.from("trainer_source_aliases").insert({
      organization_id: ctx.batch.organization_id,
      trainer_id: trainerId.data,
      source: ctx.batch.source,
      alias: normalized.sourceTrainerName,
      created_by: actor.userId,
    });
  }

  await rerunAndRevalidate(actor, ctx.batch);
  return { message: `Trainer mapped (${affected} row${affected === 1 ? "" : "s"}).` };
}

export async function resolveServiceMatch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const ctx = await loadRowAndBatch(actor, formData);
  if (!ctx) return PERMISSION_DENIED;
  const serviceId = z.uuid().safeParse(formData.get("serviceId"));
  if (!serviceId.success) return { error: "Choose a service." };

  const { data: service } = await actor.supabase
    .from("services")
    .select("id")
    .eq("id", serviceId.data)
    .eq("organization_id", ctx.batch.organization_id)
    .maybeSingle();
  if (!service) return { error: "That service does not belong to this organization." };

  const saveAlias = formData.get("saveAlias") === "true";
  const normalized = ctx.row.normalized_row as unknown as { sourceServiceName?: string };
  const applyToSimilar = formData.get("applyToSimilar") === "true";

  const affected = await applyCorrection(
    actor,
    ctx.batch,
    ctx.row.id,
    { matched_service_id: serviceId.data },
    ["unmatched_service"],
    "service_mapped",
    { service_id: serviceId.data, save_alias: saveAlias },
    applyToSimilar && normalized.sourceServiceName
      ? { field: "service", sourceValue: normalized.sourceServiceName }
      : undefined
  );

  if (saveAlias && normalized.sourceServiceName) {
    await actor.supabase.from("service_source_aliases").insert({
      organization_id: ctx.batch.organization_id,
      service_id: serviceId.data,
      source: ctx.batch.source,
      alias: normalized.sourceServiceName,
    });
  }

  await rerunAndRevalidate(actor, ctx.batch);
  return { message: `Service mapped (${affected} row${affected === 1 ? "" : "s"}).` };
}

export async function resolveClientLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const ctx = await loadRowAndBatch(actor, formData);
  if (!ctx) return PERMISSION_DENIED;

  const mode = formData.get("mode");
  const normalized = ctx.row.normalized_row as unknown as {
    sourceClientName?: string;
    sourceClientEmail?: string;
    sourceClientPhone?: string;
    externalClientId?: string;
  };

  let clientId: string;
  if (mode === "create") {
    if (!actorCan(actor, ctx.batch.organization_id, "client:manage")) {
      return { error: "You are not authorized to create clients." };
    }
    if (!normalized.sourceClientName) {
      return { error: "The row has no client name to create a client from." };
    }
    const nameParts = normalized.sourceClientName.split(/\s+/);
    const { data: client, error } = await actor.supabase
      .from("clients")
      .insert({
        display_name: normalized.sourceClientName,
        first_name: nameParts[0] ?? "",
        last_name: nameParts.slice(1).join(" "),
        email: normalized.sourceClientEmail ?? null,
        phone: normalized.sourceClientPhone ?? null,
      })
      .select("id")
      .single();
    if (error || !client) return { error: "Could not create the client." };
    clientId = client.id;
    await actor.supabase.from("client_organization_assignments").insert({
      client_id: clientId,
      organization_id: ctx.batch.organization_id,
    });
  } else {
    const parsed = z.uuid().safeParse(formData.get("clientId"));
    if (!parsed.success) return { error: "Choose a client." };
    const { data: assignment } = await actor.supabase
      .from("client_organization_assignments")
      .select("id")
      .eq("client_id", parsed.data)
      .eq("organization_id", ctx.batch.organization_id)
      .is("effective_to", null)
      .maybeSingle();
    if (!assignment) {
      return { error: "That client is not assigned to this organization." };
    }
    clientId = parsed.data;
  }

  if (normalized.externalClientId && formData.get("saveSourceId") === "true") {
    await actor.supabase.from("client_source_identifiers").insert({
      client_id: clientId,
      organization_id: ctx.batch.organization_id,
      source: ctx.batch.source,
      external_id: normalized.externalClientId,
      created_by: actor.userId,
    });
  }

  const affected = await applyCorrection(
    actor,
    ctx.batch,
    ctx.row.id,
    { matched_client_id: clientId },
    ["unmatched_client", "ambiguous_client"],
    mode === "create" ? "client_created_and_linked" : "client_linked",
    { client_id: clientId },
    formData.get("applyToSimilar") === "true" && normalized.sourceClientName
      ? { field: "client", sourceValue: normalized.sourceClientName }
      : undefined
  );

  await rerunAndRevalidate(actor, ctx.batch);
  return { message: `Client linked (${affected} row${affected === 1 ? "" : "s"}).` };
}

export async function mapSourceStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = z
    .object({
      batchId: z.uuid(),
      sourceValue: z.string().min(1).max(120),
      canonicalStatus: z.string().min(1).max(40),
    })
    .safeParse({
      batchId: formData.get("batchId"),
      sourceValue: formData.get("sourceValue"),
      canonicalStatus: formData.get("canonicalStatus"),
    });
  if (!parsed.success) return { error: "Invalid status mapping." };

  const batch = await loadBatch(actor, parsed.data.batchId);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:manage")) return PERMISSION_DENIED;

  const { error } = await actor.supabase.from("source_status_mappings").upsert(
    {
      organization_id: batch.organization_id,
      source: batch.source,
      source_value_normalized: normalizeText(parsed.data.sourceValue),
      canonical_status: parsed.data.canonicalStatus,
      created_by: actor.userId,
    },
    { onConflict: "organization_id,source,source_value_normalized" }
  );
  if (error) return { error: "Could not save the status mapping." };

  await invalidateApproval(actor, batch);
  await logResolution(actor, batch, "status_mapping_saved", {
    source_value: parsed.data.sourceValue,
    canonical_status: parsed.data.canonicalStatus,
  });
  // Mapping applies to unresolved staging rows via the matching re-run —
  // posted history is never rewritten.
  await rerunAndRevalidate(actor, batch);
  return { message: "Status mapping saved and applied to this batch's unresolved rows." };
}

export async function resolveDuplicate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const ctx = await loadRowAndBatch(actor, formData);
  if (!ctx) return PERMISSION_DENIED;

  const decision = formData.get("decision");
  if (decision === "not_duplicate") {
    await applyCorrection(
      actor,
      ctx.batch,
      ctx.row.id,
      { duplicate_class: "new" },
      ["possible_duplicate", "source_update_candidate", "previously_reversed"],
      "duplicate_confirmed_not",
      { previous_class: ctx.row.duplicate_class ?? "" }
    );
    await rerunAndRevalidate(actor, ctx.batch);
    return { message: "Marked as not a duplicate — the row can post." };
  }
  if (decision === "confirm_duplicate") {
    // confirming = exclude from posting with an audited reason
    return excludeRowInternal(actor, ctx, "Confirmed duplicate of an existing appointment.");
  }
  return { error: "Choose a duplicate decision." };
}

async function excludeRowInternal(
  actor: ActorContext,
  ctx: { batch: NonNullable<Awaited<ReturnType<typeof loadBatch>>>; row: { id: string } },
  reason: string
): Promise<ActionState> {
  await invalidateApproval(actor, ctx.batch);
  const { error } = await actor.supabase
    .from("import_rows")
    .update({
      processing_status: "excluded",
      exclusion_reason: reason,
      excluded_by: actor.userId,
    })
    .eq("id", ctx.row.id);
  if (error) return { error: "Could not exclude the row." };
  // Waive the excluded row's open issues so they stop blocking the batch.
  await actor.supabase
    .from("import_row_issues")
    .update({
      resolution_status: "waived",
      resolved_by: actor.userId,
      resolved_at: new Date().toISOString(),
      resolution_note: `Row excluded: ${reason}`,
    })
    .eq("import_row_id", ctx.row.id)
    .eq("resolution_status", "open");
  await logResolution(actor, ctx.batch, "row_excluded", { reason }, ctx.row.id);
  await reconcileBatch(actor, ctx.batch.id, ctx.batch.organization_id);
  revalidatePath(`${IMPORTS_PATH}/${ctx.batch.id}`);
  revalidatePath(`${IMPORTS_PATH}/${ctx.batch.id}/review`);
  return { message: "Row excluded from posting (original preserved)." };
}

export async function excludeRow(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const ctx = await loadRowAndBatch(actor, formData);
  if (!ctx) return PERMISSION_DENIED;
  const reason = formData.get("reason");
  if (typeof reason !== "string" || reason.trim().length < 5) {
    return { error: "An exclusion reason (at least 5 characters) is required." };
  }
  return excludeRowInternal(actor, ctx, reason.trim());
}

export async function acknowledgeWarnings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return { error: "Invalid batch." };
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:resolve")) return PERMISSION_DENIED;

  const { data: open } = await actor.supabase
    .from("import_row_issues")
    .select("id", { count: "exact" })
    .eq("import_batch_id", batch.id)
    .eq("severity", "warning")
    .eq("resolution_status", "open");
  const count = open?.length ?? 0;

  await actor.supabase
    .from("import_row_issues")
    .update({
      resolution_status: "accepted",
      resolved_by: actor.userId,
      resolved_at: new Date().toISOString(),
      resolution_note: "Warnings acknowledged for approval.",
    })
    .eq("import_batch_id", batch.id)
    .eq("severity", "warning")
    .eq("resolution_status", "open");

  await logResolution(actor, batch, "warnings_acknowledged", { count }, null, count);
  await reconcileBatch(actor, batch.id, batch.organization_id);
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  return { message: `${count} warning${count === 1 ? "" : "s"} acknowledged.` };
}

async function rerunAndRevalidate(
  actor: ActorContext,
  batch: { id: string; organization_id: string; source: string; status: string }
): Promise<void> {
  const { data: fresh } = await actor.supabase
    .from("import_batches")
    .select("status")
    .eq("id", batch.id)
    .maybeSingle();
  await runMatching(actor, { ...batch, status: fresh?.status ?? batch.status });
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  revalidatePath(`${IMPORTS_PATH}/${batch.id}/review`);
}

export async function rerunMatching(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return;
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return;
  if (!actorCan(actor, batch.organization_id, "import:resolve")) return;
  if (!["needs_review", "ready_for_approval", "validating", "failed"].includes(batch.status)) return;
  await rerunAndRevalidate(actor, batch);
}

/* ------------------------------------------------------------- approval */

export async function approveBatch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return { error: "Invalid batch." };
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:approve")) return PERMISSION_DENIED;
  if (batch.status !== "ready_for_approval") {
    return { error: "The batch is not ready for approval." };
  }

  const [{ count: blocking }, { count: warnings }, { count: dupes }] = await Promise.all([
    actor.supabase
      .from("import_row_issues")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batch.id)
      .eq("severity", "blocking")
      .eq("resolution_status", "open"),
    actor.supabase
      .from("import_row_issues")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batch.id)
      .eq("severity", "warning")
      .eq("resolution_status", "open"),
    actor.supabase
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batch.id)
      .not("processing_status", "in", '("excluded","posted")')
      .not("duplicate_class", "in", '("new")'),
  ]);
  if ((blocking ?? 0) > 0) return { error: "Blocking issues remain — approval refused." };
  if ((warnings ?? 0) > 0) {
    return { error: "Open warnings must be acknowledged before approval." };
  }
  if ((dupes ?? 0) > 0) {
    return { error: "Unresolved duplicate classifications remain — approval refused." };
  }

  const { error } = await actor.supabase
    .from("import_batches")
    .update({ approved_by: actor.userId, approved_at: new Date().toISOString() })
    .eq("id", batch.id);
  if (error) return { error: "Could not record the approval." };
  await transition(actor, batch.id, batch.organization_id, "approved");
  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: "import_batch_approved",
    metadata: { accepted_rows: batch.accepted_row_count },
  });
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  return { message: "Batch approved. It can now be posted." };
}

export async function revokeApproval(formData: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return;
  const batch = await loadBatch(actor, batchId.data);
  if (!batch || batch.status !== "approved") return;
  if (!actorCan(actor, batch.organization_id, "import:approve")) return;
  await actor.supabase
    .from("import_batches")
    .update({ approved_by: null, approved_at: null })
    .eq("id", batch.id);
  await transition(actor, batch.id, batch.organization_id, "needs_review", "Approval revoked.");
  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: "import_batch_approval_revoked",
    metadata: {},
  });
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
}

/* ------------------------------------------------------ posting/reversal */

export async function postBatch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return { error: "Invalid batch." };
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:post")) return PERMISSION_DENIED;

  const { data, error } = await actor.supabase.rpc("post_import_batch", {
    p_batch_id: batch.id,
  });
  if (error) {
    // The transaction rolled back atomically; record a safe failure state.
    const message = error.message.includes("blocking_issues_remain")
      ? "Blocking issues remain — posting refused."
      : error.message.includes("unresolved_duplicates_remain")
        ? "Unresolved duplicates remain — posting refused."
        : error.message.includes("batch_not_approved")
          ? "The batch must be approved before posting."
          : error.message.includes("already_posted")
            ? "This batch was already posted."
            : "Posting failed and was rolled back — no appointments were created.";
    if (!/refused|approved before|already posted/.test(message)) {
      await failBatchSafely(actor, batch.id, batch.organization_id, new Error("posting_failed"));
    }
    revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
    return { error: message };
  }

  const posted = (data as { posted_count?: number } | null)?.posted_count ?? 0;
  await notifyPermissionHolders(actor, batch.organization_id, "import:approve", {
    category: "imports",
    title: `Import posted: ${batch.original_filename}`,
    body: `${posted} appointment(s) added to the canonical ledger.`,
    linkPath: `${IMPORTS_PATH}/${batch.id}`,
    entityType: "import_batch",
    entityId: batch.id,
  });
  revalidatePath(IMPORTS_PATH);
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  revalidatePath("/performance-operations/appointments");
  return { message: `Posted ${posted} appointment${posted === 1 ? "" : "s"} to the ledger.` };
}

export async function reverseBatch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const parsed = z
    .object({ batchId: z.uuid(), reason: z.string().trim().min(5, "A reason (at least 5 characters) is required.") })
    .safeParse({ batchId: formData.get("batchId"), reason: formData.get("reason") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reversal request." };
  }
  const batch = await loadBatch(actor, parsed.data.batchId);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:reverse")) return PERMISSION_DENIED;

  const { data, error } = await actor.supabase.rpc("reverse_import_batch", {
    p_batch_id: batch.id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return {
      error: error.message.includes("batch_not_posted")
        ? "Only posted batches can be reversed."
        : error.message.includes("already_reversed")
          ? "This batch was already reversed."
          : "Reversal failed and was rolled back.",
    };
  }
  const reversed = (data as { reversed_count?: number } | null)?.reversed_count ?? 0;
  await notifyPermissionHolders(actor, batch.organization_id, "import:approve", {
    category: "imports",
    severity: "warning",
    title: `Import reversed: ${batch.original_filename}`,
    body: `${reversed} appointment(s) reversed. Reason: ${parsed.data.reason}`,
    linkPath: `${IMPORTS_PATH}/${batch.id}`,
    entityType: "import_batch",
    entityId: batch.id,
  });
  revalidatePath(IMPORTS_PATH);
  revalidatePath(`${IMPORTS_PATH}/${batch.id}`);
  revalidatePath("/performance-operations/appointments");
  return {
    message: `Reversed ${reversed} appointment${reversed === 1 ? "" : "s"}. History and evidence are preserved.`,
  };
}

/* ------------------------------------------------------------- download */

export async function getOriginalFileUrl(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const batchId = z.uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return { error: "Invalid batch." };
  const batch = await loadBatch(actor, batchId.data);
  if (!batch) return { error: "Batch not found." };
  if (!actorCan(actor, batch.organization_id, "import:download")) return PERMISSION_DENIED;

  const { data, error } = await actor.supabase.storage
    .from(BUCKET)
    .createSignedUrl(batch.storage_path, 60);
  if (error || !data) return { error: "Could not create a download link." };

  await writeAudit(actor, {
    organizationId: batch.organization_id,
    entityType: "import_batch",
    entityId: batch.id,
    action: "import_file_downloaded",
    metadata: { filename: batch.original_filename },
  });
  return { message: "Download link created (valid 60 seconds).", data: { url: data.signedUrl } };
}
