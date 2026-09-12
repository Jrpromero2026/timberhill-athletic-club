import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { AnalyticsService } from "@/lib/analytics/queries/service";
import {
  buildBreakdownSummaryDataset,
  buildGoalProgressDataset,
  buildBenchmarkComparisonDataset,
  buildMetricTimeSeriesDataset,
  canExportDatasets,
  recordDatasetExport,
  TIME_SERIES_METRICS,
  type DatasetExport,
} from "@/lib/analytics/exports/datasets";

/**
 * Dataset export route: authorization → analytics service → versioned CSV
 * with formula protection and hash — the export event records who, what,
 * and the content hash.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const datasetKey = url.searchParams.get("dataset") ?? "";

  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    return NextResponse.json({ error: "Select a workspace first." }, { status: 400 });
  }
  const organizationId = workspace.selection.organizationId;
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canExportDatasets(actor, organizationId)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const period = await getPeriodContext(workspace);
  if (!period.selected) {
    return NextResponse.json({ error: "Select a reporting period first." }, { status: 400 });
  }
  const serviceOrDenied = await AnalyticsService.create(actor, organizationId);
  if ("denied" in serviceOrDenied) {
    return NextResponse.json({ error: serviceOrDenied.denied }, { status: 403 });
  }
  const service = serviceOrDenied;
  const window = service.periodWindow(period.selected.id);
  if (!window) {
    return NextResponse.json({ error: "Reporting period not found." }, { status: 400 });
  }

  let artifact: DatasetExport;
  if (datasetKey === "metric_time_series") {
    const rolling = service.rollingPeriods(window, 12);
    artifact = await buildMetricTimeSeriesDataset(
      service,
      rolling.ok ? [...rolling.windows].reverse() : [window],
    );
  } else if (datasetKey === "department_period_summary") {
    artifact = await buildBreakdownSummaryDataset(service, window, "department", TIME_SERIES_METRICS);
  } else if (datasetKey === "trainer_period_summary") {
    // No payroll amounts in trainer analytics datasets — payroll exports
    // stay in the payroll domain with their own controls.
    artifact = await buildBreakdownSummaryDataset(
      service,
      window,
      "trainer",
      TIME_SERIES_METRICS.filter((id) => !id.startsWith("payroll_")),
    );
  } else if (datasetKey === "service_period_summary") {
    artifact = await buildBreakdownSummaryDataset(
      service,
      window,
      "service",
      ["appointments_completed", "coaching_minutes", "revenue_listed_cents"],
    );
  } else if (datasetKey === "goal_progress") {
    artifact = await buildGoalProgressDataset(service, actor, window);
  } else if (datasetKey === "benchmark_comparison") {
    artifact = await buildBenchmarkComparisonDataset(service, actor, window);
  } else {
    return NextResponse.json({ error: "Unknown dataset." }, { status: 400 });
  }

  await recordDatasetExport(actor, organizationId, datasetKey, artifact.document);

  return new Response(artifact.document.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
      "X-Export-Sha256": artifact.document.sha256,
      "X-Dataset-Version": "analytics-export-v1",
    },
  });
}
