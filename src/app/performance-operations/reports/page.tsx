import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { MetricCard } from "@/components/widgets/metric-card";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { QuickReport } from "./quick-report";
import {
  SaveCurrentReportForm,
  SavedViewRowActions,
  SavedViewSharingControls,
} from "./saved-view-forms";
import {
  NewScheduledReportForm,
  ScheduledExecutionControls,
  ScheduledReportRowActions,
} from "./scheduled-forms";

export const metadata: Metadata = { title: "Reports" };

/**
 * Report Center: quick report (engine-driven), saved views (personal +
 * organization-shared, with defaults that auto-apply the period), scheduled
 * report DEFINITIONS (execution intentionally not enabled — no scheduler
 * infrastructure exists), and export history. Everything calls the
 * IntelligenceSession — no business logic.
 */

const TABS = [
  ["quick", "Quick report"],
  ["saved", "Saved views"],
  ["scheduled", "Scheduled"],
  ["exports", "Export history"],
] as const;

const SELF_CARDS: [string, string][] = [
  ["appointments_completed", "Sessions completed"],
  ["appointments_cancelled", "Cancelled"],
  ["appointments_no_show", "No-shows"],
  ["completed_rate_bp", "Completed rate"],
  ["coaching_minutes", "Coaching time"],
  ["average_session_duration_minutes", "Avg session duration"],
  ["revenue_listed_cents", "Revenue (listed)"],
  ["revenue_per_hour_cents", "Revenue / hour"],
  ["payroll_gross_cents", "Gross payroll (posted)"],
  ["payroll_per_hour_cents", "Payroll / hour"],
  ["active_clients", "Active clients"],
  ["repeat_client_count", "Repeat clients"],
  ["schedule_utilization_bp", "Schedule utilization"],
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some(([key]) => key === rawTab) ? rawTab! : "quick";
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Reports" />;
  if (context.selection.kind !== "organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Select a single workspace first." />
        <EmptyState
          title="Choose a workspace"
          description="Reports are computed per organization by the Performance Intelligence Engine."
        />
      </div>
    );
  }
  const organizationId = context.selection.organizationId;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Reports" />;

  const canOrgRead = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "appointment:read",
  );
  const canSelfRead = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "trainer:read_self",
  );
  if (!canOrgRead && !canSelfRead) return <PermissionDenied title="Reports" />;

  const period = await getPeriodContext(context);
  let selectedPeriod = period.selected;
  let appliedDefaultView: string | null = null;
  if (!selectedPeriod && canOrgRead) {
    // Default-view auto-apply: when no period is chosen, fall back to the
    // actor's personal default view (then the organization default) for
    // this page, IF its stored period still exists in this organization.
    // Anything stale falls through safely to the period prompt.
    const { data: defaults } = await actor.supabase
      .from("saved_views")
      .select("id, name, owner_id, shared_scope, config")
      .eq("page", "reports")
      .eq("is_default", true)
      .or(
        `owner_id.eq.${actor.userId},and(shared_scope.eq.organization,organization_id.eq.${organizationId})`,
      );
    const ranked = (defaults ?? []).sort((a, b) => {
      const aPersonal = a.owner_id === actor.userId && a.shared_scope === "personal" ? 0 : 1;
      const bPersonal = b.owner_id === actor.userId && b.shared_scope === "personal" ? 0 : 1;
      return aPersonal - bPersonal;
    });
    for (const view of ranked) {
      const config = view.config as { reportingPeriodId?: string };
      const match = period.options.find((p) => p.id === config.reportingPeriodId);
      if (match) {
        selectedPeriod = match;
        appliedDefaultView = view.name;
        break;
      }
    }
  }
  if (!selectedPeriod) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Report Center"
          description="Operational reports from the Performance Intelligence Engine."
        />
        <EmptyState
          title="Select a reporting period"
          description="Choose a reporting period in the header — every report is computed for that window. Tip: mark a saved view as default and it will apply automatically."
        />
      </div>
    );
  }

  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    selectedPeriod.startDate,
    selectedPeriod.endDate,
  );
  const headerDescription = `${context.selected?.name ?? ""} · ${selectedPeriod.label} (${selectedPeriod.startDate} – ${selectedPeriod.endDate}) · engine intel-v1${appliedDefaultView ? ` · default view “${appliedDefaultView}” applied` : ""}`;

  /* ------------------------------ trainer self-service view ----------- */
  if (!canOrgRead) {
    const results = SELF_CARDS.map(([id, label]) => ({
      label,
      result: session.getMetric(id),
    }));
    return (
      <div className="space-y-6">
        <PageHeader title="My performance" description={headerDescription} />
        <section
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
          data-testid="report-self"
        >
          {results.map(({ label, result }) => (
            <MetricCard key={result.metricId} result={result} label={label} />
          ))}
        </section>
        <p className="text-xs text-ink-muted">
          Metrics cover your own sessions only. Payroll figures appear once a
          payroll run is posted.
        </p>
      </div>
    );
  }

  /* ------------------------------ full report center ------------------ */
  const canExport = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "payroll:export",
  );

  const canShare = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "saved_report:share",
  );
  const canManageScheduled = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "scheduled_report:manage",
  );

  const { data: savedViews } =
    tab === "saved"
      ? await actor.supabase
          .from("saved_views")
          .select("*")
          .eq("page", "reports")
          .or(
            `owner_id.eq.${actor.userId},and(shared_scope.eq.organization,organization_id.eq.${organizationId})`,
          )
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false })
      : { data: null };

  const ownerIds = [...new Set((savedViews ?? []).map((v) => v.owner_id))].filter(
    (id) => id !== actor.userId,
  );
  const { data: ownerProfiles } =
    ownerIds.length > 0
      ? await actor.supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ownerIds)
      : { data: null };
  const ownerName = new Map(
    (ownerProfiles ?? []).map((p) => [p.id, p.full_name || p.email]),
  );

  const { data: scheduledDefinitions } =
    tab === "scheduled"
      ? await actor.supabase
          .from("scheduled_report_definitions")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
      : { data: null };

  const canExecuteScheduled = hasPermissionInOrganization(
    context.memberships,
    organizationId,
    "scheduled_report:execute",
  );
  const { data: scheduledRuns } =
    tab === "scheduled"
      ? await actor.supabase
          .from("scheduled_report_runs")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(15)
      : { data: null };

  const { data: exportEvents } =
    tab === "exports"
      ? await actor.supabase
          .from("export_events")
          .select("*, profiles:generated_by ( full_name, email )")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  const { data: payrollExports } =
    tab === "exports" && canExport
      ? await actor.supabase
          .from("payroll_exports")
          .select("id, export_type, snapshot_version, superseded, created_at, payroll_runs ( id, name )")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Center"
        description={headerDescription}
        actions={
          <a
            href="/performance-operations/reports/export"
            className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Download report CSV
          </a>
        }
      />

      <div className="flex gap-1.5" data-testid="report-tabs">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/performance-operations/reports?tab=${key}`}
            className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
              tab === key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-2 self-center text-xs text-ink-muted">
          Scheduled reports execute via the background worker when enabled
        </span>
      </div>

      {tab === "quick" && (
        <QuickReport
          session={session}
          memberships={context.memberships}
          organizationId={organizationId}
        />
      )}

      {tab === "saved" && (
        <div className="space-y-4" data-testid="report-saved-views">
          <SaveCurrentReportForm
            page="reports"
            config={{
              reportingPeriodId: selectedPeriod.id,
              periodLabel: selectedPeriod.label,
              organizationId,
            }}
          />
          {(savedViews ?? []).length === 0 ? (
            <EmptyState
              title="No saved views yet"
              description="Save the current report with a name to find it here; pin your favorites, share with the organization, or mark one as your default."
            />
          ) : (
            <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
              {(savedViews ?? []).map((view) => {
                const config = view.config as { periodLabel?: string };
                const isOwner = view.owner_id === actor.userId;
                return (
                  <li
                    key={view.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    data-testid={`saved-view-${view.id}`}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {view.pinned && (
                          <span className="text-[10px] font-bold uppercase text-accent">pinned</span>
                        )}
                        {view.is_default && (
                          <span className="rounded bg-accent-soft px-1.5 text-[10px] font-bold uppercase text-accent">
                            default
                          </span>
                        )}
                        {view.shared_scope !== "personal" && (
                          <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
                            {view.shared_scope}
                          </span>
                        )}
                        <Link href="/performance-operations/reports" className="truncate hover:text-accent">
                          {view.name}
                        </Link>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {config.periodLabel ?? "—"} · saved {view.updated_at.slice(0, 10)}
                        {!isOwner && (
                          <span> · shared by {ownerName.get(view.owner_id) ?? "another member"}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SavedViewSharingControls
                        id={view.id}
                        organizationId={organizationId}
                        sharedScope={view.shared_scope}
                        isDefault={view.is_default}
                        isOwner={isOwner}
                        canShare={canShare}
                      />
                      {isOwner && <SavedViewRowActions id={view.id} pinned={view.pinned} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-ink-muted">
            A default view auto-applies its reporting period when you open
            Reports without a period selected. Organization-shared views are
            visible to members whose role can see this page.
          </p>
        </div>
      )}

      {tab === "scheduled" && (
        <div className="space-y-4" data-testid="report-scheduled">
          <div className="rounded-[--radius-card] border border-border bg-surface px-4 py-3 text-sm text-ink shadow-sm">
            <p className="font-semibold">Execution is available per definition</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              The background worker runs enabled schedules when due (one
              execution per occurrence, database-enforced) and Run now
              executes immediately. Email delivery uses the organization
              channel — with no real provider configured it stays in test
              mode or fails closed; recipients are re-validated against
              current members at execution time.
            </p>
          </div>
          {canManageScheduled && <NewScheduledReportForm organizationId={organizationId} />}
          {(scheduledDefinitions ?? []).length === 0 ? (
            <EmptyState
              title="No scheduled report definitions"
              description={
                canManageScheduled
                  ? "Create a definition above to record the intended cadence."
                  : "No definitions exist for this organization yet."
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
              {(scheduledDefinitions ?? []).map((definition) => {
                const recipients = (definition.recipients ?? []) as string[];
                return (
                  <li
                    key={definition.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {definition.report_type.replaceAll("_", " ")}
                        <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-secondary">
                          {definition.frequency.replaceAll("_", " ")}
                        </span>
                        {!definition.active && (
                          <span className="rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-muted">
                            disabled
                          </span>
                        )}
                        {definition.execution_enabled ? (
                          <span className="rounded bg-positive-soft px-1.5 text-[10px] font-bold uppercase text-positive">
                            executing
                          </span>
                        ) : (
                          <span className="rounded bg-warning-soft px-1.5 text-[10px] font-bold uppercase text-warning">
                            execution off
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {definition.timezone} ·{" "}
                        {recipients.length > 0
                          ? `${recipients.length} intended recipient(s): ${recipients.join(", ")}`
                          : "no recipients recorded"}{" "}
                        · created {definition.created_at.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canExecuteScheduled && (
                        <ScheduledExecutionControls
                          id={definition.id}
                          executionEnabled={definition.execution_enabled}
                        />
                      )}
                      {canManageScheduled && (
                        <ScheduledReportRowActions id={definition.id} active={definition.active} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <section className="space-y-2" data-testid="scheduled-run-history">
            <h2 className="text-sm font-semibold text-ink">Execution history</h2>
            {(scheduledRuns ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No executions yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
                {(scheduledRuns ?? []).map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                    data-scheduled-run-status={run.status}
                  >
                    <span className="text-xs text-ink-secondary">
                      {run.intended_run_at.slice(0, 16).replace("T", " ")} · {run.trigger_source}
                      {run.is_final ? (
                        <span className="ml-2 rounded bg-positive-soft px-1.5 text-[10px] font-bold uppercase text-positive">
                          final
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-surface-sunken px-1.5 text-[10px] font-bold uppercase text-ink-muted">
                          not final
                        </span>
                      )}
                      {run.failure_code && (
                        <span className="ml-2 text-negative">{run.failure_code}</span>
                      )}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        run.status === "succeeded"
                          ? "text-positive"
                          : run.status === "failed"
                            ? "text-negative"
                            : "text-ink"
                      }`}
                    >
                      {run.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "exports" && (
        <div className="space-y-6" data-testid="report-exports">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Report exports</h2>
            {(exportEvents ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No report exports recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
                {(exportEvents ?? []).map((event) => {
                  const profile = event.profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  } | null;
                  return (
                    <li key={event.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink">
                        {event.export_type}
                        <span className="ml-2 text-xs text-ink-muted">
                          {event.format.toUpperCase()} · {event.engine_version ?? ""}
                        </span>
                      </span>
                      <span className="text-xs text-ink-muted">
                        {profile?.full_name || profile?.email || "—"} ·{" "}
                        {event.created_at.slice(0, 16).replace("T", " ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {canExport && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Payroll exports</h2>
              {(payrollExports ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">No payroll exports recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
                  {(payrollExports ?? []).map((event) => {
                    const run = event.payroll_runs as unknown as {
                      id: string;
                      name: string;
                    } | null;
                    return (
                      <li key={event.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-ink">
                          {event.export_type.replaceAll("_", " ")}
                          {run && (
                            <Link
                              href={`/performance-operations/payroll/${run.id}/statements`}
                              className="ml-2 text-xs font-medium text-accent hover:text-accent-strong"
                            >
                              {run.name}
                            </Link>
                          )}
                          {event.superseded && (
                            <span className="ml-2 text-[10px] font-bold uppercase text-warning">
                              superseded
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {event.snapshot_version ? `v${event.snapshot_version} · ` : ""}
                          {event.created_at.slice(0, 16).replace("T", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          <p className="text-xs text-ink-muted">
            CSV is the supported format (Excel opens CSV directly; PDF comes
            from the browser print view on statements). Every export records
            actor, time, format, and engine version.
          </p>
        </div>
      )}
    </div>
  );
}
