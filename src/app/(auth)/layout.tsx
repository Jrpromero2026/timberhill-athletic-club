/** Centered card layout for authentication pages (no app shell). */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="hub hub-hero flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center bg-accent text-[15px] font-bold text-white">
          TH
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold uppercase tracking-wider text-nav-fg">
            Timberhill Hub
          </p>
          <p className="eyebrow text-nav-accent">
            Personal Training
          </p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-[--radius-card] bg-surface p-8 shadow-[0_24px_50px_rgba(0,0,0,0.4)]">
        {children}
      </div>
      <p className="mt-6 max-w-md text-center text-xs text-nav-muted">
        Access is by invitation only. Contact your administrator if you need an
        account.
      </p>
    </div>
  );
}
