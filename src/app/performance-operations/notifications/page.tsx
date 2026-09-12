import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { NotificationRowActions } from "./notification-actions";

export const metadata: Metadata = { title: "Notifications" };

const TABS = [
  ["unread", "Unread"],
  ["all", "All"],
  ["pinned", "Pinned"],
  ["archived", "Archived"],
] as const;

const SEVERITY_CLASS: Record<string, string> = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  critical: "bg-negative-soft text-negative",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some(([key]) => key === rawTab) ? rawTab! : "unread";
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Notifications" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Notifications" />;

  let query = actor.supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", actor.userId)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (tab === "unread") query = query.is("read_at", null).is("archived_at", null);
  else if (tab === "pinned") query = query.not("pinned_at", "is", null).is("archived_at", null);
  else if (tab === "archived") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);
  const { data: notifications } = await query;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="In-app notifications from payroll, imports, configuration, and reporting workflows."
      />
      <div className="flex gap-1.5" data-testid="notification-tabs">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/performance-operations/notifications?tab=${key}`}
            className={`h-8 rounded-[--radius-control] border px-3 text-sm leading-8 ${
              tab === key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-ink hover:bg-surface-sunken"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {(notifications ?? []).length === 0 ? (
        <EmptyState
          title={`No ${tab === "all" ? "" : tab + " "}notifications`}
          description="Workflow events (imports posted, payroll approved/posted/reopened, statements ready) appear here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-[--radius-card] border border-border bg-surface shadow-sm">
          {(notifications ?? []).map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {n.read_at === null && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  )}
                  {n.pinned_at !== null && (
                    <span className="text-[10px] font-bold uppercase text-accent">pinned</span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_CLASS[n.severity] ?? ""}`}
                  >
                    {n.category}
                  </span>
                  {n.link_path ? (
                    <Link href={n.link_path} className="truncate hover:text-accent">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="truncate">{n.title}</span>
                  )}
                </p>
                {n.body && <p className="mt-0.5 text-xs text-ink-secondary">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {n.created_at.slice(0, 16).replace("T", " ")}
                </p>
              </div>
              <NotificationRowActions
                id={n.id}
                unread={n.read_at === null}
                pinned={n.pinned_at !== null}
                archived={n.archived_at !== null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
