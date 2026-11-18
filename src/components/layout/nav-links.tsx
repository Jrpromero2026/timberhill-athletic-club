"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, isNavItemActive } from "./nav-items";

/** Sidebar/mobile navigation list with active-route highlighting. */
export function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className={`flex flex-col gap-0.5 ${collapsed ? "px-2" : "px-3"}`}
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.title ?? "home"} className="flex flex-col gap-0.5">
          {group.title &&
            (collapsed ? (
              <div
                className="mx-2 my-2 border-t border-nav-border"
                aria-hidden
              />
            ) : (
              <p className="eyebrow px-3 pb-1.5 pt-5 !text-[10px] text-nav-accent">
                {group.title}
              </p>
            ))}
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center gap-3 rounded-[--radius-control] py-2 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  collapsed ? "justify-center px-0" : "px-3"
                } ${
                  active
                    ? "bg-nav-raised text-nav-fg shadow-[inset_3px_0_0_0_var(--color-nav-accent)]"
                    : "text-nav-muted hover:bg-nav-raised/60 hover:text-nav-fg"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-[18px] w-[18px] shrink-0 ${
                    active
                      ? "text-nav-accent"
                      : "text-nav-muted group-hover:text-nav-fg"
                  }`}
                  aria-hidden
                >
                  <path d={item.iconPath} />
                </svg>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
