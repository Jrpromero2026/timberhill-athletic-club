/** Month-end close — pure readiness checks. Nothing here closes a month. */

const HOUR = 60 * 60 * 1000;

export interface CloseCheck {
  label: string;
  detail: string;
  done: boolean;
}

export interface CloseInput {
  /** First day of the month being closed, YYYY-MM-DD. */
  month: string;
  /** Today in Pacific time, YYYY-MM-DD. */
  today: string;
  now: Date;
  lastSync: { status: string; started_at: string } | null;
  /** Pacific date the newest GMS purchase line was imported, YYYY-MM-DD. */
  lastGmsImportDate: string | null;
  /** Pacific date of the newest purchase in the export, YYYY-MM-DD. */
  lastPurchaseDate: string | null;
  heldNoPackage: number;
}

/** Last day of a month given its first day, as YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const shortDay = (iso: string) => SHORT.format(new Date(`${iso}T00:00:00Z`));

export function closeChecks(input: CloseInput): CloseCheck[] {
  const { month, today, now, lastSync, lastGmsImportDate, lastPurchaseDate, heldNoPackage } = input;
  const lastDay = lastDayOfMonth(month);

  const syncFresh =
    lastSync !== null &&
    lastSync.status === "succeeded" &&
    now.getTime() - new Date(lastSync.started_at).getTime() <= 36 * HOUR;

  const gmsCurrent = lastGmsImportDate !== null && lastGmsImportDate >= lastDay;

  return [
    {
      label: "The month has ended",
      detail: today >= lastDay ? `Last day was ${shortDay(lastDay)}.` : `Closes ${shortDay(lastDay)}.`,
      done: today >= lastDay,
    },
    {
      label: "Setmore is current",
      detail: !lastSync
        ? "Never synced."
        : lastSync.status !== "succeeded"
          ? "The last sync failed."
          : syncFresh
            ? "Synced in the last day."
            : "Not synced in over a day.",
      done: syncFresh,
    },
    {
      label: "GMS export through month-end is imported",
      detail: lastGmsImportDate
        ? `Last import ${shortDay(lastGmsImportDate)}${lastPurchaseDate ? `, purchases through ${shortDay(lastPurchaseDate)}` : ""}.`
        : "No export imported.",
      done: gmsCurrent,
    },
    {
      label: "Holds with no package linked are reviewed",
      detail:
        heldNoPackage === 0
          ? "None."
          : `${heldNoPackage} to review. These are usually a name mismatch or an older package.`,
      done: heldNoPackage === 0,
    },
  ];
}

/** What only the director can supply; never checked automatically. */
export const SEND_BEFORE_CLOSING: readonly string[] = [
  "Everfit nutrition coaching total",
  "Class revenue: Performance Lab, Rookies, Small Group",
  "Shadowing and on-boarding hours",
  "Any split changes",
];

export interface StatementRow {
  period_month: string;
  trainer: string;
  sessions_held: number;
  sessions_released: number;
  held_client_value: number | string;
  released_client_value: number | string;
}

export interface ClosedMonth {
  month: string;
  held: number;
  released: number;
  heldValue: number;
  releasedValue: number;
}

/** One line per closed month, newest first. */
export function closedMonths(
  periods: readonly { period_month: string }[],
  statement: readonly StatementRow[],
): ClosedMonth[] {
  return periods
    .map((p) => {
      const rows = statement.filter((s) => s.period_month === p.period_month);
      const sum = (pick: (s: StatementRow) => number | string) =>
        rows.reduce((t, s) => t + (Number(pick(s)) || 0), 0);
      return {
        month: p.period_month,
        held: sum((s) => s.sessions_held),
        released: sum((s) => s.sessions_released),
        heldValue: sum((s) => s.held_client_value),
        releasedValue: sum((s) => s.released_client_value),
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}
