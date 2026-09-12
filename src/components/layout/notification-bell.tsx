"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead } from "@/lib/actions/operations";

export interface BellNotification {
  id: string;
  title: string;
  category: string;
  severity: string;
  linkPath: string | null;
  createdAt: string;
  unread: boolean;
}

/** Header notification bell: unread badge + recent dropdown. */
export function NotificationBell({
  unreadCount,
  recent,
}: {
  unreadCount: number;
  recent: BellNotification[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unreadCount} unread)`}
        data-testid="notification-bell"
        className="relative flex h-9 w-9 items-center justify-center rounded-[--radius-control] border border-border bg-surface text-ink-secondary shadow-sm hover:border-border-strong"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white"
            data-testid="unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-[--radius-card] border border-border bg-surface shadow-xl"
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead();
                  router.refresh();
                }}
                className="text-[11px] font-medium text-accent hover:text-accent-strong"
              >
                Mark all read
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {recent.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notification.linkPath ?? "/performance-operations/notifications"}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2.5 hover:bg-surface-sunken ${
                      notification.unread ? "" : "opacity-70"
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {notification.unread && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      )}
                      <span className="truncate">{notification.title}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {notification.category} · {notification.createdAt.slice(0, 16).replace("T", " ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/performance-operations/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-center text-xs font-medium text-accent hover:text-accent-strong"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
