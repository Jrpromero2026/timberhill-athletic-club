import { describe, expect, it } from "vitest";
import {
  buildPreview,
  previewTotals,
  splitFor,
  splitReviews,
} from "@/lib/payroll-preview/preview";

const splits = [
  { trainer: "Alex Roe", split: "0.550", effective_month: "2026-09-01" },
  { trainer: "Alex Roe", split: 0.6, effective_month: "2026-12-01" },
  { trainer: "Sam Lee, CSCS", split: 0.7, effective_month: "2026-09-01" },
];

describe("splitFor", () => {
  it("uses the latest split that has started", () => {
    expect(splitFor(splits, "Alex Roe", "2026-11-01")).toBe(0.55);
    expect(splitFor(splits, "Alex Roe", "2026-12-01")).toBe(0.6);
    expect(splitFor(splits, "Sam Lee", "2026-11-01")).toBe(0.7);
    expect(splitFor(splits, "Nobody", "2026-11-01")).toBeNull();
    expect(splitFor(splits, "Alex Roe", "2026-08-01")).toBeNull();
  });
});

describe("buildPreview", () => {
  const progress = [
    { trainer: "Alex Roe", gross_to_date: "1000.00", gross_booked: 200, sessions_to_date: 14, sessions_booked: 3 },
    { trainer: "Sam Lee", gross_to_date: 3000, gross_booked: 0, sessions_to_date: 40, sessions_booked: 0 },
    { trainer: "Idle Trainer", gross_to_date: 0, gross_booked: 0, sessions_to_date: 0, sessions_booked: 0 },
  ];
  const holds = [
    { trainer: "Sam Lee, CSCS", cost: 80 },
    { trainer: "Sam Lee, CSCS", cost: "70.00" },
  ];
  const rows = buildPreview(progress, splits, holds, "2026-11-01");

  it("orders by gross and drops trainers with nothing this month", () => {
    expect(rows.map((r) => r.trainer)).toEqual(["Sam Lee", "Alex Roe"]);
  });

  it("computes commission and the trainer's share of held sessions", () => {
    expect(rows[0]).toMatchObject({ commission: 2100, heldSessions: 2, heldPay: 105 });
    expect(rows[1]).toMatchObject({ commission: 550, heldSessions: 0, heldPay: 0, booked: 200 });
  });

  it("totals reconcile to the rows", () => {
    expect(previewTotals(rows)).toEqual({
      sessions: 54,
      gross: 4000,
      booked: 200,
      commission: 2650,
      heldSessions: 2,
      heldPay: 105,
    });
  });

  it("shows no commission when a trainer has no split on record", () => {
    const [row] = buildPreview([progress[0]], [], [], "2026-11-01");
    expect(row).toMatchObject({ split: null, commission: 0 });
  });
});

describe("splitReviews", () => {
  it("lists only splits that differ from the rule, raises first", () => {
    const rec = (trainer: string, current: number, rule: number) => ({
      trainer,
      rule_name: "SOP 2.1",
      best_month: 4000,
      current_split: current,
      rule_split: rule,
      recommendation: "",
    });
    expect(
      splitReviews([rec("B", 0.7, 0.6), rec("A", 0.55, 0.6), rec("C", 0.5, 0.5)]).map(
        (r) => [r.trainer, r.direction],
      ),
    ).toEqual([
      ["A", "raise"],
      ["B", "above"],
    ]);
  });
});
