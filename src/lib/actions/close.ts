"use server";

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  actorCan,
  writeAudit,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
  type ActorContext,
} from "@/lib/actions/shared";
import { notifyPermissionHolders } from "@/lib/operations/notify";
import type { Json, Tables } from "@/lib/supabase/types";
import { evaluateCloseReadiness } from "@/lib/close/readiness";
import {
  buildManifestPayload,
  hashManifest,
  type ManifestExportRef,
} from "@/lib/close/manifest";
import {
  generateDepartmentPackage,
  generateExecutivePackage,
  generateImportReconciliationPackage,
  generatePayrollPackage,
  generateTrainerStatementsPackage,
} from "@/lib/close/packages";
import { buildCloseExport, type CloseExportType } from "@/lib/close/export-data";
import { INTELLIGENCE_VERSION } from "@/lib/intelligence/shared/types";

const CLOSE_PATH = "/performance-operations/period-close";

function revalidateClose(runId?: string): void {
  revalidatePath(CLOSE_PATH);
  if (runId) {
    for (const sub of ["", "/readiness", "/performance-operations/reports", "/exports", "/approval", "/manifest"]) {
      revalidatePath(`${CLOSE_PATH}/${runId}${sub}`);
    }
  }
}

async function loadRun(
  actor: ActorContext,
  runId: string,
): Promise<Tables<"period_close_runs"> | null> {
  const { data } = await actor.supabase
    .from("period_close_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  return data;
}

/* ------------------------------------------------------------- create */

export async function createCloseRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organization_id") ?? "");
  const periodId = String(formData.get("reporting_period_id") ?? "");
  if (!actorCan(actor, organizationId, "period_close:create")) return PERMISSION_DENIED;

  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, organization_id, status, label")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.organization_id !== organizationId) {
    return { error: "Reporting period not found in this organization." };
  }
  if (period.status !== "open") {
    return { error: `Only open periods can enter close review (current: '${period.status}').` };
  }

  const { data: created, error } = await actor.supabase
    .from("period_close_runs")
    .insert({
      organization_id: organizationId,
      reporting_period_id: periodId,
      initiated_by: actor.userId,
      source_cutoff_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: "A close run already exists for this period. Open it from the close dashboard." };
    }
    return { error: "Could not create the close run." };
  }
  await actor.supabase.from("period_close_events").insert({
    period_close_run_id: created.id,
    organization_id: organizationId,
    to_status: "close_review",
    actor_id: actor.userId,
  });
  await writeAudit(actor, {
    organizationId,
    entityType: "period_close_run",
    entityId: created.id,
    action: "period_close_run_created",
    metadata: { reporting_period_id: periodId, period_label: period.label },
  });
  await notifyPermissionHolders(actor, organizationId, "period_close:review", {
    category: "reporting",
    title: `Period close started: ${period.label}`,
    body: "Close review is underway — readiness evaluation and warnings need attention.",
    linkPath: `${CLOSE_PATH}/${created.id}`,
    entityType: "period_close_run",
    entityId: created.id,
  });
  revalidateClose(created.id);
  return { message: "Close run created.", data: { runId: created.id } };
}

/* ----------------------------------------------------------- readiness */

export async function evaluateReadiness(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:review")) {
    return PERMISSION_DENIED;
  }
  const evaluation = await evaluateCloseReadiness(actor, runId);
  if (!evaluation) return { error: "Close run not found." };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "period_close_run",
    entityId: run.id,
    action: "period_close_readiness_evaluated",
    metadata: {
      blocking_open: evaluation.summary.blockingOpen,
      warnings_open: evaluation.summary.warningsOpen,
    },
  });
  revalidateClose(runId);
  return {
    message: `Readiness evaluated: ${evaluation.summary.blockingOpen} blocking, ${evaluation.summary.warningsOpen} unacknowledged warning(s).`,
  };
}

