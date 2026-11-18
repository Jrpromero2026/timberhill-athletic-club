"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Shows its children on one exact route, so a layout can add to an index page only. */
export function OnlyOnPath({ path, children }: { path: string; children: ReactNode }) {
  return usePathname() === path ? <>{children}</> : null;
}
