import { describe, expect, it } from "vitest";
import {
  MILESTONES,
  comingUp,
  daysSince,
  needsYou,
  pacificToday,
} from "@/lib/home/needs-you";

const now = new Date("2026-11-18T23:00:00Z");
const clean = {
  held: 0,
  heldWithPackage: 0,
  heldNoPackage: 0,
  lengthMismatch: 0,
  negative: 0,
  low: 0,
};
const freshSync = { status: "succeeded", started_at: "2026-11-18T10:15:00Z" };

describe("needsYou", () => {
  it("is empty when everything is current and nobody is past a package", () => {
    expect(
      needsYou({ summary: clean, lastSync: freshSync, lastGmsImportAt: "2026-11-16T21:00:00Z", now }),
    ).toEqual([]);
  });

  it("puts a failed or stale sync first", () => {
    const failed = needsYou({
      summary: { ...clean, held: 1, heldWithPackage: 1 },
      lastSync: { status: "failed", started_at: "2026-11-18T10:15:00Z" },
      lastGmsImportAt: "2026-11-16T21:00:00Z",
      now,
    });
    expect(failed[0].text).toMatch(/sync failed/);
    const stale = needsYou({
      summary: clean,
      lastSync: { status: "succeeded", started_at: "2026-11-16T10:15:00Z" },
      lastGmsImportAt: "2026-11-16T21:00:00Z",
      now,
    });
    expect(stale[0].text).toMatch(/not synced in over a day/);
  });

  it("flags a GMS export only once it is more than a week old", () => {
    const at = (iso: string | null) =>
      needsYou({ summary: clean, lastSync: freshSync, lastGmsImportAt: iso, now }).map((i) => i.text);
    expect(at("2026-11-12T00:00:00Z")).toEqual([]);
    expect(at("2026-11-09T00:00:00Z")[0]).toMatch(/9 days old/);
    expect(at(null)[0]).toMatch(/No GMS export/);
  });

  it("lists holds and wrong lengths with links to the filtered ledger", () => {
    const items = needsYou({
      summary: { ...clean, held: 54, heldWithPackage: 31, heldNoPackage: 23, lengthMismatch: 1 },
      lastSync: freshSync,
      lastGmsImportAt: "2026-11-16T21:00:00Z",
      now,
    });
    expect(items.map((i) => i.text)).toEqual([
      "23 clients on hold have no package linked. Check the name matches GMS.",
      "31 clients are more than 2 sessions past their package.",
      "1 client is booked at the wrong session length.",
    ]);
    expect(items[0].href).toBe("/performance-operations/package-audit?status=unlinked");
    expect(items[1].href).toBe("/performance-operations/package-audit?status=held");
    expect(items[2].href).toContain("status=length_mismatch");
  });
});

describe("dates", () => {
  it("uses the Pacific date", () => {
    expect(pacificToday(new Date("2026-11-24T05:00:00Z"))).toBe("2026-11-23");
  });

  it("shows the next three dates, today included", () => {
    expect(comingUp(MILESTONES, now).map((m) => m.date)).toEqual([
      "2026-11-23",
      "2026-11-30",
      "2026-12-14",
    ]);
    expect(comingUp(MILESTONES, new Date("2026-12-31T20:00:00Z")).map((m) => m.date)).toEqual([
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(comingUp(MILESTONES, new Date("2027-02-01T20:00:00Z"))).toEqual([]);
  });

  it("counts whole days", () => {
    expect(daysSince("2026-11-16T23:00:00Z", now)).toBe(2);
    expect(daysSince(null, now)).toBeNull();
  });
});