export async function acknowledgeWarning(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const checkCode = String(formData.get("check_code") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:review")) {
    return PERMISSION_DENIED;
  }
  if (!["close_review", "ready_to_close"].includes(run.status)) {
    return { error: "Acknowledgements are frozen for this run." };
  }
  const { data: policy } = await actor.supabase
    .from("organization_close_policies")
    .select("require_ack_note")
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  if ((policy?.require_ack_note ?? true) && note.length < 3) {
    return { error: "An acknowledgement note is required." };
  }
  const { error } = await actor.supabase.from("period_close_acknowledgements").insert({
    period_close_run_id: run.id,
    organization_id: run.organization_id,
    check_code: checkCode,
    close_version: run.close_version,
    note,
    acknowledged_by: actor.userId,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "Already acknowledged." : "Could not acknowledge.",
    };
  }
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "period_close_run",
    entityId: run.id,
    action: "period_close_warning_acknowledged",
    metadata: { check_code: checkCode, close_version: run.close_version },
  });
  await evaluateCloseReadiness(actor, runId);
  revalidateClose(runId);
  return { message: "Warning acknowledged." };
}

/* ------------------------------------------------- review and approval */

export async function completeReview(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:review")) {
    return PERMISSION_DENIED;
  }
  if (run.status !== "close_review") {
    return { error: `Only runs in review can be completed (current: '${run.status}').` };
  }
  const evaluation = await evaluateCloseReadiness(actor, runId);
  if (!evaluation) return { error: "Close run not found." };
  if (!evaluation.summary.readyToClose) {
    return {
      error: `Not ready: ${evaluation.summary.blockingOpen} blocking issue(s) and ${evaluation.summary.warningsOpen} unacknowledged warning(s) remain.`,
    };
  }
  const { error } = await actor.supabase
    .from("period_close_runs")
    .update({
      status: "ready_to_close",
      reviewed_by: actor.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "close_review");
  if (error) return { error: "Could not complete the review." };
  await actor.supabase.from("period_close_events").insert({
    period_close_run_id: run.id,
    organization_id: run.organization_id,
    from_status: "close_review",
    to_status: "ready_to_close",
    actor_id: actor.userId,
  });
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "period_close_run",
    entityId: run.id,
    action: "period_close_review_completed",
  });
  await notifyPermissionHolders(actor, run.organization_id, "period_close:approve", {
    category: "reporting",
    title: "Period close awaiting approval",
    body: "Review is complete; the close needs an approver.",
    linkPath: `${CLOSE_PATH}/${run.id}/approval`,
    entityType: "period_close_run",
    entityId: run.id,
  });
  revalidateClose(runId);
  return { message: "Review complete — the run is ready for approval." };
}

export async function approveClose(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:approve")) {
    return PERMISSION_DENIED;
  }
  if (run.status !== "ready_to_close") {
    return { error: `Only ready runs can be approved (current: '${run.status}').` };
  }
  const { data: policy } = await actor.supabase
    .from("organization_close_policies")
    .select("allow_self_approval")
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  const allowSelf = policy?.allow_self_approval ?? false; // fails closed
  if (!allowSelf && run.initiated_by === actor.userId) {
    return {
      error:
        "Separation of duties: the close preparer cannot approve their own close (organization policy).",
    };
  }
  const evaluation = await evaluateCloseReadiness(actor, runId);
  if (!evaluation || !evaluation.summary.readyToClose) {
    return { error: "Readiness regressed — the run returned to review." };
  }
  const { error } = await actor.supabase
    .from("period_close_runs")
    .update({ approved_by: actor.userId, approved_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "ready_to_close");
  if (error) return { error: "Could not approve the close." };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "period_close_run",
    entityId: run.id,
    action: "period_close_approved",
  });
  await notifyPermissionHolders(actor, run.organization_id, "period_close:execute", {
    category: "reporting",
    title: "Period close approved",
    body: "The close is approved and can be executed.",
    linkPath: `${CLOSE_PATH}/${run.id}/approval`,
    entityType: "period_close_run",
    entityId: run.id,
  });
  revalidateClose(runId);
  return { message: "Close approved. It can now be executed." };
}

