import Link from "next/link";
import { AddItemForm } from "@/components/hub/add-item-form";
import { getActorContext } from "@/lib/actions/shared";
import { isPlatformAdmin } from "@/lib/authz/authz";
import { removeHubItem } from "@/lib/hub/actions";
import {
  groupItems,
  isInternalUrl,
  itemMonth,
  noteLines,
  type HubGroup,
  type HubItem,
  type HubSection,
} from "@/lib/hub/items";
import { getWorkspaceContext } from "@/lib/workspace/server";

function RemoveButton({ item, section }: { item: HubItem; section: HubSection }) {
  return (
    <details className="relative shrink-0 text-xs">
      <summary className="cursor-pointer list-none text-ink-muted hover:text-negative">
        Remove
      </summary>
      <form action={removeHubItem} className="absolute right-0 z-10 mt-1 border border-border bg-surface p-2 shadow-sm">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="section" value={section} />
        <button type="submit" className="whitespace-nowrap font-medium text-negative">
          Remove &ldquo;{item.title}&rdquo;
        </button>
      </form>
    </details>
  );
}

/**
 * The notes and documents filed under one hub section, under their headings.
 * Reads `hub_items`; row-level security decides what the signed-in user gets
 * back. Administrators can add and remove items here.
 */
export async function HubLibrary({ section }: { section: HubSection }) {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || context.selection.kind !== "organization") {
    return null;
  }
  const actor = await getActorContext();
  if (!actor) return null;

  // hub_items is not in the generated Database types yet.
  const { data, error } = await actor.supabase
    .from("hub_items" as never)
    .select("id, kind, title, summary, body, url, source, item_date, sort, group_name")
    .eq("organization_id", context.selection.organizationId)
    .eq("section", section)
    .order("sort", { ascending: true })
    .order("title", { ascending: true });
  if (error || !data) return null;

  return (
    <HubLibraryView
      section={section}
      groups={groupItems(data as unknown as HubItem[])}
      canEdit={isPlatformAdmin(context.memberships)}
    />
  );
}

/** The library as rendered, given its items. */
export function HubLibraryView({
  section,
  groups,
  canEdit,
}: {
  section: HubSection;
  groups: readonly HubGroup[];
  canEdit: boolean;
}) {
  if (groups.length === 0 && !canEdit) return null;
  const groupNames = groups.flatMap((g) => (g.name && g.name !== "Other" ? [g.name] : []));

  return (
    <div className="space-y-6" data-testid={`hub-library-${section}`}>
      {groups.map((group) => (
        <section key={group.name ?? "all"} className="space-y-3">
          {group.name && <h2 className="text-sm text-ink">{group.name}</h2>}

          {group.notes.length > 0 && (
            <div className={`grid gap-3 ${group.notes.length > 1 ? "lg:grid-cols-2" : ""}`}>
              {group.notes.map((note) => (
                <article key={note.id} className="border border-border bg-surface p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm text-ink">{note.title}</h3>
                    {canEdit && <RemoveButton item={note} section={section} />}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-secondary">
                    {noteLines(note.body).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          {group.links.length > 0 && (
            <ul className="border border-border bg-surface">
              {group.links.map((item) => {
                const url = item.url as string;
                const meta = [item.source, itemMonth(item.item_date)].filter(Boolean).join(" · ");
                const inner = (
                  <>
                    <span className="block font-medium text-ink group-hover:text-accent">
                      {item.title}
                    </span>
                    {item.summary && (
                      <span className="mt-0.5 block text-ink-secondary">{item.summary}</span>
                    )}
                  </>
                );
                return (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-x-6 border-b border-border px-6 py-3 text-sm last:border-0 hover:bg-surface-subtle"
                  >
                    {isInternalUrl(url) ? (
                      <Link href={url} className="group min-w-0 flex-1">
                        {inner}
                      </Link>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
                        {inner}
                      </a>
                    )}
                    <span className="hidden shrink-0 text-xs text-ink-muted sm:block">{meta}</span>
                    {canEdit && <RemoveButton item={item} section={section} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {canEdit && <AddItemForm section={section} groups={groupNames} />}
    </div>
  );
}
