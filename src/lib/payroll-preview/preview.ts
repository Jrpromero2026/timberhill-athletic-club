/**
 * Payroll preview — pure helpers that turn the audit's month-to-date revenue,
 * the split history and this month's holds into one row per trainer. This is
 * a running preview; the payroll PDF is the final figure.
 */

export interface ProgressRow {
  trainer: string;
  gross_to_date: number | string;
  gross_booked: number | string;
  sessions_to_date: number;
  sessions_booked: number;
}

export interface SplitRow {
  trainer: string;
  split: number | string;
  /** YYYY-MM-DD, first of the month the split starts. */
  effective_month: string;
}

export interface HoldRow {
  trainer: string;
  cost: number | string | null;
}

export interface PreviewRow {
  trainer: string;
  sessions: number;
  gross: number;
  booked: number;
  /** 0-1, or null when no split is on record. */
  split: number | null;
  commission: number;
  heldSessions: number;
  /** The trainer's share of the held sessions' value. */
  heldPay: number;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const clean = (trainer: string) => trainer.replace(/, CSCS$/, "");
const cents = (v: number) => Math.round(v * 100) / 100;

/** The split in force for a month: the latest one starting on or before it. */
export function splitFor(
  splits: readonly SplitRow[],
  trainer: string,
  month: string,
): number | null {
  const current = splits
    .filter((s) => clean(s.trainer) === trainer && s.effective_month <= month)
    .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
  return current ? num(current.split) : null;
}

export function buildPreview(
  progress: readonly ProgressRow[],
  splits: readonly SplitRow[],
  holds: readonly HoldRow[],
  month: string,
): PreviewRow[] {
  const held = new Map<string, { sessions: number; value: number }>();
  for (const hold of holds) {
    const trainer = clean(hold.trainer);
    const entry = held.get(trainer) ?? { sessions: 0, value: 0 };
    entry.sessions += 1;
    entry.value += num(hold.cost);
    held.set(trainer, entry);
  }

  return progress
    .map((row) => {
      const trainer = clean(row.trainer);
      const split = splitFor(splits, trainer, month);
      const gross = num(row.gross_to_date);
      const h = held.get(trainer) ?? { sessions: 0, value: 0 };
      return {
        trainer,
        sessions: row.sessions_to_date,
        gross,
        booked: num(row.gross_booked),
        split,
        commission: cents(gross * (split ?? 0)),
        heldSessions: h.sessions,
        heldPay: cents(h.value * (split ?? 0)),
      };
    })
    .filter((row) => row.gross > 0 || row.booked > 0 || row.heldSessions > 0)
    .sort((a, b) => b.gross - a.gross || a.trainer.localeCompare(b.trainer));
}

export interface PreviewTotals {
  sessions: number;
  gross: number;
  booked: number;
  commission: number;
  heldSessions: number;
  heldPay: number;
}

export function previewTotals(rows: readonly PreviewRow[]): PreviewTotals {
  const sum = (pick: (row: PreviewRow) => number) =>
    cents(rows.reduce((total, row) => total + pick(row), 0));
  return {
    sessions: sum((r) => r.sessions),
    gross: sum((r) => r.gross),
    booked: sum((r) => r.booked),
    commission: sum((r) => r.commission),
    heldSessions: sum((r) => r.heldSessions),
    heldPay: sum((r) => r.heldPay),
  };
}

export interface RecommendationRow {
  trainer: string;
  rule_name: string;
  best_month: number | string;
  current_split: number | string;
  rule_split: number | string;
  recommendation: string;
}

export interface SplitReview {
  trainer: string;
  current: number;
  rule: number;
  bestMonth: number;
  direction: "raise" | "above";
}

/** Trainers whose split differs from what the rule gives; raises first. */
export function splitReviews(rows: readonly RecommendationRow[]): SplitReview[] {
  return rows
    .map((row) => ({
      trainer: clean(row.trainer),
      current: num(row.current_split),
      rule: num(row.rule_split),
      bestMonth: num(row.best_month),
    }))
    .filter((r) => Math.abs(r.current - r.rule) > 0.0001)
    .map((r) => ({ ...r, direction: r.rule > r.current ? ("raise" as const) : ("above" as const) }))
    .sort(
      (a, b) =>
        (a.direction === "raise" ? 0 : 1) - (b.direction === "raise" ? 0 : 1) ||
        a.trainer.localeCompare(b.trainer),
    );
}
