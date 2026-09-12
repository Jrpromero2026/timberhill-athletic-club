import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { loadAnalyticsContext } from "@/lib/analytics/shared/context";
import { NewDashboardForm, DashboardListActions } from "./dashboard-forms";

export const metadata: Metadata = { title: "Dashboards" };

/**
 * Dashboard list: personal + shared dashboards visible under live
 * permissions, with defaults, duplication, and archive. Widgets render on
 * the dashboard's own page.
 */
export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const context = await loadAnalyticsContext();
  if (context.state === "no_workspace" || context.state === "no_actor" || context.state === "denied") {
    return <PermissionDenied title="Dashboards" />;
  }
  if (context.state === "no_period") {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboards" description="Select a reporting period first." />
        <EmptyState
          title="Select a reporting period"
          description="Dashboards render their widgets for the selected reporting period."
        />
      </div>
    );
  }
  const { actor, organizationId, can } = context;
  const showArchived = show === "archived";

  const [{ data: dashboards }, { data: defaults }] = await Promise.all([
    actor.supabase
      .from("analytics_dashboards")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", showArchived ? "archived" : "active")
      .order("updated_at", { ascending: false }),
    actor.supabase
      .from("analytics_dashboard_defaults")
      .select("dashboard_id, scope, profile_id")
      .eq("organization_id", organizationId),
  ]);

  const personalDefault = (defaults ?? []).find(
    (d) => d.scope === "personal" && d.profile_id === actor.userId,
  )?.dashboard_id;
  const orgDefault = (defaults ?? []).find((d) => d.scope === "organization")?.dashboard_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboards"
        description="Governed compositions of catalog metrics, comparisons, goals, and benchmarks. Shared dashboards never bypass live permissions."
        actions={
          <Link
            href={`/performance-operations/analytics/dashboards?show=${showArchived ? "active" : "archived"}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            {showArchived ? "Show active" : "Show archived"}
          </Link>
        }
      />

      {can("dashboard:create") && !showArchived && (
        <NewDashboardForm organizationId={organizationId} />
      )}

      {(dashboards ?? []).length === 0 ? (
        <EmptyState
          title={showArchived ? "No archived dashboards" : "No dashboards yet"}
          description={
            showArchived
              ? "Archived dashboards keep their history for report packages."
              : "Create a personal dashboard and add widgets from the governed catalog."
          }
        />
      ) : (
        <ul
          className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm"
          data-testid="dashboard-list"
        >
          {(dashboards ?? []).map((dashboard) => {
            const isOwner = dashboard.owner_id === actor.userId;
            return (
              <li
                key={dashboard.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                data-testid={`dashboard-${dashboard.id}`}
                data-shared-scope={dashboard.shared_scope}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    <Link
                      href={`/performance-operations/analytics/dashboards/${dashboard.id}`}
                      className="truncate hover:text-accent"
                    >
                      {dashboard.name}
                    </Link>
                    {dashboard.id === personalDefault && (
                      <span className="rounded bg-accent-soft px-1.5 text-[10px] font-bold uppercase text-accent">
                        my default
                      </span>
                    )}
                    {dashboard.id === orgDefault && (
                      <span className="rounded bg-info-soft px-1.5 text-[10px] font-bold uppercase text-info">
                        org default
                      </span>
                    )}
                    {dashboard.shared_scope !== "personal" && (
                      <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
                        {dashboard.shared_scope}
                      </span>
                    )}
                    {!isOwner && (
                      <span className="rounded bg-surface-sunken px-1.5 text-[10px] uppercase text-ink-muted">
                        shared with you
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {dashboard.description || "No description"} · updated{" "}
                    {dashboard.updated_at.slice(0, 10)}
                  </p>
                </div>
                <DashboardListActions
                  dashboardId={dashboard.id}
                  isOwner={isOwner}
                  isArchived={dashboard.status === "archived"}
                  canCreate={can("dashboard:create")}
                  canSetOrgDefault={can("dashboard:set_default")}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
