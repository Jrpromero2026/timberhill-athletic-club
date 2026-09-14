"use client";

import { useState } from "react";
import { NavLinks } from "./nav-links";

/**
 * Desktop sidebar — dark charcoal navigation column, collapsible to an
 * icon rail. The state persists via cookie so SSR renders the right width.
 */
export function Sidebar({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `po-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      className={`hidden lg:flex lg:flex-col bg-nav border-r border-nav-border transition-[width] ${
        collapsed ? "lg:w-16" : "lg:w-60"
      }`}
      data-testid="sidebar"
      data-collapsed={collapsed}
    >
      <div
        className={`flex h-14 items-center gap-2.5 border-b border-nav-border ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">
          PO
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-nav-fg">
              Performance Operations
            </p>
            <p className="text-[10px] uppercase tracking-wider text-nav-muted">
              Operations Center
            </p>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks collapsed={collapsed} />
      </div>
      {/* The other half of the round trip. Staff reach this app from a tab on
          the public site; without this they had no way back but the URL bar. */}
      <div className={`border-t border-nav-border py-2 ${collapsed ? "px-2" : "px-5"}`}>
        <a
          className={`flex items-center gap-2 rounded py-2 text-[12px] text-nav-muted hover:text-nav-fg ${
            collapsed ? "justify-center px-0" : "px-0"
          }`}
          href="/personal-training"
          title="View the public site"
        >
          <span aria-hidden="true">←</span>
          {!collapsed && <span>View public site</span>}
        </a>
      </div>
      <div className={`border-t border-nav-border py-3 ${collapsed ? "px-2" : "px-5"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center justify-center gap-2 rounded px-2 py-1.5 text-[11px] font-medium text-nav-muted hover:bg-nav-raised/60 hover:text-nav-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round"
            className={`h-4 w-4 ${collapsed ? "rotate-180" : ""}`} aria-hidden>
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
