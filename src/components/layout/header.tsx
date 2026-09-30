import type { WorkspaceContext } from "@/lib/workspace/server";
import type { PeriodContext } from "@/lib/period/server";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { NotificationBell, type BellNotification } from "./notification-bell";
import { PeriodSelector } from "./period-selector";
import { UserMenu } from "./user-menu";
import { WorkspaceSelector } from "./workspace-selector";

/**
 * Application header: search/command palette, workspace + reporting-period
 * selectors, notification center, user menu.
 */
export function Header({
  context,
  periods,
  permissions,
  unreadNotifications,
  recentNotifications,
}: {
  context: WorkspaceContext;
  periods: PeriodContext;
  permissions: string[];
  unreadNotifications: number;
  recentNotifications: BellNotification[];
}) {
  const organizationId =
    context.selection.kind === "organization"
      ? context.selection.organizationId
      : null;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <MobileNav />
      {/* `min-w-0` so the title yields space instead of forcing the controls
          off-screen: a flex item defaults to min-width: auto and will not
          shrink below its text, which is how a 412px header came to need
          455px. */}
      <p className="lg:hidden min-w-0 shrink-[4] truncate text-sm font-semibold text-ink">
        Performance Operations
      </p>
      <CommandPalette organizationId={organizationId} permissions={permissions} />
      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        {context.mode === "offline" && (
          <span
            className="hidden md:inline-flex items-center rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning"
            title="Explicit development preview: Supabase is not configured; showing seed-mirroring data only."
          >
            Offline preview
          </span>
        )}
        <WorkspaceSelector
          options={context.options}
          selection={context.selection}
          canAccessAll={context.canAccessAll}
        />
        <PeriodSelector
          options={periods.options}
          selectedId={periods.selected?.id ?? null}
          selectable={periods.selectable}
        />
        {context.mode === "live" && context.userId && (
          <NotificationBell
            unreadCount={unreadNotifications}
            recent={recentNotifications}
          />
        )}
        <UserMenu
          userName={context.userName}
          userEmail={context.userEmail}
          canSignOut={context.mode === "live" && Boolean(context.userId)}
        />
      </div>
    </header>
  );
}
