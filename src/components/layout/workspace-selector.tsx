"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspace } from "@/lib/workspace/actions";
import { ALL_WORKSPACES } from "@/lib/workspace/constants";
import type { WorkspaceSelection } from "@/lib/workspace/resolver";

interface Props {
  options: { id: string; name: string }[];
  selection: WorkspaceSelection;
  canAccessAll: boolean;
}

/**
 * Persistent workspace selector. Calls a server action; the server
 * re-validates the requested workspace against the user's access before
 * persisting it, so the client value is never trusted.
 *
 * Two details are load-bearing:
 *
 *  - This selector lives in the shell LAYOUT, and a server action's response
 *    re-renders the page beneath it, not the layout around it. Driving the
 *    <select> straight from `selection` therefore snapped it back to the
 *    previous workspace the moment the choice was made — the switch had
 *    actually succeeded, but the control still named the old organization.
 *    `useOptimistic` shows the choice immediately and reconciles with the
 *    server once the transition settles, so a rejected value corrects itself
 *    rather than sticking.
 *  - `router.refresh()` is what re-renders the layout, bringing the rest of
 *    the shell (period options, command palette scope, granted permissions)
 *    onto the newly selected workspace. Awaiting it inside the transition
 *    keeps the control disabled until the whole header is consistent.
 */
export function WorkspaceSelector({ options, selection, canAccessAll }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const serverValue =
    selection.kind === "all"
      ? ALL_WORKSPACES
      : selection.kind === "organization"
        ? selection.organizationId
        : "";

  const [value, setValue] = useOptimistic(serverValue);

  function onChange(next: string) {
    startTransition(async () => {
      setValue(next);
      const formData = new FormData();
      formData.set("workspace", next);
      await switchWorkspace(formData);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 items-center">
      <label htmlFor="workspace-selector" className="sr-only">
        Workspace
      </label>
      <div className="relative min-w-0">
        <select
          id="workspace-selector"
          name="workspace"
          value={value}
          disabled={isPending || options.length === 0}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 appearance-none rounded-[--radius-control] border border-border bg-surface pl-3 pr-8 text-sm font-medium text-ink shadow-sm hover:border-border-strong focus:border-accent disabled:opacity-60 w-full min-w-0 max-w-[220px] truncate"
        >
          {options.length === 0 && <option value="">No workspaces</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          {canAccessAll && (
            <option value={ALL_WORKSPACES}>All Workspaces</option>
          )}
        </select>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
