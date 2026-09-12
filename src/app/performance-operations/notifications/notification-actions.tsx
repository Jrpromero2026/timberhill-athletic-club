"use client";

import { useActionState } from "react";
import {
  archiveNotification,
  markNotificationRead,
  toggleNotificationPin,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/shared";

const buttonClass =
  "h-7 rounded-[--radius-control] border border-border px-2 text-[11px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-60";

export function NotificationRowActions({
  id,
  unread,
  pinned,
  archived,
}: {
  id: string;
  unread: boolean;
  pinned: boolean;
  archived: boolean;
}) {
  const [, readAction, readPending] = useActionState<ActionState, FormData>(
    markNotificationRead,
    {},
  );
  const [, pinAction, pinPending] = useActionState<ActionState, FormData>(
    toggleNotificationPin,
    {},
  );
  const [, archiveAction, archivePending] = useActionState<ActionState, FormData>(
    archiveNotification,
    {},
  );
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form action={readAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="unread" value={String(!unread)} />
        <button type="submit" disabled={readPending} className={buttonClass}>
          {unread ? "Mark read" : "Mark unread"}
        </button>
      </form>
      <form action={pinAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="pinned" value={String(pinned)} />
        <button type="submit" disabled={pinPending} className={buttonClass}>
          {pinned ? "Unpin" : "Pin"}
        </button>
      </form>
      {!archived && (
        <form action={archiveAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={archivePending} className={buttonClass}>
            Archive
          </button>
        </form>
      )}
    </div>
  );
}
