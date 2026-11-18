/**
 * Package audit — pure helpers for the "how the ledger works" visual.
 * Counts come from the database; nothing here recalculates a balance.
 */
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type PackageBalanceRow,
  type PackageStatus,
} from "./balances";

export interface HoldRow {
  trainer: string;
  cost: number | string | null;
}

export interface TrainerHolds {
  trainer: string;
  sessions: number;
  amount: number;
}

/** Held sessions and their session value per trainer, largest first. */
export function holdsByTrainer(rows: readonly HoldRow[]): TrainerHolds[] {
  const byTrainer = new Map<string, TrainerHolds>();
  for (const row of rows) {
    const trainer = row.trainer.replace(/, CSCS$/, "");
    const entry = byTrainer.get(trainer) ?? { trainer, sessions: 0, amount: 0 };
    entry.sessions += 1;
    entry.amount += Number(row.cost ?? 0) || 0;
    byTrainer.set(trainer, entry);
  }
  return [...byTrainer.values()].sort(
    (a, b) => b.sessions - a.sessions || a.trainer.localeCompare(b.trainer),
  );
}

export interface StatusSlice {
  status: PackageStatus;
  label: string;
  count: number;
  /** Share of all accounts, 0-100. */
  percent: number;
}

/** Accounts per status, worst first, with each one's share of the total. */
export function statusBreakdown(rows: readonly PackageBalanceRow[]): StatusSlice[] {
  const total = rows.length;
  const statuses = (Object.keys(STATUS_ORDER) as PackageStatus[]).sort(
    (a, b) => STATUS_ORDER[a] - STATUS_ORDER[b],
  );
  return statuses
    .map((status) => {
      const count = rows.filter((row) => row.status === status).length;
      return {
        status,
        label: STATUS_LABEL[status],
        count,
        percent: total === 0 ? 0 : (count / total) * 100,
      };
    })
    .filter((slice) => slice.count > 0);
}

/** First day of the current month in Pacific time, as YYYY-MM-DD. */
export function currentPeriodMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

/** Whether held pay is actually deducted yet, or only shown (trial). */
export function holdsAreLive(
  holdsLiveFrom: string | null,
  periodMonth: string,
): boolean {
  return holdsLiveFrom !== null && periodMonth >= holdsLiveFrom;
}
