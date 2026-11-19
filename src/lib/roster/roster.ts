/**
 * Trainer roster — built from Setmore's own staff list, joined by email to
 * the Slack contact, with the split and this month's numbers from the audit.
 */
import { splitFor, type ProgressRow, type SplitRow } from "@/lib/payroll-preview/preview";

export interface StaffRow {
  staff_key: string;
  name: string | null;
  email: string | null;
}

export interface ContactRow {
  trainer: string;
  slack_user_id: string | null;
  slack_email: string | null;
  notify: boolean;
}

export interface MonthProgress extends ProgressRow {
  month: string;
}

export interface WarningRow {
  trainer: string;
  priority: number;
}

export interface HeldRow {
  trainer: string;
}

export type SlackMatch = "email" | "name" | "none";

export interface RosterRow {
  trainer: string;
  /** Every email on the trainer's Setmore staff accounts. */
  emails: string[];
  slack: SlackMatch;
  /** 0-1, or null when no split is on record. */
  split: number | null;
  sessions: number;
  gross: number;
  heldSessions: number;
  /** Clients past their package. */
  actNow: number;
  /** Clients down to 0-2 sessions. */
  renewals: number;
  /** Has sessions this month or last. */
  active: boolean;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const clean = (name: string) => name.replace(/, CSCS$/, "").trim();
const lower = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

export function buildRoster(input: {
  staff: readonly StaffRow[];
  contacts: readonly ContactRow[];
  splits: readonly SplitRow[];
  progress: readonly MonthProgress[];
  holds: readonly HeldRow[];
  warnings: readonly WarningRow[];
  month: string;
}): RosterRow[] {
  const { staff, contacts, splits, progress, holds, warnings, month } = input;

  // One trainer can have more than one Setmore staff account; group by name.
  const byTrainer = new Map<string, string[]>();
  for (const s of staff) {
    if (!s.name) continue;
    const trainer = clean(s.name);
    const emails = byTrainer.get(trainer) ?? [];
    const email = lower(s.email);
    if (email && !emails.includes(email)) emails.push(email);
    byTrainer.set(trainer, emails);
  }

  const rows: RosterRow[] = [];
  for (const [trainer, emails] of byTrainer) {
    const contact = contacts.find((c) => clean(c.trainer) === trainer);
    const months = progress.filter((p) => clean(p.trainer) === trainer);
    const current = months.find((p) => p.month === month);
    const worked = months.some(
      (p) => num(p.sessions_to_date) > 0 || num(p.sessions_booked) > 0,
    );
    // Setmore staff who are not trainers have no contact and no sessions.
    if (!contact && !worked) continue;

    const mine = warnings.filter((w) => clean(w.trainer) === trainer);
    rows.push({
      trainer,
      emails,
      slack: !contact?.slack_user_id
        ? "none"
        : emails.includes(lower(contact.slack_email))
          ? "email"
          : "name",
      split: splitFor(splits, trainer, month),
      sessions: num(current?.sessions_to_date),
      gross: num(current?.gross_to_date),
      heldSessions: holds.filter((h) => clean(h.trainer) === trainer).length,
      actNow: mine.filter((w) => w.priority <= 4).length,
      renewals: mine.filter((w) => w.priority > 4).length,
      active: worked,
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.gross - a.gross ||
      a.trainer.localeCompare(b.trainer),
  );
}

/** First day of the month before `month`, as YYYY-MM-DD. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}
