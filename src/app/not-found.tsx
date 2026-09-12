import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-subtle px-6">
      <div className="w-full max-w-md rounded-[--radius-card] border border-border bg-surface p-8 text-center shadow-sm">
        <p className="font-mono text-sm font-semibold text-accent">404</p>
        <h1 className="mt-2 text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          The page does not exist, or you do not have access to it in the
          current workspace.
        </p>
        <Link
          href="/performance-operations/overview"
          className="mt-5 inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
