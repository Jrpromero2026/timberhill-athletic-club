/**
 * Report package generation. Packages freeze ENGINE OUTPUT and frozen
 * payroll evidence into versioned report_packages rows — no formulas
 * here. Regeneration creates a new version and supersedes the prior
 * ready version; failures are recorded as failed and never look done.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { writeAudit } from "@/lib/actions/shared";
import type { Json, Tables } from "@/lib/supabase/types";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { INTELLIGENCE_VERSION } from "@/lib/intelligence/shared/types";
import {
  buildTrainerStatementCsv,
  loadRunStatementContext,
  loadTrainerStatement,
} from "@/lib/payroll/statements";
import { sha256Hex, stableStringify } from "./manifest";

export type PackageType =
  | "executive"
  | "department"
  | "payroll"
  | "trainer_statements"
  | "import_reconciliation";

export interface PackageResult {
  id: string;
  version: number;
  status: "ready" | "failed";
  failureReason?: string;
}

/** Metric ids frozen into the executive package (health included). */
export const EXECUTIVE_PACKAGE_METRICS = [
  "appointments_total",
  "appointments_completed",
  "appointments_cancelled",
  "appointments_no_show",
  "completed_rate_bp",
  "cancellation_rate_bp",
  "no_show_rate_bp",
  "coaching_minutes",
  "schedule_utilization_bp",
  "revenue_listed_cents",
  "revenue_paid_cents",
  "revenue_eligible_cents",
  "revenue_recognized_cents",
  "revenue_per_session_cents",
  "revenue_per_hour_cents",
  "payroll_gross_cents",
  "payroll_pct_of_revenue_bp",
  "active_clients",
  "new_clients",
  "returning_clients",
  "client_retention_rate_bp",
] as const;

const READINESS_IDS = [
  "organization_readiness_bp",
  "trainer_assignment_coverage_bp",
  "compensation_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
  "import_health_bp",
  "payroll_readiness_bp",
];

interface GenerateParams {
  organizationId: string;
  period: { id: string; label: string; start_date: string; end_date: string };
  departmentId?: string | null;
  closeRunId?: string | null;
}

async function nextVersion(
  actor: ActorContext,
  params: GenerateParams,
  packageType: PackageType,
): Promise<{ version: number; priorReadyId: string | null }> {
  let query = actor.supabase
    .from("report_packages")
    .select("id, version, status")
    .eq("organization_id", params.organizationId)
    .eq("reporting_period_id", params.period.id)
    .eq("package_type", packageType)
    .order("version", { ascending: false });
  query = params.departmentId
    ? query.eq("department_id", params.departmentId)
    : query.is("department_id", null);
  const { data } = await query.limit(5);
  const top = data?.[0];
  const priorReady = (data ?? []).find((p) => p.status === "ready") ?? null;
  return { version: (top?.version ?? 0) + 1, priorReadyId: priorReady?.id ?? null };
}

/**
 * Shared generation harness: insert generating row → build payload →
 * mark ready with hash (superseding the prior ready version) or failed.
 */
