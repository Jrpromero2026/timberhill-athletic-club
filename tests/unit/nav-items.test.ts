import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTES,
  NAV_GROUPS,
  NAV_ITEMS,
  isNavItemActive,
} from "@/components/layout/nav-items";

const item = (label: string) => NAV_ITEMS.find((i) => i.label === label)!;

describe("sidebar navigation", () => {
  it("is grouped by the five hub areas, with Admin last", () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual([
      null,
      "Payroll",
      "Trainers",
      "Projects & upgrades",
      "Marketing",
      "Reports",
      "Admin",
    ]);
  });

  it("has no duplicate destinations or labels", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.label)).size).toBe(NAV_ITEMS.length);
  });

  it("highlights an item on its own page and pages beneath it", () => {
    const payroll = item("Payroll");
    expect(isNavItemActive(payroll, "/performance-operations/payroll")).toBe(
      true,
    );
    expect(
      isNavItemActive(payroll, "/performance-operations/payroll/new"),
    ).toBe(true);
    expect(
      isNavItemActive(payroll, "/performance-operations/package-audit"),
    ).toBe(false);
  });

  it("keeps Data & settings highlighted on the pages it leads to", () => {
    const admin = item("Data & settings");
    for (const route of ADMIN_ROUTES) {
      expect(isNavItemActive(admin, route)).toBe(true);
      expect(isNavItemActive(admin, `${route}/anything`)).toBe(true);
    }
    expect(isNavItemActive(admin, "/performance-operations/payroll")).toBe(
      false,
    );
  });

  it("highlights exactly one item for every destination", () => {
    for (const route of [...NAV_ITEMS.map((i) => i.href), ...ADMIN_ROUTES]) {
      expect(NAV_ITEMS.filter((i) => isNavItemActive(i, route))).toHaveLength(
        1,
      );
    }
  });
});
