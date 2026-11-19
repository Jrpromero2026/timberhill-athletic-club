import { describe, expect, it } from "vitest";
import type { PackageBalanceRow } from "@/lib/package-audit/balances";
import { closeChecks, closedMonths, lastDayOfMonth } from "@/lib/package-audit/close";
import { filterChips, filterRows, parseFilter } from "@/lib/package-audit/ledger-filter";

const base = {
  month: "2026-11-01",
  now: new Date("2026-11-30T23:00:00Z"),
  lastSync: { status: "succeeded", started_at: "2026-11-30T10:15:00Z" },
};

describe("closeChecks", () => {
  it("knows the last day of the month", () => {
    expect(lastDayOfMonth("2026-11-01")).toBe("2026-11-30");
    expect(lastDayOfMonth("2027-02-01")).toBe("2027-02-28");
    expect(lastDayOfMonth("2026-12-01")).toBe("2026-12-31");
  });

  it("is not ready mid-month with an old export and unlinked holds", () => {
    const checks = closeChecks({
      ...base,
      today: "2026-11-18",
      now: new Date("2026-11-18T23:00:00Z"),
      lastSync: { status: "succeeded", started_at: "2026-11-18T10:15:00Z" },
      lastGmsImportDate: "2026-11-16",
      lastPurchaseDate: "2026-11-16",
      heldNoPackage: 23,
    });
    expect(checks.map((c) => c.done)).toEqual([false, true, false, false]);
    expect(checks[0].detail).toBe("Closes Nov 30.");
    expect(checks[2].detail).toBe("Last import Nov 16, purchases through Nov 16.");
  });

  it("is ready on the last day once the export is in and holds are reviewed", () => {
    const checks = closeChecks({
      ...base,
      today: "2026-11-30",
      lastGmsImportDate: "2026-11-30",
      lastPurchaseDate: "2026-11-29",
      heldNoPackage: 0,
    });
    expect(checks.every((c) => c.done)).toBe(true);
  });

  it("is not ready when the sync failed or is stale", () => {
    const args = { ...base, today: "2026-11-30", lastGmsImportDate: "2026-11-30", lastPurchaseDate: null, heldNoPackage: 0 };
    expect(closeChecks({ ...args, lastSync: { status: "failed", started_at: "2026-11-30T10:15:00Z" } })[1].done).toBe(false);
    expect(closeChecks({ ...args, lastSync: { status: "succeeded", started_at: "2026-11-28T10:15:00Z" } })[1].done).toBe(false);
    expect(closeChecks({ ...args, lastSync: null })[1].done).toBe(false);
  });
});

describe("closedMonths", () => {
  it("sums held and released per month, newest first", () => {
    const s = (period_month: string, held: number, rel: number) => ({
      period_month,
      trainer: "T",
      sessions_held: held,
      sessions_released: rel,
      held_client_value: held * 70,
      released_client_value: `${rel * 70}`,
    });
    expect(
      closedMonths(
        [{ period_month: "2026-11-01" }, { period_month: "2026-12-01" }],
        [s("2026-11-01", 3, 0), s("2026-11-01", 2, 0), s("2026-12-01", 1, 4)],
      ),
    ).toEqual([
      { month: "2026-12-01", held: 1, released: 4, heldValue: 70, releasedValue: 280 },
      { month: "2026-11-01", held: 5, released: 0, heldValue: 350, releasedValue: 0 },
    ]);
  });
});

describe("ledger filter", () => {
  const row = (over: Partial<PackageBalanceRow>): PackageBalanceRow => ({
    billing_account_id: "a",
    account_name: "Pat Jones",
    clients: "Pat J",
    minutes: 60,
    purchased: 12,
    delivered: 15,
    balance: -3,
    booked_next_30d: 0,
    last_purchase_at: "2026-05-01",
    last_session_at: null,
    recent_trainers: "Alex Roe",
    status: "held",
    other_length_credit: 0,
    ...over,
  });
  const rows = [
    row({}),
    row({ account_name: "Lee Kim", purchased: 0, last_purchase_at: null }),
    row({ account_name: "Sam Ortiz", status: "ok", recent_trainers: "Sam Lee" }),
  ];

  it("accepts known statuses and the unlinked filter only", () => {
    expect(parseFilter("held")).toBe("held");
    expect(parseFilter("unlinked")).toBe("unlinked");
    expect(parseFilter("constructor")).toBeNull();
    expect(parseFilter(undefined)).toBeNull();
  });

  it("filters by status, unlinked and search text", () => {
    expect(filterRows(rows, "held", "").length).toBe(2);
    expect(filterRows(rows, "unlinked", "").map((r) => r.account_name)).toEqual(["Lee Kim"]);
    expect(filterRows(rows, null, "sam").map((r) => r.account_name)).toEqual(["Sam Ortiz"]);
    expect(filterRows(rows, "held", "alex roe").length).toBe(2);
  });

  it("builds chips with counts and keeps the search in each link", () => {
    const chips = filterChips(rows, "");
    expect(chips.map((c) => [c.key, c.count])).toEqual([
      ["all", 3],
      ["held", 2],
      ["unlinked", 1],
      ["ok", 1],
    ]);
    expect(filterChips(rows, "kim").find((c) => c.key === "held")?.href).toBe(
      "/performance-operations/package-audit?status=held&q=kim",
    );
  });
});