export async function revokeApproval(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:approve")) {
    return PERMISSION_DENIED;
  }
  if (run.status !== "ready_to_close" || !run.approved_by) {
    return { error: "No approval to revoke." };
  }
  if (reason.length < 5) return { error: "A reason (min 5 characters) is required." };
  const { error } = await actor.supabase
    .from("period_close_runs")
    .update({ approved_by: null, approved_at: null })
    .eq("id", runId)
    .eq("status", "ready_to_close");
  if (error) return { error: "Could not revoke the approval." };
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "period_close_run",
    entityId: run.id,
    action: "period_close_approval_revoked",
    metadata: { reason },
  });
  revalidateClose(runId);
  return { message: "Approval revoked." };
}

/* ------------------------------------------------------- final close */

export async function executeClose(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:execute")) {
    return PERMISSION_DENIED;
  }

  // Full readiness re-evaluation immediately before the transaction; the
  // RPC re-validates the race-sensitive core transactionally.
  const evaluation = await evaluateCloseReadiness(actor, runId);
  if (!evaluation) return { error: "Close run not found." };
  const current = evaluation.run;
  if (current.status !== "ready_to_close") {
    return { error: `The run is not ready to close (current: '${current.status}').` };
  }
  if (!current.approved_by) return { error: "The close has not been approved." };
  if (!evaluation.summary.readyToClose) {
    return { error: "Readiness regressed — resolve the new findings first." };
  }
  const period = evaluation.period;
  if (!period) return { error: "Reporting period not found." };
  if (!current.report_package_id) {
    return { error: "Generate the executive report package first." };
  }

  // ---- assemble the manifest from frozen references -------------------
  const [
    { data: organization },
    { data: ackRows },
    { data: exportRows },
    { data: packageRow },
    { data: activeBatchAppts },
    { data: reversedBatchAppts },
    { count: appointmentCount },
    { data: priorRuns },
    { data: statementsPackage },
  ] = await Promise.all([
    actor.supabase
      .from("organizations")
      .select("name")
      .eq("id", run.organization_id)
      .maybeSingle(),
    actor.supabase
      .from("period_close_acknowledgements")
      .select("check_code, acknowledged_by, note, created_at")
      .eq("period_close_run_id", run.id),
    actor.supabase
      .from("close_exports")
      .select("*")
      .eq("organization_id", run.organization_id)
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("superseded", false),
    actor.supabase
      .from("report_packages")
      .select("id, package_type, version, package_sha256")
      .eq("id", current.report_package_id)
      .maybeSingle(),
    actor.supabase
      .from("appointments")
      .select("import_batch_id")
      .eq("organization_id", run.organization_id)
      .eq("record_state", "active")
      .gte("appointment_date", period.start_date)
      .lte("appointment_date", period.end_date),
    actor.supabase
      .from("appointments")
      .select("import_batch_id")
      .eq("organization_id", run.organization_id)
      .eq("record_state", "reversed")
      .gte("appointment_date", period.start_date)
      .lte("appointment_date", period.end_date),
    actor.supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", run.organization_id)
      .eq("record_state", "active")
      .gte("appointment_date", period.start_date)
      .lte("appointment_date", period.end_date),
    actor.supabase
      .from("period_close_runs")
      .select("close_version, reopened_at, reopen_reason")
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("status", "superseded")
      .order("close_version"),
    actor.supabase
      .from("report_packages")
      .select("payload")
      .eq("organization_id", run.organization_id)
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("package_type", "trainer_statements")
      .eq("status", "ready")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!packageRow) return { error: "The referenced report package no longer exists." };

  // Latest version per export type only.
  const latestByType = new Map<string, Tables<"close_exports">>();
  for (const row of exportRows ?? []) {
    const existing = latestByType.get(row.export_type);
    if (!existing || row.version > existing.version) {
      latestByType.set(row.export_type, row);
    }
  }
  const exportRefs: ManifestExportRef[] = [...latestByType.values()].map((e) => ({
    id: e.id,
    export_type: e.export_type,
    file_name: e.file_name,
    version: e.version,
    sha256: e.sha256,
    row_count: e.row_count,
  }));

  const statementVersions =
    (statementsPackage?.payload as {
      statements?: { trainer_id: string; statement_sha256: string }[];
    } | null)?.statements?.map((s) => ({
      trainerId: s.trainer_id,
      sha256: s.statement_sha256,
    })) ?? null;

  const payrollForManifest = evaluation.finalizedPayrollRun
    ? {
        runId: evaluation.finalizedPayrollRun.id,
        calculationVersion: evaluation.finalizedPayrollRun.calculation_version,
        snapshotVersion: evaluation.payrollSnapshot?.version ?? null,
        snapshotSha256: evaluation.payrollSnapshot?.linesSha256 ?? null,
      }
    : null;

  const manifestPayload = buildManifestPayload({
    organizationId: run.organization_id,
    organizationName: organization?.name ?? "",
    period: {
      id: period.id,
      label: period.label,
      startDate: period.start_date,
      endDate: period.end_date,
    },
    closeRunId: run.id,
    closeVersion: current.close_version,
    sourceCutoffAt: current.source_cutoff_at,
    approvals: {
      initiatedBy: current.initiated_by,
      reviewedBy: current.reviewed_by,
      reviewedAt: current.reviewed_at,
      approvedBy: current.approved_by,
      approvedAt: current.approved_at,
    },
    acknowledgements: (ackRows ?? []).map((a) => ({
      checkCode: a.check_code,
      actorId: a.acknowledged_by,
      note: a.note,
      at: a.created_at,
    })),
    intelligenceVersion: INTELLIGENCE_VERSION,
    payroll: payrollForManifest,
    appointmentCount: appointmentCount ?? 0,
    importBatches: {
      included: [...new Set((activeBatchAppts ?? []).map((a) => a.import_batch_id))],
      reversed: [...new Set((reversedBatchAppts ?? []).map((a) => a.import_batch_id))],
    },
    reportPackage: {
      id: packageRow.id,
      type: packageRow.package_type,
      version: packageRow.version,
      sha256: packageRow.package_sha256,
    },
    exports: exportRefs,
    trainerStatementVersions: statementVersions,
    readinessChecks: evaluation.checks,
    supersedesCloseRunId: current.supersedes_close_run_id,
    reopenHistory: (priorRuns ?? []).map((p) => ({
      closeVersion: p.close_version,
      reopenedAt: p.reopened_at,
      reason: p.reopen_reason,
    })),
  });
  const manifestSha = hashManifest(manifestPayload);

  const { data, error } = await actor.supabase.rpc("execute_period_close", {
    p_run_id: runId,
    p_manifest: manifestPayload as Json,
    p_manifest_sha256: manifestSha,
  });
  if (error) {
    const code = error.message.split(":")[0];
    const friendly: Record<string, string> = {
      close_run_not_ready: "The run is not in the ready-to-close state.",
      close_not_approved: "The close has not been approved.",
      self_approval_forbidden:
        "Separation of duties: preparer and approver must differ (organization policy).",
      period_not_open: "The reporting period is not open.",
      blocking_issues_remain: "Blocking readiness issues remain.",
      pending_imports_remain: "Import batches are still pending — resolve them first.",
      payroll_not_finalized: "Payroll is not posted/locked as required by policy.",
      payroll_active_run_remains: "An unfinished payroll run remains for this period.",
      warnings_unacknowledged: "Unacknowledged warnings remain.",
      report_package_not_ready: "The report package is not ready.",
      exports_missing: "Required exports are missing.",
    };
    await writeAudit(actor, {
      organizationId: run.organization_id,
      entityType: "period_close_run",
      entityId: run.id,
      action: "period_close_failed",
      metadata: { code },
    });
    return { error: friendly[code] ?? `Close failed and rolled back (${code}).` };
  }

  await notifyPermissionHolders(actor, run.organization_id, "period_close:read", {
    category: "reporting",
    title: `Period closed: ${period.label}`,
    body: `Close v${current.close_version} completed; the manifest is frozen.`,
    linkPath: `${CLOSE_PATH}/${run.id}/manifest`,
    entityType: "period_close_run",
    entityId: run.id,
  });
  revalidateClose(runId);
  revalidatePath("/performance-operations/overview");
  const result = data as { manifest_sha256?: string } | null;
  return {
    message: `Period closed. Manifest ${result?.manifest_sha256?.slice(0, 12) ?? manifestSha.slice(0, 12)}… recorded.`,
  };
}

