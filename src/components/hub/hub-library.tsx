import Link from "next/link";
import { getActorContext } from "@/lib/actions/shared";
import {
  isInternalUrl,
  itemMonth,
  noteLines,
  splitItems,
  type HubItem,
  type HubSection,
} from "@/lib/hub/items";
import { getWorkspaceContext } from "@/lib/workspace/server";

/**
 * The notes and documents filed under one hub section. Reads `hub_items`;
 * row-level security decides what the signed-in user gets back. Renders
 * nothing when there is nothing to show.
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
    .select("id, kind, title, summary, body, url, source, item_date, sort")
    .eq("organization_id", context.selection.organizationId)
    .eq("section", section)
    .order("sort", { ascending: true })
    .order("title", { ascending: true });
  if (error || !data) return null;

  const { notes, links } = splitItems(data as unknown as HubItem[]);
  if (notes.length === 0 && links.length === 0) return null;

  return (
    <div className="space-y-6">
      {notes.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {notes.map((note) => (
            <section
              key={note.id}
              className="border border-border bg-surface p-6"
            >
              <span className="bar mb-3" aria-hidden />
              <h2 className="text-sm text-ink">{note.title}</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-secondary">
                {noteLines(note.body).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <section className="border border-border bg-surface">
          <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
            Documents
          </h2>
          <ul>
            {links.map((item) => {
              const url = item.url as string;
              const meta = [item.source, itemMonth(item.item_date)]
                .filter(Boolean)
                .join(" · ");
              const inner = (
                <>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink group-hover:text-accent">
                      {item.title}
                    </span>
                    {item.summary && (
                      <span className="mt-0.5 block text-sm text-ink-secondary">
                        {item.summary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">{meta}</span>
                </>
              );
              const className =
                "group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-3 text-sm hover:bg-surface-subtle";
              return (
                <li key={item.id} className="border-b border-border last:border-0">
                  {isInternalUrl(url) ? (
                    <Link href={url} className={className}>
                      {inner}
                    </Link>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {inner}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
