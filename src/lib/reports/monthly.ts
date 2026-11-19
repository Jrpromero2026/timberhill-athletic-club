/** Monthly report — pure shaping of `v_pkg_monthly_report` rows. */

/** Reporting starts here; earlier months are not shown. */
export const REPORTING_START = "2026-11-01";

export interface ReportRow {
  month: string;
  /** Null on the department row. */
  trainer: string | null;
  sessions: number;
  gross: number | string;
  active_clients: number;
}

export interface TrainerLine {
  trainer: string;
  sessions: number;
  gross: number;
  clients: number;
  /** Gross per session, or null with no sessions. */
  perSession: number | null;
}

export interface MonthReport {
  month: string;
  total: TrainerLine;
  trainers: TrainerLine[];
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

function line(row: ReportRow, name: string): TrainerLine {
  const sessions = num(row.sessions);
  const gross = num(row.gross);
  return {
    trainer: name,
    sessions,
    gross,
    clients: num(row.active_clients),
    perSession: sessions > 0 ? Math.round((gross / sessions) * 100) / 100 : null,
  };
}

/**
 * One report per month from the start month through `currentMonth`, newest
 * first. The department's client count is distinct clients, so it is not the
 * sum of the trainers' counts.
 */
export function monthReports(
  rows: readonly ReportRow[],
  currentMonth: string,
  start: string = REPORTING_START,
): MonthReport[] {
  const months = [...new Set(rows.map((r) => r.month))]
    .filter((m) => m >= start && m <= currentMonth)
    .sort((a, b) => b.localeCompare(a));
  return months.map((month) => {
    const inMonth = rows.filter((r) => r.month === month);
    const dept = inMonth.find((r) => r.trainer === null);
    const trainers = inMonth
      .filter((r) => r.trainer !== null)
      .map((r) => line(r, r.trainer as string))
      .sort((a, b) => b.gross - a.gross || a.trainer.localeCompare(b.trainer));
    const total = dept
      ? line(dept, "Department")
      : line(
          {
            month,
            trainer: null,
            sessions: trainers.reduce((t, r) => t + r.sessions, 0),
            gross: trainers.reduce((t, r) => t + r.gross, 0),
            active_clients: 0,
          },
          "Department",
        );
    return { month, total, trainers };
  });
}

/** Change against the previous month, as a signed whole percent; null without a base. */
export function change(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