async function generate(
  actor: ActorContext,
  params: GenerateParams,
  packageType: PackageType,
  payrollRef: { runId: string; snapshotVersion: number | null } | null,
  build: () => Promise<{ payload: Record<string, unknown>; warnings: string[] }>,
): Promise<PackageResult | { error: string }> {
  const { version, priorReadyId } = await nextVersion(actor, params, packageType);
  const { data: created, error: insertError } = await actor.supabase
    .from("report_packages")
    .insert({
      organization_id: params.organizationId,
      reporting_period_id: params.period.id,
      package_type: packageType,
      department_id: params.departmentId ?? null,
      version,
      status: "generating",
      generated_by: actor.userId,
      intelligence_version: INTELLIGENCE_VERSION,
      payroll_run_id: payrollRef?.runId ?? null,
      payroll_snapshot_version: payrollRef?.snapshotVersion ?? null,
      supersedes_package_id: priorReadyId,
      filters: {
        period_id: params.period.id,
        department_id: params.departmentId ?? null,
      } as Json,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return { error: `Could not start package generation (${insertError?.code ?? "?"}).` };
  }

  try {
    const { payload, warnings } = await build();
    const packageSha = sha256Hex(stableStringify(payload));
    const { error: readyError } = await actor.supabase
      .from("report_packages")
      .update({
        status: "ready",
        payload: payload as Json,
        warnings: warnings as unknown as Json,
        package_sha256: packageSha,
      })
      .eq("id", created.id)
      .eq("status", "generating");
    if (readyError) throw new Error(`package_finalize_failed:${readyError.code}`);

    if (priorReadyId) {
      await actor.supabase
        .from("report_packages")
        .update({ status: "superseded", superseded_by_package_id: created.id })
        .eq("id", priorReadyId)
        .eq("status", "ready");
    }
    await writeAudit(actor, {
      organizationId: params.organizationId,
      entityType: "report_package",
      entityId: created.id,
      action: "report_package_generated",
      metadata: { package_type: packageType, version, sha256: packageSha },
    });
    return { id: created.id, version, status: "ready" };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.slice(0, 200) : "generation_failed";
    await actor.supabase
      .from("report_packages")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", created.id)
      .eq("status", "generating");
    await writeAudit(actor, {
      organizationId: params.organizationId,
      entityType: "report_package",
      entityId: created.id,
      action: "report_package_failed",
      metadata: { package_type: packageType, version, reason },
    });
    return { id: created.id, version, status: "failed", failureReason: reason };
  }
}

/* ------------------------------------------------- source-fact loaders */

async function loadFinalizedPayroll(
  actor: ActorContext,
  periodId: string,
): Promise<{
  run: Tables<"payroll_runs">;
  snapshot: { version: number; sha256: string } | null;
} | null> {
  const { data: runs } = await actor.supabase
    .from("payroll_runs")
    .select("*")
    .eq("reporting_period_id", periodId)
    .in("status", ["posted", "locked"])
    .limit(1);
  const run = runs?.[0];
  if (!run) return null;
  const { data: snapshot } = await actor.supabase
    .from("payroll_snapshots")
    .select("snapshot_version, lines_sha256")
    .eq("payroll_run_id", run.id)
    .order("snapshot_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    run,
    snapshot: snapshot
      ? { version: snapshot.snapshot_version, sha256: snapshot.lines_sha256 }
      : null,
  };
}

function metricResultsFor(
  session: IntelligenceSession,
  ids: readonly string[],
  scope: { departmentId?: string } = {},
) {
  return ids.map((id) => {
    const r = session.getMetric(id, scope);
    return {
      metric_id: r.metricId,
      value: r.value,
      unit: r.unit,
      health: r.health,
      reason: r.reasons[0] ?? null,
      warning: r.warnings[0] ?? null,
    };
  });
}

function breakdownFor(
  session: IntelligenceSession,
  metricId: string,
  groupBy: "department" | "trainer" | "service",
  scope: { departmentId?: string } = {},
) {
  const b = session.getBreakdown(metricId, groupBy, scope);
  return b.rows.map((row) => ({ key: row.key, label: row.label, value: row.value }));
}

async function importReconciliationRows(
  actor: ActorContext,
  organizationId: string,
  period: { start_date: string; end_date: string },
) {
  // Batches contributing appointments (active OR reversed) to the period.
  const { data: appts } = await actor.supabase
    .from("appointments")
    .select("import_batch_id, record_state")
    .eq("organization_id", organizationId)
    .gte("appointment_date", period.start_date)
    .lte("appointment_date", period.end_date);
  const contribution = new Map<string, { active: number; reversed: number }>();
  for (const a of appts ?? []) {
    const entry = contribution.get(a.import_batch_id) ?? { active: 0, reversed: 0 };
    if (a.record_state === "active") entry.active++;
    else if (a.record_state === "reversed") entry.reversed++;
    contribution.set(a.import_batch_id, entry);
  }
  const batchIds = [...contribution.keys()];
  if (batchIds.length === 0) return [];
  const { data: batches } = await actor.supabase
    .from("import_batches")
    .select(
      "id, source, original_filename, status, uploaded_at, posted_at, reversed_at, total_row_count, posted_row_count, excluded_row_count, duplicate_row_count, warning_row_count, blocked_row_count, file_hash, uploader:profiles!import_batches_uploaded_by_fkey ( full_name, email )",
    )
    .in("id", batchIds);
  return (batches ?? [])
    .map((b) => {
      const uploader = b.uploader as unknown as {
        full_name: string | null;
        email: string;
      } | null;
      const contrib = contribution.get(b.id)!;
      return {
        batch_id: b.id,
        source: b.source,
        file_name: b.original_filename,
        file_sha256: b.file_hash,
        status: b.status,
        uploaded_at: b.uploaded_at,
        uploaded_by: uploader?.full_name || uploader?.email || null,
        posted_at: b.posted_at,
        reversed_at: b.reversed_at,
        total_rows: b.total_row_count,
        posted_rows: b.posted_row_count,
        excluded_rows: b.excluded_row_count,
        duplicate_rows: b.duplicate_row_count,
        warning_rows: b.warning_row_count,
        blocked_rows: b.blocked_row_count,
        appointments_active_in_period: contrib.active,
        appointments_reversed_in_period: contrib.reversed,
      };
    })
    .sort((a, b) => a.file_name.localeCompare(b.file_name));
}

/* -------------------------------------------------- package generators */

export async function generateExecutivePackage(
  actor: ActorContext,
  params: GenerateParams,
): Promise<PackageResult | { error: string }> {
  const payroll = await loadFinalizedPayroll(actor, params.period.id);
  return generate(
    actor,
    params,
    "executive",
    payroll ? { runId: payroll.run.id, snapshotVersion: payroll.snapshot?.version ?? null } : null,
    async () => {
      const session = await IntelligenceSession.create(
        actor,
        params.organizationId,
        params.period.start_date,
        params.period.end_date,
      );
      const metrics = metricResultsFor(session, EXECUTIVE_PACKAGE_METRICS);
      const summary = session.getExecutiveSummary();
      const warnings: string[] = [];
      const unavailable = metrics.filter((m) =>
        ["unavailable", "configuration_missing", "waiting_for_payroll", "waiting_for_imports"].includes(m.health),
      );
      if (!payroll) warnings.push("No finalized payroll run exists for this period.");
      return {
        payload: {
          section_order: [
            "period",
            "metrics",
            "readiness",
            "departments",
            "trainers",
            "payroll",
            "imports",
            "summaries",
            "unavailable_metrics",
          ],
          period: {
            id: params.period.id,
            label: params.period.label,
            start_date: params.period.start_date,
            end_date: params.period.end_date,
          },
          metrics,
          readiness: metricResultsFor(session, READINESS_IDS),
          departments: {
            sessions: breakdownFor(session, "appointments_completed", "department"),
            coaching_minutes: breakdownFor(session, "coaching_minutes", "department"),
            revenue_listed_cents: breakdownFor(session, "revenue_listed_cents", "department"),
            active_clients: breakdownFor(session, "active_clients", "department"),
          },
          trainers: {
            sessions: breakdownFor(session, "appointments_completed", "trainer"),
            coaching_minutes: breakdownFor(session, "coaching_minutes", "trainer"),
            revenue_listed_cents: breakdownFor(session, "revenue_listed_cents", "trainer"),
            payroll_gross_cents: breakdownFor(session, "payroll_gross_cents", "trainer"),
          },
          payroll: payroll
            ? {
                run_id: payroll.run.id,
                run_name: payroll.run.name,
                status: payroll.run.status,
                calculation_version: payroll.run.calculation_version,
                final_total_cents: payroll.run.final_compensation_total_cents,
                snapshot_version: payroll.snapshot?.version ?? null,
                snapshot_sha256: payroll.snapshot?.sha256 ?? null,
              }
            : null,
          imports: await importReconciliationRows(actor, params.organizationId, params.period),
          summaries: summary.allowed
            ? summary.items.map((i) => ({
                code: i.code,
                headline: i.headline,
                subject: i.subject,
                value: i.value,
                unit: i.unit,
                health: i.health,
              }))
            : [],
          unavailable_metrics: unavailable.map((m) => ({
            metric_id: m.metric_id,
            health: m.health,
            reason: m.reason,
          })),
        },
        warnings,
      };
    },
  );
}

export async function generateDepartmentPackage(
  actor: ActorContext,
  params: GenerateParams & { departmentId: string; departmentName: string },
): Promise<PackageResult | { error: string }> {
  return generate(actor, params, "department", null, async () => {
    const session = await IntelligenceSession.create(
      actor,
      params.organizationId,
      params.period.start_date,
      params.period.end_date,
    );
    const scope = { departmentId: params.departmentId };
    const trend = session.getTrend("appointments_completed", "weekly", scope);
    return {
      payload: {
        department: { id: params.departmentId, name: params.departmentName },
        period: { id: params.period.id, label: params.period.label },
        metrics: metricResultsFor(
          session,
          [
            "appointments_completed",
            "appointments_cancelled",
            "appointments_no_show",
            "cancellation_rate_bp",
            "no_show_rate_bp",
            "coaching_minutes",
            "revenue_listed_cents",
            "revenue_paid_cents",
            "average_session_value_cents",
            "schedule_utilization_bp",
            "active_clients",
            "active_trainers",
          ],
          scope,
        ),
        trainers: breakdownFor(session, "appointments_completed", "trainer", scope),
        trainer_revenue: breakdownFor(session, "revenue_listed_cents", "trainer", scope),
        services: breakdownFor(session, "appointments_completed", "service", scope),
        weekly_sessions_trend: trend.points.map((p) => ({
          key: p.key,
          value: p.value,
          health: p.health,
        })),
        previous_period_change_bp: trend.comparisons[0]?.changeBp ?? null,
      },
      warnings: [],
    };
  });
}

export async function generatePayrollPackage(
  actor: ActorContext,
  params: GenerateParams,
): Promise<PackageResult | { error: string }> {
  const payroll = await loadFinalizedPayroll(actor, params.period.id);
  if (!payroll) {
    return { error: "No posted or locked payroll run exists for this period." };
  }
  return generate(
    actor,
    params,
    "payroll",
    { runId: payroll.run.id, snapshotVersion: payroll.snapshot?.version ?? null },
    async () => {
      const [summariesRes, adjustmentsRes, timeRes, eventsRes, issuesRes] =
        await Promise.all([
          actor.supabase
            .from("payroll_trainer_summaries")
            .select("*")
            .eq("payroll_run_id", payroll.run.id),
          actor.supabase
            .from("payroll_adjustments")
            .select("id, trainer_id, adjustment_type, amount_cents, reason, status, approved_at")
            .eq("reporting_period_id", params.period.id)
            .in("status", ["approved", "included"]),
          actor.supabase
            .from("manual_time_entries")
            .select("id, trainer_id, work_date, work_category, approved_minutes, status")
            .eq("reporting_period_id", params.period.id)
            .in("status", ["approved", "included"]),
          actor.supabase
            .from("payroll_run_events")
            .select("from_status, to_status, reason, created_at")
            .eq("payroll_run_id", payroll.run.id)
            .order("created_at"),
          actor.supabase
            .from("payroll_issues")
            .select("code, severity, resolution_status, message")
            .eq("payroll_run_id", payroll.run.id)
            .neq("resolution_status", "resolved"),
        ]);
      const summaries = summariesRes.data ?? [];
      const trainerIds = summaries.map((s) => s.trainer_id);
      const trainerNames = new Map<string, string>();
      if (trainerIds.length > 0) {
        const { data: trainers } = await actor.supabase
          .from("trainers")
          .select("id, display_name")
          .in("id", trainerIds);
        for (const t of trainers ?? []) trainerNames.set(t.id, t.display_name);
      }
      const registerTotal = summaries.reduce(
        (n, s) => n + s.final_gross_compensation_cents,
        0,
      );
      return {
        payload: {
          run: {
            id: payroll.run.id,
            name: payroll.run.name,
            status: payroll.run.status,
            calculation_version: payroll.run.calculation_version,
            approved_at: payroll.run.approved_at,
            posted_at: payroll.run.posted_at,
            locked_at: payroll.run.locked_at,
            final_total_cents: payroll.run.final_compensation_total_cents,
          },
          snapshot: payroll.snapshot,
          register: summaries
            .map((s) => ({
              trainer_id: s.trainer_id,
              trainer: trainerNames.get(s.trainer_id) ?? s.trainer_id,
              commission_cents: s.commission_compensation_cents,
              flat_cents: s.flat_rate_compensation_cents,
              hourly_cents: s.hourly_compensation_cents,
              team_cents: s.team_compensation_cents,
              bonus_cents: s.bonus_total_cents,
              deduction_cents: s.deduction_total_cents,
              adjustment_cents: s.adjustment_total_cents,
              final_gross_cents: s.final_gross_compensation_cents,
            }))
            .sort((a, b) => a.trainer.localeCompare(b.trainer)),
          adjustments: (adjustmentsRes.data ?? []).map((a) => ({
            id: a.id,
            trainer: trainerNames.get(a.trainer_id) ?? a.trainer_id,
            type: a.adjustment_type,
            amount_cents: a.amount_cents,
            reason: a.reason,
            status: a.status,
          })),
          manual_time: (timeRes.data ?? []).map((t) => ({
            id: t.id,
            trainer: trainerNames.get(t.trainer_id) ?? t.trainer_id,
            work_date: t.work_date,
            category: t.work_category,
            approved_minutes: t.approved_minutes,
            status: t.status,
          })),
          history: eventsRes.data ?? [],
          open_warnings: issuesRes.data ?? [],
          reconciliation: {
            register_total_cents: registerTotal,
            run_total_cents: payroll.run.final_compensation_total_cents,
            match: registerTotal === payroll.run.final_compensation_total_cents,
          },
        },
        warnings:
          registerTotal === payroll.run.final_compensation_total_cents
            ? []
            : ["Register total does not equal the run total — investigate before closing."],
      };
    },
  );
}

export async function generateTrainerStatementsPackage(
  actor: ActorContext,
  params: GenerateParams,
): Promise<PackageResult | { error: string }> {
  const payroll = await loadFinalizedPayroll(actor, params.period.id);
  if (!payroll) {
    return { error: "No posted or locked payroll run exists for this period." };
  }
  return generate(
    actor,
    params,
    "trainer_statements",
    { runId: payroll.run.id, snapshotVersion: payroll.snapshot?.version ?? null },
    async () => {
      const context = await loadRunStatementContext(actor, payroll.run.id);
      if (!context) throw new Error("statement_context_unavailable");
      const statements: {
        trainer_id: string;
        trainer: string;
        final_gross_cents: number;
        statement_sha256: string;
        statement_path: string;
      }[] = [];
      // Sequential per-trainer statement builds (small rosters; documented
      // as the synchronous-generation limit for large orgs).
      for (const summary of context.summaries) {
        const statement = await loadTrainerStatement(
          actor,
          payroll.run.id,
          summary.trainer_id,
        );
        if (!statement) continue;
        const csv = buildTrainerStatementCsv(context, statement);
        statements.push({
          trainer_id: summary.trainer_id,
          trainer: summary.trainerName,
          final_gross_cents: summary.final_gross_compensation_cents,
          statement_sha256: sha256Hex(csv),
          statement_path: `/performance-operations/payroll/${payroll.run.id}/statements/${summary.trainer_id}`,
        });
      }
      return {
        payload: {
          run_id: payroll.run.id,
          snapshot: payroll.snapshot,
          statement_count: statements.length,
          statements: statements.sort((a, b) => a.trainer.localeCompare(b.trainer)),
          outputs: {
            individual_pdf: "browser print view per statement (statement_path)",
            csv_register: "trainer_statement_register_csv export",
            combined_pdf: "not built — documented limitation",
            zip_archive: "not built — documented limitation",
          },
        },
        warnings: [],
      };
    },
  );
}

export async function generateImportReconciliationPackage(
  actor: ActorContext,
  params: GenerateParams,
): Promise<PackageResult | { error: string }> {
  return generate(actor, params, "import_reconciliation", null, async () => {
    const rows = await importReconciliationRows(
      actor,
      params.organizationId,
      params.period,
    );
    return {
      payload: {
        period: { id: params.period.id, label: params.period.label },
        batch_count: rows.length,
        batches: rows,
        evidence_note:
          "Original source files remain in private storage; access via signed URLs from the import batch page only.",
      },
      warnings: rows.length === 0 ? ["No import batches touch this period."] : [],
    };
  });
}
