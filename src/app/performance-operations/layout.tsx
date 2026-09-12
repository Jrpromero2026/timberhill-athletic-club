import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import type { BellNotification } from "@/components/layout/notification-bell";
import { ROLE_PERMISSIONS } from "@/lib/authz/permissions";
import { getPeriodContext } from "@/lib/period/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/server";

/**
 * Shared application shell. The workspace context is resolved server-side on
 * every request — the cookie is validated against real access, never trusted.
 * Unauthenticated users in a configured environment never reach this layout's
 * children (middleware redirects first; this is the server-side backstop).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContext();

  if (context.mode === "unconfigured") {
    return <SetupRequired />;
  }
  if (context.mode === "live" && !context.userId) {
    redirect("/login");
  }

  const periods = await getPeriodContext(context);
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("po-sidebar")?.value === "collapsed";

  // Granted permissions for the SELECTED organization (palette filtering —
  // server actions and RLS re-verify everything on use).
  const permissions = new Set<string>();
  if (context.selection.kind === "organization") {
    for (const membership of context.memberships) {
      if (
        membership.organizationId === context.selection.organizationId ||
        membership.roleKey === "platform_admin"
      ) {
        for (const permission of ROLE_PERMISSIONS[membership.roleKey] ?? []) {
          permissions.add(permission);
        }
      }
    }
  }

  // Notification bell data (recipient-scoped by RLS).
  let unreadNotifications = 0;
  let recentNotifications: BellNotification[] = [];
  if (context.mode === "live" && context.userId) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const [unreadRes, recentRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", context.userId)
          .is("read_at", null)
          .is("archived_at", null),
        supabase
          .from("notifications")
          .select("id, title, category, severity, link_path, created_at, read_at")
          .eq("recipient_id", context.userId)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      unreadNotifications = unreadRes.count ?? 0;
      recentNotifications = (recentRes.data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        category: n.category,
        severity: n.severity,
        linkPath: n.link_path,
        createdAt: n.created_at,
        unread: n.read_at === null,
      }));
    }
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar initialCollapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          context={context}
          periods={periods}
          permissions={[...permissions]}
          unreadNotifications={unreadNotifications}
          recentNotifications={recentNotifications}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-subtle px-6">
      <div className="w-full max-w-lg rounded-[--radius-card] border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-ink">
          Environment not configured
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Supabase environment variables are missing. Copy{" "}
          <span className="font-mono text-xs">.env.example</span> to{" "}
          <span className="font-mono text-xs">.env.local</span> and fill in the
          dedicated Performance Operations project values (see the README), or
          set{" "}
          <span className="font-mono text-xs">
            NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true
          </span>{" "}
          for an explicit offline UI preview with no real data.
        </p>
      </div>
    </div>
  );
}
