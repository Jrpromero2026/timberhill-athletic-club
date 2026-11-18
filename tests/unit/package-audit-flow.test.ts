import { describe, expect, it } from "vitest";
import type { PackageBalanceRow } from "@/lib/package-audit/balances";
import {
  currentPeriodMonth,
  holdsAreLive,
  holdsByTrainer,
  statusBreakdown,
} from "@/lib/package-audit/flow";

const row = (status: PackageBalanceRow["status"]): PackageBalanceRow => ({
  billing_account_id: "a",
  account_name: "A",
  clients: null,
  minutes: 60,
  purchased: 0,
  delivered: 0,
  balance: 0,
  booked_next_30d: 0,
  last_purchase_at: null,
  last_session_at: null,
  recent_trainers: null,
  status,
  other_length_credit: 0,
});

describe("holdsByTrainer", () => {
  it("counts sessions and sums value per trainer, largest first", () => {
    expect(
      holdsByTrainer([
        { trainer: "Sam Lee", cost: "75.00" },
        { trainer: "Alex Roe, CSCS", cost: 80 },
        { trainer: "Alex Roe, CSCS", cost: null },
      ]),
    ).toEqual([
      { trainer: "Alex Roe", sessions: 2, amount: 80 },
      { trainer: "Sam Lee", sessions: 1, amount: 75 },
    ]);
  });
});

describe("statusBreakdown", () => {
  it("orders worst first, drops empty statuses, and sums to 100%", () => {
    const slices = statusBreakdown([row("ok"), row("ok"), row("held"), row("low")]);
    expect(slices.map((s) => s.status)).toEqual(["held", "low", "ok"]);
    expect(slices.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100);
    expect(slices[2]).toMatchObject({ count: 2, percent: 50 });
  });

  it("handles no accounts", () => {
    expect(statusBreakdown([])).toEqual([]);
  });
});

describe("period helpers", () => {
  it("uses the Pacific month, not UTC", () => {
    // 05:00 UTC on Dec 1 is still Nov 30 in Corvallis.
    expect(currentPeriodMonth(new Date("2026-12-01T05:00:00Z"))).toBe("2026-11-01");
    expect(currentPeriodMonth(new Date("2026-12-01T09:00:00Z"))).toBe("2026-12-01");
  });

  it("treats holds as a trial until the live date", () => {
    expect(holdsAreLive("2027-01-01", "2026-11-01")).toBe(false);
    expect(holdsAreLive("2027-01-01", "2027-01-01")).toBe(true);
    expect(holdsAreLive(null, "2027-02-01")).toBe(false);
  });
});
