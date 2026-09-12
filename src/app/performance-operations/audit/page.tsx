import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Audit" };

/** Humanize an audit action key: "membership_role_changed" → "Membership role changed". */
function humanizeAction(action: string): string {
  return action.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

/** Render safe, compact previous/new summaries from sanitized metadata. */
function summarize(metadata: Record<string, unknown>): {
  previous?: string;
  next?: string;
  rest: string[];
} {
  const rest: string[] = [];
  let previous: string | undefined;
  let next: string | undefined;
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "previous") {
      previous = compact(value);
    } else if (key === "next") {
      next = compact(value);
    } else if (typeof value !== "object") {
      rest.push(`${key.replaceAll("_", " ")}: ${String(value)}`);
    }
  }
  return { previous, next, rest };
}

function compact(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== "" && v !== null)
    .map(([k, v]) => `${k.replaceAll("_", " ")}=${String(v)}`)
    .join(", ");
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    actor?: string;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const filters = await searchParams;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Audit" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Audit" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "audit:read")
  );
  if (!canRead) return <PermissionDenied title="Audit" />;

  let query = actor.supabase
    .from("audit_events")
    .select("id, created_at, organization_id, entity_type, entity_id, action, metadata, organizations ( name ), profiles ( full_name, email )")
    .order("created_at", { ascending: false })
    .limit(100);

  // Workspace scope always applies; explicit org filter narrows further.
  if (filters.org && orgIds.includes(filters.org)) {
    query = query.eq("organization_id", filters.org);
  } else {
    query = query.in("organization_id", orgIds);
  }
  if (filters.entity) query = query.eq("entity_type", filters.entity);
  if (filters.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    query = query.lte("created_at", `${filters.to}T23:59:59Z`);
  }

  const { data } = await query;

  interface AuditRow {
    id: string;
    created_at: string;
    organization_id: string | null;
    entity_type: string;
    entity_id: string | null;
    action: string;
    metadata: Record<string, unknown>;
    organizations: { name: string } | null;
    profiles: { full_name: string; email: string } | null;
  }
  let events = (data ?? []) as unknown as AuditRow[];

  // Actor filter (by email fragment) applied after the join.
  if (filters.actor) {
    const needle = filters.actor.toLowerCase();
    events = events.filter(
      (e) =>
        e.profiles &&
        `${e.profiles.full_name} ${e.profiles.email}`.toLowerCase().includes(needle)
    );
  }

  const entityTypes = [...new Set(events.map((e) => e.entity_type))].sort();
  const selectClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        description="Append-only audit trail scoped to your accessible organizations. Records are immutable; sensitive payloads are never stored."
      />

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-[--radius-card] border border-border bg-surface p-3 shadow-sm">
        <div>
          <label htmlFor="f-org" className="mb-1 block text-xs font-medium text-ink-muted">Organization</label>
          <select id="f-org" name="org" defaultValue={filters.org ?? ""} className={selectClass}>
            <option value="">All accessible</option>
            {context.options.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-actor" className="mb-1 block text-xs font-medium text-ink-muted">User</label>
          <input id="f-actor" name="actor" defaultValue={filters.actor ?? ""}
            placeholder="name or email" className={selectClass} />
        </div>
        <div>
          <label htmlFor="f-entity" className="mb-1 block text-xs font-medium text-ink-muted">Entity type</label>
          <select id="f-entity" name="entity" defaultValue={filters.entity ?? ""} className={selectClass}>
            <option value="">All</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-action" className="mb-1 block text-xs font-medium text-ink-muted">Action contains</label>
          <input id="f-action" name="action" defaultValue={filters.action ?? ""}
            placeholder="e.g. created" className={selectClass} />
        </div>
        <div>
          <label htmlFor="f-from" className="mb-1 block text-xs font-medium text-ink-muted">From</label>
          <input id="f-from" name="from" type="date" defaultValue={filters.from ?? ""} className={selectClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-xs font-medium text-ink-muted">To</label>
          <input id="f-to" name="to" type="date" defaultValue={filters.to ?? ""} className={selectClass} />
        </div>
        <button type="submit"
          className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
          Filter
        </button>
      </form>

      <div className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
        {events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            No audit events match the current filters.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => {
              const summary = summarize(event.metadata ?? {});
              return (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-ink-muted">
                      {new Date(event.created_at).toISOString().replace("T", " ").slice(0, 19)} UTC
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {humanizeAction(event.action)}
                    </span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                      {event.entity_type}
                    </span>
                    <span className="text-xs text-ink-secondary">
                      {event.profiles
                        ? event.profiles.full_name || event.profiles.email
                        : "System"}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {event.organizations?.name ?? "Platform"}
                    </span>
                  </div>
                  {(summary.previous || summary.next || summary.rest.length > 0) && (
                    <div className="mt-1 space-y-0.5 text-xs text-ink-muted">
                      {summary.previous && (
                        <p><span className="font-medium text-ink-secondary">Previous:</span> {summary.previous}</p>
                      )}
                      {summary.next && (
                        <p><span className="font-medium text-ink-secondary">New:</span> {summary.next}</p>
                      )}
                      {summary.rest.length > 0 && <p>{summary.rest.join(" · ")}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        Showing the most recent 100 events. Request-level IP/user-agent capture
        is deliberately not recorded in this phase (see docs/ARCHITECTURE.md).
      </p>
    </div>
  );
}
