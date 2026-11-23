/**
 * Package audit — row shape of the `v_pkg_balances` view and the pure summary
 * the page shows above the ledger. The view does the counting (Setmore
 * sessions delivered against GMS packages bought); nothing here recalculates
 * a balance.
 */

export type PackageStatus =
  | "held"
  | "length_mismatch"
  | "negative"
  | "low"
  | "payment_plan"
  | "ok";

export interface PackageBalanceRow {
  billing_account_id: string;
  account_name: string;
  clients: string | null;
  minutes: number;
  purchased: number;
  delivered: number;
  balance: number;
  booked_next_30d: number;
  last_purchase_at: string | null;
  last_session_at: string | null;
  recent_trainers: string | null;
  status: PackageStatus;
  other_length_credit: number;
}

export const STATUS_LABEL: Record<PackageStatus, string> = {
  held: "Hold",
  length_mismatch: "Wrong length",
  negative: "Negative",
  low: "Low",
  payment_plan: "Payment plan",
  ok: "OK",
};

/** Worst first. */
export const STATUS_ORDER: Record<PackageStatus, number> = {
  held: 0,
  length_mismatch: 1,
  negative: 2,
  low: 3,
  payment_plan: 4,
  ok: 5,
};

export interface PackageAuditSummary {
  held: number;
  /** Held, and the account has bought a package: a likely real overdraw. */
  heldWithPackage: number;
  /** Held with no package linked: usually a name mismatch or an older package. */
  heldNoPackage: number;
  lengthMismatch: number;
  negative: number;
  low: number;
}

export function summarize(rows: readonly PackageBalanceRow[]): PackageAuditSummary {
  const held = rows.filter((row) => row.status === "held");
  const heldNoPackage = held.filter(
    (row) => row.purchased === 0 && row.last_purchase_at === null,
  ).length;
  const count = (status: PackageStatus) =>
    rows.filter((row) => row.status === status).length;

  return {
    held: held.length,
    heldWithPackage: held.length - heldNoPackage,
    heldNoPackage,
    lengthMismatch: count("length_mismatch"),
    negative: count("negative"),
    low: count("low"),
  };
}

/**
 * How a balance's session length reads in a table. Hybrid Coaching keeps its
 * own balance, which the ledger stores under length 0.
 */
export function lengthLabel(minutes: number): string {
  return minutes === 0 ? "Hybrid" : String(minutes);
}
