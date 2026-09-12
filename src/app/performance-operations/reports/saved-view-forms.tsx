"use client";

import { useActionState, useState } from "react";
import {
  deleteSavedView,
  renameSavedView,
  saveView,
  toggleSavedViewPin,
} from "@/lib/actions/operations";
import { setDefaultView, shareSavedView } from "@/lib/actions/report-admin";
import type { ActionState } from "@/lib/actions/shared";

const buttonClass =
  "h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";

/** Save the CURRENT report (period + organization) as a named view. */
export function SaveCurrentReportForm({
  page,
  config,
}: {
  page: string;
  config: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveView, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="kind" value="report" />
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <div>
        <label htmlFor="save-view-name" className="mb-1 block text-xs font-medium text-ink-muted">
          Save current report as
        </label>
        <input
          id="save-view-name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="e.g. Monthly board report"
          className="h-9 w-64 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save view"}
      </button>
      {state.error && <span role="alert" className="text-xs text-negative">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-positive">{state.message}</span>}
    </form>
  );
}

/** Sharing + default controls (Phase 7). Owner-only sharing; share
 * permission enforced server-side; trainers can never share org-wide. */
export function SavedViewSharingControls({
  id,
  organizationId,
  sharedScope,
  isDefault,
  isOwner,
  canShare,
}: {
  id: string;
  organizationId: string;
  sharedScope: string;
  isDefault: boolean;
  isOwner: boolean;
  canShare: boolean;
}) {
  const [shareState, shareAction, sharePending] = useActionState<ActionState, FormData>(
    shareSavedView,
    {},
  );
  const [defaultState, defaultAction, defaultPending] = useActionState<ActionState, FormData>(
    setDefaultView,
    {},
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isOwner && canShare && (
        <form action={shareAction}>
          <input type="hidden" name="view_id" value={id} />
          <input type="hidden" name="organization_id" value={organizationId} />
          <input
            type="hidden"
            name="shared_scope"
            value={sharedScope === "personal" ? "organization" : "personal"}
          />
          <button type="submit" disabled={sharePending} className={buttonClass}>
            {sharedScope === "personal" ? "Share with organization" : "Make personal"}
          </button>
        </form>
      )}
      <form action={defaultAction}>
        <input type="hidden" name="view_id" value={id} />
        <input type="hidden" name="is_default" value={String(!isDefault)} />
        <button type="submit" disabled={defaultPending} className={buttonClass}>
          {isDefault ? "Clear default" : "Set as default"}
        </button>
      </form>
      {(shareState.error || defaultState.error) && (
        <span role="alert" className="text-xs text-negative">
          {shareState.error || defaultState.error}
        </span>
      )}
      {(shareState.message || defaultState.message) && (
        <span role="status" className="text-xs text-positive">
          {shareState.message || defaultState.message}
        </span>
      )}
    </div>
  );
}

export function SavedViewRowActions({
  id,
  pinned,
}: {
  id: string;
  pinned: boolean;
}) {
  const [pinState, pinAction, pinPending] = useActionState<ActionState, FormData>(
    toggleSavedViewPin,
    {},
  );
  const [renameState, renameAction, renamePending] = useActionState<ActionState, FormData>(
    renameSavedView,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteSavedView,
    {},
  );
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={pinAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="pinned" value={String(pinned)} />
        <button type="submit" disabled={pinPending} className={buttonClass}>
          {pinned ? "Unpin" : "Pin"}
        </button>
      </form>
      {renaming ? (
        <form action={renameAction} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={id} />
          <input
            name="name"
            required
            minLength={2}
            maxLength={60}
            placeholder="New name"
            aria-label="New view name"
            className="h-7 w-40 rounded-[--radius-control] border border-border bg-surface px-2 text-xs"
          />
          <button type="submit" disabled={renamePending} className={buttonClass}>
            Save
          </button>
          <button type="button" onClick={() => setRenaming(false)} className={buttonClass}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setRenaming(true)} className={buttonClass}>
          Rename
        </button>
      )}
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={deletePending}
          className="h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-negative hover:bg-negative-soft disabled:opacity-60"
        >
          Delete
        </button>
      </form>
      {(pinState.error || renameState.error || deleteState.error) && (
        <span role="alert" className="text-xs text-negative">
          {pinState.error || renameState.error || deleteState.error}
        </span>
      )}
    </div>
  );
}
