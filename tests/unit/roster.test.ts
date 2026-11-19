import { describe, expect, it } from "vitest";
import { buildRoster, previousMonth } from "@/lib/roster/roster";

const month = "2026-11-01";
const P = (trainer: string, m: string, sessions: number, gross: number) => ({
  trainer,
  month: m,
  gross_to_date: gross,
  gross_booked: 0,
  sessions_to_date: sessions,
  sessions_booked: 0,
});

const rows = buildRoster({
  staff: [
    { staff_key: "a1", name: "Alex Roe, CSCS", email: "Old@Example.com" },
    { staff_key: "a2", name: "Alex Roe, CSCS", email: "new@example.com" },
    { staff_key: "s", name: "Sam Lee", email: "sam@example.com" },
    { staff_key: "q", name: "Quiet Trainer", email: "quiet@example.com" },
    { staff_key: "o", name: "Owner Person", email: "owner@example.com" },
  ],
  contacts: [
    { trainer: "Alex Roe", slack_user_id: "U1", slack_email: "other@example.com", notify: true },
    { trainer: "Sam Lee", slack_user_id: "U2", slack_email: "SAM@example.com", notify: true },
    { trainer: "Quiet Trainer", slack_user_id: null, slack_email: null, notify: true },
  ],
  splits: [
    { trainer: "Alex Roe", split: 0.7, effective_month: "2026-09-01" },
    { trainer: "Sam Lee", split: 0.55, effective_month: "2026-09-01" },
  ],
  progress: [P("Alex Roe", month, 45, 3300), P("Sam Lee", month, 30, 2100), P("Sam Lee", "2026-10-01", 50, 4000)],
  holds: [{ trainer: "Alex Roe, CSCS" }, { trainer: "Alex Roe, CSCS" }],
  warnings: [
    { trainer: "Alex Roe", priority: 2 },
    { trainer: "Alex Roe", priority: 5 },
    { trainer: "Sam Lee", priority: 6 },
  ],
  month,
});

describe("buildRoster", () => {
  it("merges a trainer's Setmore accounts and leaves out non-trainers", () => {
    expect(rows.map((r) => r.trainer)).toEqual(["Alex Roe", "Sam Lee", "Quiet Trainer"]);
    expect(rows[0].emails).toEqual(["old@example.com", "new@example.com"]);
  });

  it("reports how Slack was matched", () => {
    expect(rows.map((r) => r.slack)).toEqual(["name", "email", "none"]);
  });

  it("carries the split, month numbers, holds and client counts", () => {
    expect(rows[0]).toMatchObject({ split: 0.7, sessions: 45, gross: 3300, heldSessions: 2, actNow: 1, renewals: 1, active: true });
    expect(rows[1]).toMatchObject({ split: 0.55, sessions: 30, actNow: 0, renewals: 1 });
  });

  it("marks trainers with no sessions this month or last as inactive, last", () => {
    expect(rows[2]).toMatchObject({ active: false, sessions: 0, split: null });
  });
});

describe("previousMonth", () => {
  it("steps back across a year", () => {
    expect(previousMonth("2026-11-01")).toBe("2026-10-01");
    expect(previousMonth("2027-01-01")).toBe("2026-12-01");
  });
});
