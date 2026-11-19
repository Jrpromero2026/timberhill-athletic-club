import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { currentPeriodMonth } from "@/lib/package-audit/flow";
import type { SplitRow } from "@/lib/payroll-preview/preview";
import {
  buildRoster,
  previousMonth,
  type ContactRow,
  type HeldRow,
  type MonthProgress,
  type SlackMatch,
  type StaffRow,
  type WarningRow,
} from "@/lib/roster/roster";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

const SLACK_LABEL: Record<SlackMatch, string> = {
  email: "Email",
  name: "Name",
  none: "Not linked",
};

/**
 * Trainers for the director: Setmore's staff list with each trainer's
 * email, Slack link, split and this month's numbers.
 */
export async function AuditRoster({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const month = currentPeriodMonth();
  // The pkg_* tables and views are not in the generated Database types yet.
  const from = (table: string, columns = "*") =>
    actor.supabase.from(table as never).select(columns).eq("organization_id", organizationId);

  const [staffRes, contactsRes, splitsRes, progressRes, holdsRes, warningsRes] =
    await Promise.all([
      from("pkg_setmore_staff", "staff_key, name, email"),
      from("pkg_trainer_contacts", "trainer, slack_user_id, slack_email, notify"),
      from("pkg_trainer_splits", "trainer, split, effective_month"),
      from("v_pkg_trainer_month_progress").gte("month", previousMonth(month)).lte("month", month),
      from("v_pkg_payroll_holds", "trainer").eq("period_month", month),
      from("v_pkg_trainer_warnings", "trainer, priority"),
    ]);

  if (staffRes.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trainers" />
        <p className="border border-border bg-surface p-6 text-sm text-ink-secondary">
          Trainers could not be loaded: {staffRes.error.message}
        </p>
      </div>
    );
  }

  const rows = buildRoster({
    staff: (staffRes.data ?? []) as unknown as StaffRow[],
    contacts: (contactsRes.data ?? []) as unknown as ContactRow[],
    splits: (splitsRes.data ?? []) as unknown as SplitRow[],
    progress: (progressRes.data ?? []) as unknown as MonthProgress[],
    holds: (holdsRes.data ?? []) as unknown as HeldRow[],
    warnings: (warningsRes.data ?? []) as unknown as WarningRow[],
    month,
  });
  const monthName = MONTH.format(new Date(`${month}T00:00:00Z`));

  const th = "px-4 py-2";
  const td = "px-4 py-2.5 align-top";
  const right = "text-right font-mono";

  return (
    <div className="space-y-6">
      <PageHeader title="Trainers" />

      <section className="border border-border bg-surface" data-testid="trainer-roster">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-ink-secondary">
            No trainers yet. The list fills in after the next Setmore sync.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border text-ink-muted">
                <tr>
                  <th className={th}>Trainer</th>
                  <th className={th}>Slack match</th>
                  <th className={`${th} text-right`}>Split</th>
                  <th className={`${th} text-right`}>{monthName} sessions</th>
                  <th className={`${th} text-right`}>Gross</th>
                  <th className={`${th} text-right`}>Held</th>
                  <th className={`${th} text-right`}>Past package</th>
                  <th className={`${th} text-right`}>Renewals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.trainer}
                    className={`border-b border-border last:border-0 ${row.active ? "" : "text-ink-muted"}`}
                  >
                    <td className={td}>
                      <span className={`block font-medium ${row.active ? "text-ink" : ""}`}>
                        {row.trainer}
                        {!row.active && <span className="font-normal"> · no recent sessions</span>}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {row.emails.length > 0 ? row.emails.join(", ") : "No email in Setmore"}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap ${row.slack === "none" ? "text-warning" : ""}`}>
                      {SLACK_LABEL[row.slack]}
                    </td>
                    <td className={`${td} ${right}`}>
                      {row.split === null ? "—" : `${Math.round(row.split * 100)}%`}
                    </td>
                    <td className={`${td} ${right}`}>{row.sessions}</td>
                    <td className={`${td} ${right}`}>{MONEY.format(row.gross)}</td>
                    <td className={`${td} ${right} ${row.heldSessions > 0 ? "text-negative" : ""}`}>
                      {row.heldSessions}
                    </td>
                    <td className={`${td} ${right} ${row.actNow > 0 ? "text-negative" : ""}`}>
                      {row.actNow}
                    </td>
                    <td className={`${td} ${right}`}>{row.renewals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-6 py-3 text-xs text-ink-muted">
          Names and emails come from Setmore. Slack is matched on the same email.
          Past package and Renewals are the clients in each trainer&rsquo;s Monday notice.
        </p>
      </section>

    </div>
  );
}
