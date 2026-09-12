import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { SnapshotForm } from "@/components/snapshots/snapshot-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { recordOrganizationalSnapshot } from "@/lib/actions/snapshots";
import { getWorkspaceContext } from "@/lib/workspace/server";
import {
  listSnapshotMetricDefinitions,
  listSnapshots,
  type OrganizationalSnapshot,
} from "@/lib/snapshots/service";
import { assessStaleness, describeProvenance } from "@/lib/snapshots/provenance";

export const metadata: Metadata = { title: "Club snapshots" };

/**
 * Manual snapshots of external club systems (today: Gym Management
 * Solutions). Performance Operations does not integrate with GMS and is
 * not intended to — these few aggregate values change slowly and take a
 * minute to type, which is why they are entered rather than synced.
 */
export default async function SnapshotsPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Club snapshots" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "org_snapshot:read")
  );
  if (!canRead) return <PermissionDenied title="Club snapshots" />;

  const enterableOrgIds = orgIds.filter((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "org_snapshot:enter")
  );

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Club snapshots" />;

  const definitions = (await listSnapshotMetricDefinitions(actor)).filter((d) => d.isActive);
  const snapshotsByOrg = await Promise.all(
    orgIds.map((orgId) => listSnapshots(actor, orgId, { limit: 24 }))
  );
  const snapshots = snapshotsByOrg.flat();

  const { data: sourceRows } = await actor.supabase
    .from("external_data_sources")
    .select("key, label")
    .order("sort_order");
  const sources = (sourceRows ?? []).map((row) => ({ key: row.key, label: row.label }));

  const organizations = context.options
    .filter((o) => enterableOrgIds.includes(o.id))
    .map((o) => ({ id: o.id, name: o.name }));

  const today = new Date().toISOString().slice(0, 10);
  const defaults = defaultWindow(today);
  const labelByMetric = new Map(definitions.map((d) => [d.key, d.label]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club snapshots"
        description="Aggregate values read from external club systems and entered by hand. Every entry is a permanent, dated observation with its own provenance — nothing is overwritten, so month-over-month and year-over-year comparison stays possible."
      />

      {organizations.length > 0 && (
        <section className="rounded-[--radius-card] border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Record a snapshot</h2>
          <SnapshotForm
            action={recordOrganizationalSnapshot}
            organizations={organizations}
            sources={sources}
            metrics={definitions.map((d) => ({
              key: d.key,
              label: d.label,
              definition: d.definition,
            }))}
            defaults={{
              organizationId: organizations.length === 1 ? organizations[0].id : undefined,
              ...defaults,
            }}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">History</h2>
        {snapshots.length === 0 ? (
          <EmptyState
            title="No snapshots recorded yet"
            description="Enter the club figures for the most recent completed month to start the history. A single month is enough to make the current period reportable; comparisons become available from the second snapshot onward."
          />
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <SnapshotCard
                key={snapshot.id}
                snapshot={snapshot}
                labelByMetric={labelByMetric}
                today={today}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SnapshotCard({
  snapshot,
  labelByMetric,
  today,
}: {
  snapshot: OrganizationalSnapshot;
  labelByMetric: Map<string, string>;
  today: string;
}) {
  const staleness = assessStaleness(snapshot.asOfDate, today);
  const provenance = describeProvenance(
    {
      mode: snapshot.ingestMode === "automated" ? "live_automated" : "manual_snapshot",
      sourceKey: snapshot.sourceKey,
      sourceLabel: snapshot.sourceLabel,
      asOfDate: snapshot.asOfDate,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      enteredByName: snapshot.enteredByName,
      enteredAt: snapshot.enteredAt,
      note: snapshot.note,
    },
    today
  );

  return (
    <article className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {snapshot.periodStart} – {snapshot.periodEnd}
          </p>
          <p className="text-xs text-ink-muted">{provenance}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Manual data is labelled as manual, always and everywhere. */}
          <StatusBadge status={snapshot.ingestMode === "automated" ? "Automated" : "Manual entry"} />
          <StatusBadge status={snapshot.status} />
          {staleness !== "current" && <StatusBadge status={staleness} />}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {snapshot.values.map((value) => (
          <div key={value.metricKey}>
            <dt className="text-xs text-ink-muted">
              {labelByMetric.get(value.metricKey) ?? value.metricKey}
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">
              {value.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      {snapshot.note && <p className="mt-3 text-xs text-ink-muted">{snapshot.note}</p>}
    </article>
  );
}

/** Default to the previous whole calendar month — the usual reporting act. */
function defaultWindow(todayIso: string): {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
} {
  const [year, month] = todayIso.split("-").map(Number);
  const startOfThisMonth = Date.UTC(year, month - 1, 1);
  const endOfPrevious = new Date(startOfThisMonth - 86_400_000);
  const startOfPrevious = new Date(
    Date.UTC(endOfPrevious.getUTCFullYear(), endOfPrevious.getUTCMonth(), 1)
  );
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    periodStart: iso(startOfPrevious),
    periodEnd: iso(endOfPrevious),
    asOfDate: iso(endOfPrevious),
  };
}
