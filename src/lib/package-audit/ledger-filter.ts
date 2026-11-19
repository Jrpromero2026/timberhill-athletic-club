/** Package audit — pure filtering for the ledger table. */
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type PackageBalanceRow,
  type PackageStatus,
} from "./balances";

/** A status, or "unlinked": on hold with no package on file. */
export type LedgerFilter = PackageStatus | "unlinked";

const AUDIT = "/performance-operations/package-audit";

export function parseFilter(value: string | undefined): LedgerFilter | null {
  if (!value) return null;
  if (value === "unlinked") return "unlinked";
  return Object.hasOwn(STATUS_ORDER, value) ? (value as PackageStatus) : null;
}

const isUnlinked = (row: PackageBalanceRow) =>
  row.status === "held" && row.purchased === 0 && row.last_purchase_at === null;

export function filterRows(
  rows: readonly PackageBalanceRow[],
  filter: LedgerFilter | null,
  query: string,
): PackageBalanceRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "unlinked" ? !isUnlinked(row) : filter && row.status !== filter) {
      return false;
    }
    if (!q) return true;
    return [row.account_name, row.clients ?? "", row.recent_trainers ?? ""].some((text) =>
      text.toLowerCase().includes(q),
    );
  });
}

export interface FilterChip {
  key: LedgerFilter | "all";
  label: string;
  count: number;
  href: string;
}

/** One chip per status that has accounts, plus All and "No package linked". */
export function filterChips(rows: readonly PackageBalanceRow[], query: string): FilterChip[] {
  const q = query.trim();
  const href = (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `${AUDIT}?${qs}` : AUDIT;
  };
  const count = (filter: LedgerFilter | null) => filterRows(rows, filter, q).length;
  const statuses = (Object.keys(STATUS_ORDER) as PackageStatus[]).sort(
    (a, b) => STATUS_ORDER[a] - STATUS_ORDER[b],
  );
  const chips: FilterChip[] = [{ key: "all", label: "All", count: count(null), href: href() }];
  for (const status of statuses) {
    const n = count(status);
    if (n > 0) chips.push({ key: status, label: STATUS_LABEL[status], count: n, href: href(status) });
    if (status === "held") {
      const unlinked = count("unlinked");
      if (unlinked > 0) {
        chips.push({ key: "unlinked", label: "Hold, no package linked", count: unlinked, href: href("unlinked") });
      }
    }
  }
  return chips;
}
