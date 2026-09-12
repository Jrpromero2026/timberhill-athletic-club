import type { TimelineEntry } from "@/lib/operations/snapshot";
import { Widget, WidgetEmpty } from "./section";

function humanizeAction(action: string): string {
  return action.replaceAll("_", " ");
}

/** Activity feed widget — audit-backed, read-only. */
export function TimelineCard({
  entries,
  title = "Recent activity",
  testId,
}: {
  entries: TimelineEntry[];
  title?: string;
  testId?: string;
}) {
  return (
    <Widget
      title={title}
      testId={testId}
      action={
        <a href="/performance-operations/audit" className="text-xs font-medium text-accent hover:text-accent-strong">
          Full audit →
        </a>
      }
    >
      {entries.length === 0 ? (
        <WidgetEmpty reason="No recorded activity yet." />
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                {entry.createdAt.slice(5, 16).replace("T", " ")}
              </span>
              <span className="min-w-0 truncate text-ink-secondary">
                <span className="font-medium text-ink">{entry.actorName}</span>{" "}
                {humanizeAction(entry.action)}
                <span className="text-ink-muted"> · {entry.entityType.replaceAll("_", " ")}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Widget>
  );
}