/* ------------------------------------------------- reopen / void ------ */

export async function reopenClose(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:reopen")) {
    return PERMISSION_DENIED;
  }
  if (reason.length < 5) return { error: "A reason (min 5 characters) is required." };
  const { data, error } = await actor.supabase.rpc("reopen_period_close", {
    p_run_id: runId,
    p_reason: reason,
  });
  if (error) {
    return {
      error: error.message.includes("not_closed")
        ? "Only completed closes can be reopened."
        : "Reopen failed and rolled back.",
    };
  }
  await notifyPermissionHolders(actor, run.organization_id, "period_close:read", {
    category: "reporting",
    severity: "warning",
    title: "Period reopened",
    body: `Close v${run.close_version} was superseded. Reason: ${reason}`,
    linkPath: `${CLOSE_PATH}/${String(data)}`,
    entityType: "period_close_run",
    entityId: String(data),
  });
  revalidateClose(runId);
  revalidateClose(String(data));
  return {
    message: "Period reopened. A new close cycle was created; re-approval and re-close are required.",
    data: { newRunId: String(data) },
  };
}

export async function voidClose(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:review")) {
    return PERMISSION_DENIED;
  }
  if (reason.length < 5) return { error: "A reason (min 5 characters) is required." };
  const { error } = await actor.supabase.rpc("void_period_close", {
    p_run_id: runId,
    p_reason: reason,
  });
  if (error) return { error: "Only pre-close runs can be voided." };
  revalidateClose(runId);
  return { message: "Close run voided." };
}

