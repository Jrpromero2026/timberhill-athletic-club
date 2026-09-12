import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListCard, type ListRow } from "@/components/widgets/list-card";
import { TimelineCard } from "@/components/widgets/timeline-card";
import { Widget, WidgetEmpty } from "@/components/widgets/section";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { CLOSE_STATUS_LABEL, type CloseStatus } from "@/lib/close/transitions";
import { CLOSE_BADGE } from "./run-shell";

export const metadata: Metadata = { title: "Period close" };

/**
 * Close dashboard: run inventory, period states, and outstanding
 * blocking/warning totals — all from persisted run snapshots and period
 * rows. No UI metric calculations.
 */
export default async function PeriodClosePage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Period close" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Period close" description="Select a single workspace first." />
        <EmptyState
          title="Choose a workspace"
          description="Period close operates per organization."
        />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  if (!hasPermissionInOrganization(context.memberships, organizationId, "period_close:read")) {
    return <PermissionDenied title="Period close" />;
  }
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Period close" />;
  const canCreate = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "period_close:create",
  );

  const [{ data: runs }, { data: periods }, { data: events }] = await Promise.all([
    actor.supabase
      .from("period_close_runs")
      .select("*, reporting_periods ( label, start_date, end_date )")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(30),
    actor.supabase
      .from("reporting_periods")
      .select("id, label, status, start_date, end_date")
      .eq("organization_id", organizationId)
      .order("start_date", { ascending: false })
      .limit(12),
    actor.supabase
      .from("period_close_events")
      .select("id, to_status, reason, created_at, profiles:actor_id ( full_name, email )")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  interface RunRow {
    id: string;
    status: string;
    close_version: number;
    blocking_issue_count: number;
    warning_count: number;
    closed_at: string | null;
    reporting_periods: { label: string; start_date: string; end_date: string } | null;
  }
  const runRows = (runs ?? []) as unknown as RunRow[];
  const activeRuns = runRows.filter((r) =>
    ["close_review", "ready_to_close", "closing"].includes(r.status),
  );
  const closedRuns = runRows.filter((r) => r.status === "closed");
  const supersededRuns = runRows.filter((r) => r.status === "superseded");

  const runList = (rows: RunRow[]): ListRow[] =>
    rows.map((r) => ({
      key: r.id,
      label: `${r.reporting_periods?.label ?? "?"} · close v${r.close_version}`,
      sublabel:
        r.status === "closed"
          ? `closed ${r.closed_at?.slice(0, 10) ?? ""}`
          : `${r.blocking_issue_count} blocking · ${r.warning_count} warning(s)`,
      href: `/performance-operations/period-close/${r.id}`,
      status: {
        style: CLOSE_BADGE[r.status] ?? "draft",
        text: CLOSE_STATUS_LABEL[r.status as CloseStatus] ?? r.status,
      },
    }));

  interface EventRow {
    id: string;
    to_status: string;
    reason: string | null;
    created_at: string;
    profiles: { full_name: string | null; email: string } | null;
  }
  const timeline = ((events ?? []) as unknown as EventRow[]).map((e) => ({
    id: e.id,
    action: `close → ${e.to_status}${e.reason ? ` (${e.reason})` : ""}`,
    entityType: "period_close",
    actorName: e.profiles?.full_name || e.profiles?.email || "system",
    createdAt: e.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Period close"
        description={`${context.selected?.name ?? ""} · controlled end-of-period workflow: readiness → review → approval → close → frozen manifest.`}
        actions={
          canCreate ? (
            <Link
              href="/performance-operations/period-close/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Start close
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ListCard
            title="Active close runs"
            testId="close-active-runs"
            emptyReason="No close run in progress — start one when the period is ready."
            rows={runList(activeRuns)}
          />
          <ListCard
            title="Completed closes"
            testId="close-completed-runs"
            emptyReason="No period has been closed yet."
            rows={runList(closedRuns)}
          />
          {supersededRuns.length > 0 && (
            <ListCard
              title="Superseded closes (reopened)"
              testId="close-superseded-runs"
              emptyReason=""
              rows={runList(supersededRuns)}
            />
          )}
        </div>
        <div className="space-y-4">
          <Widget title="Reporting periods" testId="close-periods">
            {(periods ?? []).length === 0 ? (
              <WidgetEmpty reason="No reporting periods configured." />
            ) : (
              <ul className="divide-y divide-border">
                {(periods ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.label}</span>
                      <span className="text-xs text-ink-muted">
                        {p.start_date} – {p.end_date}
                      </span>
                    </span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Widget>
          <TimelineCard entries={timeline} title="Recent close activity" testId="close-timeline" />
        </div>
      </div>
    </div>
  );
}
