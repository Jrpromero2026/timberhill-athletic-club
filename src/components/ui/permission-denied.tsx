import { PageHeader } from "./page-header";

/** Uniform permission-denied state; does not reveal what exists. */
export function PermissionDenied({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <div className="rounded-[--radius-card] border border-border bg-surface px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-ink">Not available</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-secondary">
          You do not have access to this page.
        </p>
      </div>
    </div>
  );
}
