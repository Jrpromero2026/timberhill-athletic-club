"use client";

import { useState } from "react";
import { NavLinks } from "./nav-links";

/** Mobile navigation drawer (shown below lg). Links close it via onNavigate. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-[--radius-control] border border-border bg-surface shadow-sm hover:border-border-strong"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4.5 w-4.5 text-ink"
          aria-hidden
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-nav shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-nav-border px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">
                  TH
                </div>
                <p className="text-[13px] font-semibold text-nav-fg">
                  Timberhill Hub
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-8 w-8 items-center justify-center rounded text-nav-muted hover:text-nav-fg"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
