import { HubLibrary } from "@/components/hub/hub-library";
import { PageHeader } from "@/components/ui/page-header";
import type { ActorContext } from "@/lib/actions/shared";
import { currentPeriodMonth } from "@/lib/package-audit/flow";
import { REPORTING_START, change, monthReports, type ReportRow } from "@/lib/reports/monthly";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const NUMBER = new Intl.NumberFormat("en-US");
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className={`ml-2 text-xs font-normal ${value < 0 ? "text-negative" : "text-positive"}`}>
      {value > 0 ? "+" : ""}
      {value}% vs last month
    </span>
  );
}

/**
 * Reports for the director: sessions, revenue and active clients by month
 * and trainer, from Setmore. Starts with November 2026.
 */
export async function AuditReports({
  actor,
  organizationId,
}: {
  actor: ActorContext;
  organizationId: string;
}) {
  const current = currentPeriodMonth();
  // v_pkg_monthly_report is not in the generated Database types yet.
  const { data, error } = await actor.supabase
    .from("v_pkg_monthly_report" as never)
    .select("month, trainer, sessions, gross, active_clients")
    .eq("organization_id", organizationId)
    .gte("month", REPORTING_START)
    .lte("month", current);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <p className="border border-border bg-surface p-6 text-sm text-ink-secondary">
          Reports could not be loaded: {error.message}
        </p>
      </div>
    );
  }

  const reports = monthReports((data ?? []) as unknown as ReportRow[], current);
  const latest = reports[0];
  const previous = reports[1];

  const th = "px-4 py-2";
  const td = "px-4 py-2.5";
  const right = "text-right font-mono";

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      {!latest ? (
        <p className="border border-border bg-surface p-6 text-sm text-ink-secondary">
          No sessions yet. Reporting starts with {monthLabel(REPORTING_START)}.
        </p>
      ) : (
        <>
          <ul
            className="grid gap-px border border-border bg-border sm:grid-cols-3"
            data-testid="report-numbers"
          >
            {[
              {
                label: "Sessions",
                value: NUMBER.format(latest.total.sessions),
                delta: change(latest.total.sessions, previous?.total.sessions),
              },
              {
                label: "Revenue",
                value: DOLLARS.format(latest.total.gross),
                delta: change(latest.total.gross, previous?.total.gross),
              },
              {
                label: "Active clients",
                value: NUMBER.format(latest.total.clients),
                delta: change(latest.total.clients, previous?.total.clients),
              },
            ].map((n) => (
              <li key={n.label} className="bg-surface p-5">
                <span className="eyebrow block text-ink-muted">
                  {n.label} · {monthLabel(latest.month)}
                  {latest.month === current ? " so far" : ""}
                </span>
                <span className="mt-3 block font-mono text-3xl font-semibold text-ink">
                  {n.value}
                  <Delta value={latest.month === current ? null : n.delta} />
                </span>
              </li>
            ))}
          </ul>

          {reports.map((report) => (
            <section key={report.month} className="border border-border bg-surface">
              <h2 className="border-b border-border px-6 py-3 text-sm text-ink">
                {monthLabel(report.month)}
                {report.month === current ? " so far" : ""}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border text-ink-muted">
                    <tr>
                      <th className={th}>Trainer</th>
                      <th className={`${th} text-right`}>Sessions</th>
                      <th className={`${th} text-right`}>Revenue</th>
                      <th className={`${th} text-right`}>Per session</th>
                      <th className={`${th} text-right`}>Active clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.trainers.map((row) => (
                      <tr key={row.trainer} className="border-b border-border">
                        <td className={`${td} font-medium text-ink`}>{row.trainer}</td>
                        <td className={`${td} ${right}`}>{row.sessions}</td>
                        <td className={`${td} ${right}`}>{MONEY.format(row.gross)}</td>
                        <td className={`${td} ${right}`}>
                          {row.perSession === null ? "—" : MONEY.format(row.perSession)}
                        </td>
                        <td className={`${td} ${right}`}>{row.clients}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-sunken font-semibold text-ink">
                      <td className={td}>Department</td>
                      <td className={`${td} ${right}`}>{report.total.sessions}</td>
                      <td className={`${td} ${right}`}>{MONEY.format(report.total.gross)}</td>
                      <td className={`${td} ${right}`}>
                        {report.total.perSession === null ? "—" : MONEY.format(report.total.perSession)}
                      </td>
                      <td className={`${td} ${right}`}>{report.total.clients}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="text-xs text-ink-muted">
            Sessions that have happened, from Setmore, with a client on the booking.
            Revenue is the session price, leaving out Performance Lab and 1x30 intro
            sessions, as on Payroll. A client seen by two trainers counts once for the
            department.
          </p>
        </>
      )}

      <HubLibrary section="reports" />
    </div>
  );
}