/* --------------------------------------------------- report packages */

export async function generatePackage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const packageType = String(formData.get("package_type") ?? "");
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "report_package:create")) {
    return PERMISSION_DENIED;
  }
  if (!["close_review", "ready_to_close"].includes(run.status)) {
    return { error: "Packages can only be generated before the close is executed." };
  }
  const { data: period } = await actor.supabase
    .from("reporting_periods")
    .select("id, label, start_date, end_date")
    .eq("id", run.reporting_period_id)
    .maybeSingle();
  if (!period) return { error: "Reporting period not found." };

  const params = {
    organizationId: run.organization_id,
    period,
    closeRunId: run.id,
  };

  let result;
  if (packageType === "executive") {
    result = await generateExecutivePackage(actor, params);
  } else if (packageType === "payroll") {
    result = await generatePayrollPackage(actor, params);
  } else if (packageType === "trainer_statements") {
    result = await generateTrainerStatementsPackage(actor, params);
  } else if (packageType === "import_reconciliation") {
    result = await generateImportReconciliationPackage(actor, params);
  } else if (packageType === "department") {
    const { data: departments } = await actor.supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", run.organization_id)
      .eq("status", "active")
      .order("name");
    let generated = 0;
    for (const dept of departments ?? []) {
      const deptResult = await generateDepartmentPackage(actor, {
        ...params,
        departmentId: dept.id,
        departmentName: dept.name,
      });
      if ("status" in deptResult && deptResult.status === "ready") generated++;
    }
    await evaluateCloseReadiness(actor, runId);
    revalidateClose(runId);
    return { message: `Generated ${generated} department package(s).` };
  } else {
    return { error: "Unknown package type." };
  }

  if ("error" in result) return { error: result.error };
  if (result.status === "failed") {
    await notifyPermissionHolders(actor, run.organization_id, "period_close:review", {
      category: "reporting",
      severity: "warning",
      title: `Report package failed: ${packageType}`,
      body: "Generation failed — the package is marked failed, never complete.",
      linkPath: `${CLOSE_PATH}/${run.id}/reports`,
      entityType: "report_package",
      entityId: result.id,
    });
    revalidateClose(runId);
    return { error: `Package generation failed: ${result.failureReason ?? "unknown"}.` };
  }

  await evaluateCloseReadiness(actor, runId);
  await notifyPermissionHolders(actor, run.organization_id, "period_close:review", {
    category: "reporting",
    title: `Report package ready: ${packageType} v${result.version}`,
    body: "The package is generated and frozen at this version.",
    linkPath: `${CLOSE_PATH}/${run.id}/reports`,
    entityType: "report_package",
    entityId: result.id,
  });
  revalidateClose(runId);
  return { message: `${packageType} package v${result.version} is ready.` };
}

