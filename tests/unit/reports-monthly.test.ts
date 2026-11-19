import { describe, expect, it } from "vitest";
import { change, monthReports } from "@/lib/reports/monthly";

const R = (month: string, trainer: string | null, sessions: number, gross: number | string, clients: number) => ({
  month,
  trainer,
  sessions,
  gross,
  active_clients: clients,
});

describe("monthReports", () => {
  const rows = [
    R("2026-10-01", null, 400, 30000, 120),
    R("2026-11-01", null, 260, "18263.05", 95),
    R("2026-11-01", "Sam Lee", 45, 3309.1, 20),
    R("2026-11-01", "Alex Roe", 57, 3990, 22),
    R("2026-12-01", null, 10, 700, 8),
    R("2026-12-01", "Alex Roe", 10, 700, 8),
    R("2027-01-01", null, 5, 400, 5),
  ];

  it("starts with November and stops at the current month, newest first", () => {
    expect(monthReports(rows, "2026-12-01").map((r) => r.month)).toEqual(["2026-12-01", "2026-11-01"]);
  });

  it("orders trainers by revenue and uses the department row for totals", () => {
    const nov = monthReports(rows, "2026-11-01")[0];
    expect(nov.trainers.map((t) => t.trainer)).toEqual(["Alex Roe", "Sam Lee"]);
    expect(nov.total).toMatchObject({ sessions: 260, gross: 18263.05, clients: 95 });
    expect(nov.trainers[0].perSession).toBe(70);
  });

  it("does not add trainers' client counts into the department", () => {
    const nov = monthReports(rows, "2026-11-01")[0];
    expect(nov.total.clients).not.toBe(nov.trainers.reduce((t, r) => t + r.clients, 0));
  });

  it("handles a month with no sessions for a trainer", () => {
    const [r] = monthReports([R("2026-11-01", null, 0, 0, 0), R("2026-11-01", "Idle", 0, 0, 0)], "2026-11-01");
    expect(r.trainers[0].perSession).toBeNull();
  });
});

describe("change", () => {
  it("is a signed whole percent, or null without a base", () => {
    expect(change(110, 100)).toBe(10);
    expect(change(90, 100)).toBe(-10);
    expect(change(5, 0)).toBeNull();
    expect(change(5, undefined)).toBeNull();
  });
});
