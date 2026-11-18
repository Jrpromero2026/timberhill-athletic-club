/** Centered card layout for authentication pages (no app shell). */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-subtle px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-accent text-[15px] font-bold text-white">
          TH
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-ink">
            Timberhill Hub
          </p>
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            Personal Training
          </p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-[--radius-card] border border-border bg-surface p-6 shadow-sm">
        {children}
      </div>
      <p className="mt-6 max-w-md text-center text-xs text-ink-muted">
        Access is by invitation only. Contact your administrator if you need an
        account.
      </p>
    </div>
  );
}