/* ------------------------------------------------------------ exports */

export async function generateCloseExport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const runId = String(formData.get("run_id") ?? "");
  const exportType = String(formData.get("export_type") ?? "") as CloseExportType;
  const run = await loadRun(actor, runId);
  if (!run) return { error: "Close run not found." };
  if (!actorCan(actor, run.organization_id, "period_close:export")) {
    return PERMISSION_DENIED;
  }
  const [{ data: period }, { data: organization }] = await Promise.all([
    actor.supabase
      .from("reporting_periods")
      .select("id, label, start_date, end_date")
      .eq("id", run.reporting_period_id)
      .maybeSingle(),
    actor.supabase
      .from("organizations")
      .select("name")
      .eq("id", run.organization_id)
      .maybeSingle(),
  ]);
  if (!period) return { error: "Reporting period not found." };

  const built = await buildCloseExport(
    actor,
    run.organization_id,
    organization?.name ?? "",
    period,
    exportType,
  );
  if ("error" in built) {
    await notifyPermissionHolders(actor, run.organization_id, "period_close:review", {
      category: "reporting",
      severity: "warning",
      title: `Export generation failed: ${exportType}`,
      body: built.error,
      linkPath: `${CLOSE_PATH}/${run.id}/exports`,
      entityType: "period_close_run",
      entityId: run.id,
    });
    return { error: built.error };
  }

  const { data: prior } = await actor.supabase
    .from("close_exports")
    .select("id, version, superseded")
    .eq("organization_id", run.organization_id)
    .eq("reporting_period_id", run.reporting_period_id)
    .eq("export_type", exportType)
    .order("version", { ascending: false })
    .limit(1);
  const priorRow = prior?.[0];
  const { data: created, error } = await actor.supabase
    .from("close_exports")
    .insert({
      organization_id: run.organization_id,
      reporting_period_id: run.reporting_period_id,
      export_type: exportType,
      file_name: built.fileName,
      mime_type: built.mimeType,
      version: (priorRow?.version ?? 0) + 1,
      byte_size: built.document.byteSize,
      sha256: built.document.sha256,
      row_count: built.document.rowCount,
      payroll_run_id: built.payrollRunId,
      payroll_snapshot_version: built.payrollSnapshotVersion,
      generated_by: actor.userId,
    })
    .select("id, version")
    .single();
  if (error || !created) return { error: "Could not record the export." };
  if (priorRow && !priorRow.superseded) {
    await actor.supabase
      .from("close_exports")
      .update({ superseded: true })
      .eq("id", priorRow.id);
    await writeAudit(actor, {
      organizationId: run.organization_id,
      entityType: "close_export",
      entityId: priorRow.id,
      action: "close_export_superseded",
      metadata: { export_type: exportType },
    });
  }
  await writeAudit(actor, {
    organizationId: run.organization_id,
    entityType: "close_export",
    entityId: created.id,
    action: "close_export_generated",
    metadata: {
      export_type: exportType,
      version: created.version,
      sha256: built.document.sha256,
      row_count: built.document.rowCount,
    },
  });
  await evaluateCloseReadiness(actor, runId);
  revalidateClose(runId);
  return {
    message: `${exportType} v${created.version} generated (${built.document.rowCount} row(s), sha ${built.document.sha256.slice(0, 12)}…).`,
  };
}
