/** Route-level loading skeleton for all app pages. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <div className="h-6 w-56 rounded bg-surface-sunken" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-[--radius-card] border border-border bg-surface p-4"
          >
            <div className="h-3 w-24 rounded bg-surface-sunken" />
            <div className="mt-4 h-7 w-32 rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-[--radius-card] border border-border bg-surface" />
    </div>
  );
}
