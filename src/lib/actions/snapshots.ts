"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "./shared";

const SNAPSHOTS_PATH = "/performance-operations/snapshots";

/**
 * A snapshot is provenance FIRST and numbers second. Every field the
 * intelligence layer needs in order to qualify a figure is required here,
 * because a value that cannot be attributed and dated is worse than no
 * value at all — it looks authoritative and is not.
 */
const snapshotSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  sourceKey: z.string().trim().min(1, "Choose the source system."),
  periodStart: z.iso.date("Enter the period start date."),
  periodEnd: z.iso.date("Enter the period end date."),
  asOfDate: z.iso.date("Enter the date the external system was read."),
  note: z.string().max(1000).optional().default(""),
});

/** Metric values: blank means "not entered", never zero. */
const valueSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}$/, "Enter a whole number (or leave blank).");

function validateWindow(values: {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
}): string | null {
  if (values.periodEnd < values.periodStart) {
    return "The period end must be on or after the period start.";
  }
  if (values.asOfDate < values.periodStart) {
    return "The as-of date cannot fall before the period it describes.";
  }
  return null;
}

interface ParsedValues {
  entries: { metricKey: string; value: number }[];
  error: string | null;
}

/**
 * Read `metric.<key>` fields. Unknown keys are rejected rather than
 * ignored: a typo'd field name must not silently discard a figure the
 * owner believes they entered.
 */
function parseMetricValues(
  formData: FormData,
  allowedKeys: Set<string>
): ParsedValues {
  const entries: { metricKey: string; value: number }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (!field.startsWith("metric.")) continue;
    const metricKey = field.slice("metric.".length);
    if (!allowedKeys.has(metricKey)) {
      return { entries: [], error: `Unknown metric field: ${metricKey}.` };
    }
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const parsed = valueSchema.safeParse(raw);
    if (!parsed.success) {
      return { entries: [], error: `${metricKey}: ${parsed.error.issues[0].message}` };
    }
    entries.push({ metricKey, value: Number(parsed.data) });
  }
  return { entries, error: null };
}

async function loadActiveMetricKeys(actor: ActorContext): Promise<Set<string>> {
  const { data } = await actor.supabase
    .from("organizational_metric_definitions")
    .select("key")
    .eq("is_active", true);
  return new Set((data ?? []).map((row) => row.key));
}

export async function recordOrganizationalSnapshot(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = snapshotSchema.safeParse({
    organizationId: formData.get("organizationId"),
    sourceKey: formData.get("sourceKey"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    asOfDate: formData.get("asOfDate"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const values = parsed.data;

  const windowError = validateWindow(values);
  if (windowError) return { error: windowError };

  // Deny by default, before any read of the form's numbers.
  if (!actorCan(actor, values.organizationId, "org_snapshot:enter")) {
    return PERMISSION_DENIED;
  }

  const allowedKeys = await loadActiveMetricKeys(actor);
  const { entries, error: valueError } = parseMetricValues(formData, allowedKeys);
  if (valueError) return { error: valueError };
  if (entries.length === 0) {
    return { error: "Enter at least one value before saving the snapshot." };
  }

  const { data: snapshot, error } = await actor.supabase
    .from("organizational_snapshots")
    .insert({
      organization_id: values.organizationId,
      source_key: values.sourceKey,
      period_start: values.periodStart,
      period_end: values.periodEnd,
      as_of_date: values.asOfDate,
      note: values.note.trim() === "" ? null : values.note.trim(),
      entered_by: actor.userId,
      status: "recorded",
    })
    .select("id")
    .single();
  if (error || !snapshot) {
    if (error?.code === "23503") {
      return { error: "That source system is not recognized." };
    }
    return { error: "Could not record the snapshot." };
  }

  const { error: valuesError } = await actor.supabase
    .from("organizational_snapshot_values")
    .insert(
      entries.map((entry) => ({
        snapshot_id: snapshot.id,
        organization_id: values.organizationId,
        metric_key: entry.metricKey,
        value: entry.value,
      }))
    );
  if (valuesError) {
    // The header exists but carries no figures. Void it rather than
    // leaving an empty snapshot that a report might quote.
    await actor.supabase
      .from("organizational_snapshots")
      .update({ status: "voided", void_reason: "Values could not be saved." })
      .eq("id", snapshot.id);
    return { error: "Could not save the snapshot values; the snapshot was voided." };
  }

  await writeAudit(actor, {
    organizationId: values.organizationId,
    entityType: "organizational_snapshot",
    entityId: snapshot.id,
    action: "organizational_snapshot_recorded",
    metadata: {
      source_key: values.sourceKey,
      as_of_date: values.asOfDate,
      period_start: values.periodStart,
      period_end: values.periodEnd,
      // Metric KEYS only, never the figures: the audit trail records that
      // a reading happened, and the snapshot itself holds the numbers.
      metric_keys: entries.map((e) => e.metricKey).sort().join(","),
    },
  });

  revalidatePath(SNAPSHOTS_PATH);
  return { message: `Snapshot recorded as of ${values.asOfDate}.` };
}

/**
 * Mark an earlier snapshot as replaced by a later one. This is how a
 * correction is made — the original figures are never edited away.
 */
export async function supersedeSnapshot(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;

  const parsed = z
    .object({
      organizationId: z.uuid(),
      oldSnapshotId: z.uuid(),
      newSnapshotId: z.uuid(),
    })
    .safeParse({
      organizationId: formData.get("organizationId"),
      oldSnapshotId: formData.get("oldSnapshotId"),
      newSnapshotId: formData.get("newSnapshotId"),
    });
  if (!parsed.success) return { error: "Invalid input." };

  if (!actorCan(actor, parsed.data.organizationId, "org_snapshot:manage")) {
    return PERMISSION_DENIED;
  }

  const { error } = await actor.supabase.rpc("supersede_organizational_snapshot", {
    p_old_snapshot_id: parsed.data.oldSnapshotId,
    p_new_snapshot_id: parsed.data.newSnapshotId,
  });
  if (error) return { error: "Could not supersede that snapshot." };

  await writeAudit(actor, {
    organizationId: parsed.data.organizationId,
    entityType: "organizational_snapshot",
    entityId: parsed.data.oldSnapshotId,
    action: "organizational_snapshot_superseded",
    metadata: { superseded_by: parsed.data.newSnapshotId },
  });

  revalidatePath(SNAPSHOTS_PATH);
  return { message: "Snapshot superseded." };
}
