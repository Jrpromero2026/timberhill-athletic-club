import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Page with a title and an empty state. */
export function PlaceholderPage({
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    </div>
  );
}
