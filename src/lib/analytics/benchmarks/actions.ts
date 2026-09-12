"use server";

/**
 * Benchmark server actions. No invented numbers: internal-historical
 * benchmarks compute their value from the ENGINE over a named source
 * period range (the citation recorded verbatim); internal standards and
 * external references require owner-provided evidence text. Approval and
 * deprecation flow through the database trigger's lifecycle guards.
 */

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  writeAudit,
  actorCan,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "@/lib/actions/shared";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { getMetricAnalyticsMetadata } from "../shared/metadata";

const INTERNAL_HISTORICAL = new Set([
  "org_historical_median",
  "org_historical_best",
  "department_historical_median",
  "trainer_historical_baseline",
]);

/** Median of a sorted numeric list (lower middle for even counts). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export async function createBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!actorCan(actor, organizationId, "benchmark:create")) return PERMISSION_DENIED;

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the benchmark a name (max 120 characters)." };

  const metricId = String(formData.get("metricId") ?? "");
  const definition = METRIC_DEFINITIONS.get(metricId);
  if (!definition) return { error: "Unknown metric — benchmarks must reference a catalog metric." };
  if (!getMetricAnalyticsMetadata(metricId)?.benchmarkCompatible) {
    return { error: `${definition.name} does not support benchmarks (unit ${definition.unit}).` };
  }

  const sourceType = String(formData.get("sourceType") ?? "");
  const scopeLevel = String(formData.get("scopeLevel") ?? "organization");
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  const trainerId = String(formData.get("trainerId") ?? "") || null;
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { error: "An effective-from date is required." };
  }
  const effectiveTo = String(formData.get("effectiveTo") ?? "") || null;

  let value: number | null = null;
  let evidence = "";
  let sourcePeriodFrom: string | null = null;
  let sourcePeriodTo: string | null = null;

  if (INTERNAL_HISTORICAL.has(sourceType)) {
    // Compute from engine results over the cited source range, one value
    // per reporting period in the range — the evidence IS the citation.
    sourcePeriodFrom = String(formData.get("sourcePeriodFrom") ?? "");
    sourcePeriodTo = String(formData.get("sourcePeriodTo") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourcePeriodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(sourcePeriodTo)) {
      return { error: "Internal-historical benchmarks need a source period range." };
    }
    const { data: periods } = await actor.supabase
      .from("reporting_periods")
      .select("id, label, start_date, end_date")
      .eq("organization_id", organizationId)
      .gte("start_date", sourcePeriodFrom)
      .lte("end_date", sourcePeriodTo)
      .order("start_date");
    if (!periods || periods.length === 0) {
      return { error: "No reporting periods fall inside the cited source range." };
    }
    const scope = {
      departmentId: scopeLevel === "department" ? (departmentId ?? undefined) : undefined,
      trainerId: scopeLevel === "trainer" ? (trainerId ?? undefined) : undefined,
    };
    const values: { label: string; value: number }[] = [];
    const session = await IntelligenceSession.create(
      actor,
      organizationId,
      periods[0].start_date,
      periods[periods.length - 1].end_date,
    );
    for (const period of periods) {
      const result = session.getMetricForWindow(
        metricId,
        { dateFrom: period.start_date, dateTo: period.end_date },
        scope,
      );
      if (result.value !== null && ["healthy", "incomplete"].includes(result.health)) {
        values.push({ label: period.label, value: result.value });
      }
    }
    if (values.length === 0) {
      return {
        error:
          "No healthy engine values exist in the cited range — a benchmark cannot be built from unavailable data.",
      };
    }
    value =
      sourceType === "org_historical_best"
        ? Math.max(...values.map((v) => v.value))
        : median(values.map((v) => v.value));
    evidence = `Computed by engine ${definition.version} from ${values.length} reporting period(s) ${sourcePeriodFrom} – ${sourcePeriodTo} (${values.map((v) => v.label).join(", ")}); rule: ${sourceType === "org_historical_best" ? "best value" : "median"}.`;
  } else if (sourceType === "internal_standard" || sourceType === "external_reference") {
    const rawValue = String(formData.get("value") ?? "").trim();
    const parsed = Number(rawValue);
    if (!rawValue || !Number.isSafeInteger(parsed)) {
      return { error: "Enter the benchmark value in the metric's native unit (integer)." };
    }
    value = parsed;
    evidence = String(formData.get("evidence") ?? "").trim();
    if (evidence.length < 10) {
      return {
        error:
          sourceType === "external_reference"
            ? "External benchmarks require a citation of the owner-provided source document."
            : "Internal standards require a written justification (who set it and why).",
      };
    }
  } else {
    return { error: "Choose a benchmark source type." };
  }

  const { data: created, error } = await actor.supabase
    .from("performance_benchmarks")
    .insert({
      organization_id: organizationId,
      name,
      metric_id: metricId,
      metric_version: definition.version,
      metric_unit: definition.unit,
      scope_level: scopeLevel,
      department_id: scopeLevel === "department" ? departmentId : null,
      trainer_id: scopeLevel === "trainer" ? trainerId : null,
      service_id: null,
      source_type: sourceType,
      value,
      evidence,
      source_period_from: sourcePeriodFrom,
      source_period_to: sourcePeriodTo,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      notes: String(formData.get("notes") ?? "").trim() || null,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { error: `Could not create the benchmark (${error?.message ?? "unknown"}).` };
  }
  await writeAudit(actor, {
    organizationId,
    entityType: "performance_benchmark",
    entityId: created.id,
    action: "benchmark_created",
    metadata: { metric_id: metricId, source_type: sourceType },
  });
  revalidatePath("/performance-operations/analytics/benchmarks");
  return { message: "Benchmark created as a draft — it participates in comparisons once approved." };
}

async function transitionBenchmark(
  benchmarkId: string,
  toStatus: "approved" | "deprecated" | "archived",
  auditAction: string,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const { data: benchmark } = await actor.supabase
    .from("performance_benchmarks")
    .select("id, organization_id, status")
    .eq("id", benchmarkId)
    .maybeSingle();
  if (!benchmark) return { error: "Benchmark not found." };
  const { error } = await actor.supabase
    .from("performance_benchmarks")
    .update({ status: toStatus })
    .eq("id", benchmarkId)
    .eq("status", benchmark.status);
  if (error) {
    if (error.message.includes("benchmark_forbidden")) {
      return { error: "You do not have the permission this transition requires." };
    }
    if (error.message.includes("benchmark_immutable") || error.message.includes("benchmark_transition_invalid")) {
      return { error: "That change is not allowed from the benchmark's current state." };
    }
    return { error: `Could not update the benchmark (${error.message.slice(0, 120)}).` };
  }
  await writeAudit(actor, {
    organizationId: benchmark.organization_id,
    entityType: "performance_benchmark",
    entityId: benchmarkId,
    action: auditAction,
    metadata: { from_status: benchmark.status, to_status: toStatus },
  });
  revalidatePath("/performance-operations/analytics/benchmarks");
  return { message: `Benchmark ${toStatus}.` };
}

export async function approveBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionBenchmark(String(formData.get("benchmarkId") ?? ""), "approved", "benchmark_approved");
}

export async function deprecateBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionBenchmark(String(formData.get("benchmarkId") ?? ""), "deprecated", "benchmark_deprecated");
}

export async function archiveBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionBenchmark(String(formData.get("benchmarkId") ?? ""), "archived", "benchmark_archived");
}
