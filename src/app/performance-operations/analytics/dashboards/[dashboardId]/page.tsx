import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { renderDashboardWidget } from "@/lib/analytics/dashboards/render";
import { loadGoalRecords } from "@/lib/analytics/presentations/packages";
import { listDefinitions } from "@/lib/intelligence/catalog";
import { getMetricAnalyticsMetadata } from "@/lib/analytics/shared/metadata";
import { FinalityBadge } from "../../shared/comparison-badges";
import { DashboardBuilder } from "../dashboard-forms";
import { DashboardWidgetView } from "./widget-view";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard detail: renders every widget through the analytics service
 * FOR THE VIEWER (shared dashboards re-resolve permissions per widget —
 * inaccessible widgets render unavailable, never leak). Owners also get
 * the builder controls.
 */
export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ dashboardId: string }>;
}) {
  const { dashboardId } = await params;
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Dashboard" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Dashboards render their widgets for the selected reporting period."
        />
      </div>
    );
  }
  const { service, window, actor, organizationId, can } = context;

  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("*")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard || dashboard.organization_id !== organizationId) notFound();

  const { data: widgets } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("*")
    .eq("dashboard_id", dashboardId)
    .order("position");

  const isOwner = dashboard.owner_id === actor.userId;
  const goals = can("goal:read") ? await loadGoalRecords(actor, organizationId) : [];

  // Resolve every widget per-viewer through the analytics service.
  const rendered = [];
  for (const widget of widgets ?? []) {
    rendered.push({
      widget,
      view: await renderDashboardWidget(service, actor, window, widget, goals),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={dashboard.name}
        description={`${dashboard.description || "Custom dashboard"} · ${window.label}${dashboard.shared_scope !== "personal" ? ` · shared (${dashboard.shared_scope})` : ""}${dashboard.status === "archived" ? " · ARCHIVED" : ""}`}
        actions={
          <span className="flex items-center gap-2">
            <FinalityBadge window={window} />
            <Link
              href="/performance-operations/analytics/dashboards"
              className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              ← Dashboards
            </Link>
          </span>
        }
      />

      {isOwner && dashboard.status !== "archived" && (
        <DashboardBuilder
          dashboardId={dashboardId}
          organizationId={organizationId}
          canShareDepartment={can("dashboard:share_department")}
          canShareOrganization={can("dashboard:share_organization")}
          sharedScope={dashboard.shared_scope}
          goalOptions={goals
            .filter((g) => g.status === "active")
            .map((g) => ({ id: g.id, name: g.name }))}
          metricOptions={listDefinitions()
            .filter((d) => getMetricAnalyticsMetadata(d.id) !== null)
            .map((d) => ({ id: d.id, name: d.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
          departments={(
            await actor.supabase
              .from("departments")
              .select("id, name")
              .eq("organization_id", organizationId)
              .order("name")
          ).data ?? []}
        />
      )}

      {rendered.length === 0 ? (
        <EmptyState
          title="No widgets yet"
          description={
            isOwner
              ? "Add widgets above — metrics, comparisons, trends, goals, and benchmarks from the governed catalog."
              : "The owner has not added widgets to this dashboard yet."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-grid">
          {rendered.map(({ widget, view }) => (
            <DashboardWidgetView
              key={widget.id}
              widgetId={widget.id}
              widgetType={widget.widget_type}
              width={widget.width}
              view={view}
              isOwner={isOwner && dashboard.status !== "archived"}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Widgets resolve through the analytics service for each viewer — sharing a dashboard
        never grants access to data the viewer cannot read directly.
      </p>
    </div>
  );
}
