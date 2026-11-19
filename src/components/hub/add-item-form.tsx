"use client";

import { useActionState } from "react";
import { addHubItem } from "@/lib/hub/actions";
import type { ActionState } from "@/lib/actions/shared";
import type { HubSection } from "@/lib/hub/items";

const field =
  "h-9 w-full border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent";

/** Add a link or a note to a section. A link if the Link box is filled, otherwise a note. */
export function AddItemForm({
  section,
  groups,
}: {
  section: HubSection;
  groups: readonly string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addHubItem, {});
  const listId = `hub-groups-${section}`;
  return (
    <details className="border border-border bg-surface">
      <summary className="cursor-pointer px-6 py-3 text-sm font-medium text-ink">
        Add a link or note
      </summary>
      <form action={action} className="grid gap-3 border-t border-border px-6 py-4 sm:grid-cols-2">
        <input type="hidden" name="section" value={section} />
        <label className="text-sm text-ink-secondary">
          Title
          <input name="title" required maxLength={120} className={`${field} mt-1`} />
        </label>
        <label className="text-sm text-ink-secondary">
          Heading to file it under
          <input name="group" maxLength={60} list={listId} className={`${field} mt-1`} />
          <datalist id={listId}>
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </label>
        <label className="text-sm text-ink-secondary sm:col-span-2">
          Link (leave empty to add a note)
          <input name="url" placeholder="https://" maxLength={500} className={`${field} mt-1`} />
        </label>
        <label className="text-sm text-ink-secondary sm:col-span-2">
          Description, or the note itself (one point per line)
          <textarea
            name="details"
            rows={3}
            maxLength={2000}
            className="mt-1 w-full border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="h-9 border border-ink bg-ink px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Adding" : "Add"}
          </button>
          <p role="status" className={`text-sm ${state.error ? "text-negative" : "text-ink-secondary"}`}>
            {state.error ?? state.message ?? ""}
          </p>
        </div>
      </form>
    </details>
  );
}
