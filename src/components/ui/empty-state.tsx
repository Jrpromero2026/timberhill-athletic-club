import type { ReactNode } from "react";

/** Standard empty state for routes and panels awaiting data or later phases. */
export function EmptyState({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description: string;
  /** Which roadmap phase delivers this capability. */
  phase?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[--radius-card] border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-ink-muted"
          aria-hidden
        >
          <path d="M12 8v4m0 4h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-secondary">{description}</p>
      {phase && (
        <span className="mt-4 inline-flex items-center eyebrow bg-surface-sunken px-3 py-1.5 !text-[10px] text-ink-secondary">
          Planned for {phase}
        </span>
      )}
      {children}
    </div>
  );
}
