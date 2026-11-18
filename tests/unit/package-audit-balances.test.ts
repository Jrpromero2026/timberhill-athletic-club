import { describe, expect, it } from "vitest";
import {
  summarize,
  type PackageBalanceRow,
  type PackageStatus,
} from "@/lib/package-audit/balances";

function row(
  status: PackageStatus,
  overrides: Partial<PackageBalanceRow> = {},
): PackageBalanceRow {
  return {
    billing_account_id: "a",
    account_name: "Account",
    clients: "Client",
    minutes: 60,
    purchased: 8,
    delivered: 8,
    balance: 0,
    booked_next_30d: 0,
    last_purchase_at: "2026-10-01T00:00:00Z",
    last_session_at: "2026-11-01T00:00:00Z",
    recent_trainers: null,
    status,
    other_length_credit: 0,
    ...overrides,
  };
}

describe("package audit summary", () => {
  it("splits holds into likely overdraws and accounts with no package linked", () => {
    const summary = summarize([
      row("held", { purchased: 20, delivered: 52, balance: -32 }),
      row("held", { purchased: 0, delivered: 38, balance: -38, last_purchase_at: null }),
      row("length_mismatch"),
      row("negative"),
      row("negative"),
      row("low"),
      row("ok"),
      row("payment_plan"),
    ]);

    expect(summary).toEqual({
      held: 2,
      heldWithPackage: 1,
      heldNoPackage: 1,
      lengthMismatch: 1,
      negative: 2,
      low: 1,
    });
  });

  it("is all zeros for an empty ledger", () => {
    expect(summarize([])).toEqual({
      held: 0,
      heldWithPackage: 0,
      heldNoPackage: 0,
      lengthMismatch: 0,
      negative: 0,
      low: 0,
    });
  });
});
