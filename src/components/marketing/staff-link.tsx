"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * The staff entry point into Performance Operations, shown in the public site
 * chrome only once somebody is signed in.
 *
 * Why it is conditional rather than a permanent tab: this navigation is the
 * club's public one. A visitor comparing gyms would see "Performance
 * Operations" sitting between "Join" and "Contact" — a payroll and KPI tool
 * advertised to prospective members, on the page that exists to sell them
 * personal training. Staff get the tab; the public does not see it. The
 * permanent way in for a signed-out staff member is the footer link.
 *
 * Why a cookie sniff rather than a session lookup: these pages are statically
 * prerendered and read no Supabase data — that is what makes them fast and
 * what keeps them public by construction. Calling `getSession()` here would
 * pull the auth client into the marketing bundle and make the pages dynamic,
 * to decide whether to draw one link.
 *
 * So this is a HINT, never a permission. The worst case is a stale cookie
 * showing the link to somebody whose session has expired; they click it and
 * `src/proxy.ts` sends them to /login exactly as it would have anyway. No
 * access decision is made here.
 */

/** `@supabase/ssr` writes `sb-<project-ref>-auth-token`, sometimes chunked
 *  across `.0`, `.1` … The project ref is deliberately not hardcoded: matching
 *  the shape keeps this file free of any Supabase configuration. */
function hasStaffSession(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((cookie) => {
      const name = cookie.split("=")[0]?.trim() ?? "";
      return name.startsWith("sb-") && name.includes("-auth-token");
    });
}

function subscribe(onChange: () => void) {
  // Re-check when the tab regains focus, so signing in or out in another tab
  // is reflected here without a reload.
  window.addEventListener("focus", onChange);
  window.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("visibilitychange", onChange);
  };
}

/** False on the server, so the prerendered HTML never contains the link and
 *  the markup is identical for every visitor in the CDN cache. */
function getServerSnapshot() {
  return false;
}

export function useStaffSession(): boolean {
  return useSyncExternalStore(subscribe, hasStaffSession, getServerSnapshot);
}

export function StaffLink({ className = "" }: { className?: string }) {
  const signedIn = useStaffSession();
  if (!signedIn) return null;

  return (
    <Link className={`staff-link ${className}`.trim()} href="/performance-operations">
      Performance Operations
      <span aria-hidden="true"> →</span>
    </Link>
  );
}
