import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { buildMetricReportCsv } from "@/lib/reports/metric-report";

/**
 * Report CSV export — serializes engine MetricResults verbatim through
 * the SHARED metric-report builder (also used by scheduled execution, so
 * interactive and scheduled artifacts are byte-identical for identical
 * inputs). Records an export_events row.
 */
export async function GET() {
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // Resolve workspace + period exactly like the app shell (validated
  // server-side; cookies are requests, never trusted).
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    return NextResponse.json({ error: "no_workspace_selected" }, { status: 400 });
  }
  const organizationId = workspace.selection.organizationId;
  if (!hasPermissionInOrganization(workspace.memberships, organizationId, "appointment:read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const periods = await getPeriodContext(workspace);
  const selected = periods.selected;
  if (!selected) {
    return NextResponse.json({ error: "no_period_selected" }, { status: 400 });
  }

  const report = await buildMetricReportCsv(actor, organizationId, {
    id: selected.id,
    label: selected.label,
    start_date: selected.startDate,
    end_date: selected.endDate,
  });

  await actor.supabase.from("export_events").insert({
    organization_id: organizationId,
    export_type: "metric_report",
    source_page: "reports",
    format: "csv",
    engine_version: "intel-v1",
    metadata: { period_id: selected.id, metric_count: report.metricCount },
    generated_by: actor.userId,
  });

  return new NextResponse(report.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
