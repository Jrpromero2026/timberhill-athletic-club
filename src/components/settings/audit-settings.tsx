import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { currentPeriodMonth } from "@/lib/package-audit/flow";
import { splitFor, type SplitRow } from "@/lib/payroll-preview/preview";

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles",
});
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("en-US");
const date = (iso: string | null | undefined) =>
  iso ? DAY.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : "never";

interface SyncRun {
  mode: string;
  status: string;
  started_at: string;
  appointments_seen: number | null;
  appointments_removed: number | null;
  error: string | null;
}
interface Contact {
  trainer: string;
  slack_user_id: string | null;
  slack_email: string | null;
  notify: boolean;
}
interface Settings {
  hold_grace_sessions: number;
  low_balance_threshold: number;
  counts_from: string;
  holds_live_from: string | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface">
      <h2 className="border-b border-border px-6 py-3 text-sm text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Data & settings for the director: what feeds the hub and how it is set. */
export async function AuditSettings({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const month = currentPeriodMonth();
  // The pkg_* tables are not in the generated Database types yet.
  const from = (table: string, columns = "*") =>
    actor.supabase.from(table as never).select(columns).eq("organization_id", organizationId);

  const [runsRes, importRes, purchaseRes, countRes, contactsRes, splitsRes, settingsRes] =
    await Promise.all([
      from("pkg_sync_runs", "mode, status, started_at, appointments_seen, appointments_removed, error")
        .order("started_at", { ascending: false })
        .limit(7),
      from("pkg_purchases", "created_at, import_file").order("created_at", { ascending: false }).limit(1),
      from("pkg_purchases", "purchased_at").order("purchased_at", { ascending: false }).limit(1),
      actor.supabase
        .from("pkg_purchases" as never)
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      from("pkg_trainer_contacts", "trainer, slack_user_id, slack_email, notify").order("trainer"),
      from("pkg_trainer_splits", "trainer, split, effective_month, reason"),
      from("pkg_settings", "hold_grace_sessions, low_balance_threshold, counts_from, holds_live_from").limit(1),
    ]);

  const runs = (runsRes.data ?? []) as unknown as SyncRun[];
  const lastImport = ((importRes.data ?? []) as unknown as { created_at: string; import_file: string | null }[])[0];
  const lastPurchase = ((purchaseRes.data ?? []) as unknown as { purchased_at: string }[])[0];
  const contacts = (contactsRes.data ?? []) as unknown as Contact[];
  const splits = (splitsRes.data ?? []) as unknown as (SplitRow & { reason: string | null })[];
  const settings = ((settingsRes.data ?? []) as unknown as Settings[])[0];

  const row = "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border px-6 py-3 text-sm last:border-0";

  return (
    <div className="space-y-6">
      <PageHeader title="Data & settings" />

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="Setmore sync">
          {runs.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink-secondary">No sync has run.</p>
          ) : (
            <ul data-testid="settings-sync">
              {runs.map((run) => (
                <li key={run.started_at} className={row}>
                  <span className="font-medium text-ink">{WHEN.format(new Date(run.started_at))}</span>
                  <span className={run.status === "succeeded" ? "text-ink-secondary" : "text-negative"}>
                    {run.status === "succeeded"
                      ? `${NUMBER.format(run.appointments_seen ?? 0)} sessions checked, ${run.appointments_removed ?? 0} cancelled`
                      : `Failed${run.error ? `: ${run.error.slice(0, 80)}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border px-6 py-3 text-xs text-ink-muted">
            Runs every night at 2:15 AM. Also saves Setmore&rsquo;s staff names and emails.
          </p>
        </Section>

        <div className="space-y-3">
          <Section title="GMS export">
            <ul>
              <li className={row}>
                <span className="font-medium text-ink">Last imported</span>
                <span className="text-ink-secondary">{date(lastImport?.created_at)}</span>
              </li>
              <li className={row}>
                <span className="font-medium text-ink">Purchases through</span>
                <span className="text-ink-secondary">{date(lastPurchase?.purchased_at)}</span>
              </li>
              <li className={row}>
                <span className="font-medium text-ink">Purchase lines on file</span>
                <span className="font-mono text-ink-secondary">{NUMBER.format(countRes.count ?? 0)}</span>
              </li>
            </ul>
            <p className="border-t border-border px-6 py-3 text-xs text-ink-muted">
              Imported by hand from the GMS invoice items export. Save a new export in
              Google Drive and the Monday digest picks it up.
            </p>
          </Section>

          {settings && (
            <Section title="Audit rules">
              <ul>
                <li className={row}>
                  <span className="font-medium text-ink">Grace before a hold</span>
                  <span className="text-ink-secondary">{settings.hold_grace_sessions} sessions</span>
                </li>
                <li className={row}>
                  <span className="font-medium text-ink">Low balance at</span>
                  <span className="text-ink-secondary">{settings.low_balance_threshold} sessions or fewer</span>
                </li>
                <li className={row}>
                  <span className="font-medium text-ink">Sessions count from</span>
                  <span className="text-ink-secondary">{date(settings.counts_from)}</span>
                </li>
                <li className={row}>
                  <span className="font-medium text-ink">Holds deducted from</span>
                  <span className="text-ink-secondary">{date(settings.holds_live_from)}</span>
                </li>
              </ul>
            </Section>
          )}
        </div>
      </div>

      <Section title="Trainer splits and Slack">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm" data-testid="settings-trainers">
            <thead className="border-b border-border text-ink-muted">
              <tr>
                <th className="px-6 py-2">Trainer</th>
                <th className="px-4 py-2 text-right">Split</th>
                <th className="px-4 py-2">Since</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Slack</th>
                <th className="px-4 py-2">Monday notice</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const current = splits
                  .filter((s) => s.trainer === c.trainer && s.effective_month <= month)
                  .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
                const split = splitFor(splits, c.trainer, month);
                return (
                  <tr key={c.trainer} className="border-b border-border last:border-0">
                    <td className="px-6 py-2.5 font-medium text-ink">{c.trainer}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {split === null ? "—" : `${Math.round(split * 100)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {current ? MONTH.format(new Date(`${current.effective_month}T00:00:00Z`)) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{current?.reason ?? "—"}</td>
                    <td className={`px-4 py-2.5 ${c.slack_user_id ? "text-ink-secondary" : "text-warning"}`}>
                      {c.slack_user_id ? (c.slack_email ?? "Linked") : "Not linked"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{c.notify ? "On" : "Off"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-6 py-3 text-xs text-ink-muted">
          Splits and notice settings are changed on request for now.
        </p>
      </Section>

      <p className="text-sm text-ink-secondary">
        <Link href="/performance-operations/configuration/users" className="font-medium text-accent hover:text-accent-strong">
          Users and access
        </Link>
        {" · "}
        <Link href="/performance-operations/audit" className="font-medium text-accent hover:text-accent-strong">
          Change log
        </Link>
      </p>
    </div>
  );
}
