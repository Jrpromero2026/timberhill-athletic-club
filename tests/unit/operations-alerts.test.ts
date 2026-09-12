import { describe, expect, it } from "vitest";
import { deriveAlerts, type AlertInputs } from "@/lib/operations/alerts";

function inputs(overrides: Partial<AlertInputs> = {}): AlertInputs {
  return {
    organizationId: "org-1",
    readiness: [],
    activePayrollRuns: [],
    pendingImportBatches: [],
    periodSelected: true,
    ...overrides,
  };
}

describe("deriveAlerts", () => {
  it("returns nothing on a clean pipeline", () => {
    expect(deriveAlerts(inputs())).toEqual([]);
  });

  it("flags blocked, failed, approvable, and reopened payroll runs with deep links", () => {
    const alerts = deriveAlerts(
      inputs({
        activePayrollRuns: [
          { id: "r1", name: "July", status: "needs_review", blockingIssueCount: 3, openLateArrivals: 0 },
          { id: "r2", name: "June", status: "failed", blockingIssueCount: 0, openLateArrivals: 0 },
          { id: "r3", name: "May", status: "ready_for_approval", blockingIssueCount: 0, openLateArrivals: 0 },
          { id: "r4", name: "April", status: "reopened", blockingIssueCount: 0, openLateArrivals: 1 },
        ],
      }),
    );
    const codes = alerts.map((a) => a.code);
    expect(codes).toContain("payroll_blocked");
    expect(codes).toContain("payroll_run_failed");
    expect(codes).toContain("payroll_awaiting_approval");
    expect(codes).toContain("payroll_reopened");
    expect(codes).toContain("late_arriving_appointments");
    const blocked = alerts.find((a) => a.code === "payroll_blocked")!;
    expect(blocked.severity).toBe("critical");
    expect(blocked.link).toBe("/performance-operations/payroll/r1/review");
    expect(blocked.action.length).toBeGreaterThan(0);
  });

  it("flags import pipeline states", () => {
    const alerts = deriveAlerts(
      inputs({
        pendingImportBatches: [
          { id: "b1", filename: "a.csv", status: "needs_review" },
          { id: "b2", filename: "b.csv", status: "ready_for_approval" },
          { id: "b3", filename: "c.csv", status: "failed" },
          { id: "b4", filename: "d.csv", status: "approved" },
          { id: "b5", filename: "e.csv", status: "parsing" }, // transient: no alert
        ],
      }),
    );
    expect(alerts.map((a) => a.code).sort()).toEqual([
      "import_awaiting_approval",
      "import_awaiting_posting",
      "import_awaiting_review",
      "import_failed",
    ]);
    expect(alerts.find((a) => a.code === "import_failed")!.severity).toBe("critical");
  });

  it("derives configuration alerts from ENGINE readiness results only", () => {
    const alerts = deriveAlerts(
      inputs({
        readiness: [
          { metricId: "compensation_coverage_bp", value: 5000, health: "incomplete", reasons: ["2 of 4 still unconfigured."] },
          { metricId: "trainer_assignment_coverage_bp", value: 10_000, health: "healthy", reasons: [] },
          { metricId: "service_alias_coverage_bp", value: null, health: "waiting_for_configuration", reasons: [] },
        ],
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe("compensation_missing");
    expect(alerts[0].detail).toBe("2 of 4 still unconfigured."); // engine's reason verbatim
    expect(alerts[0].link).toBe("/performance-operations/configuration/compensation");
  });

  it("notes a missing reporting period as info", () => {
    const alerts = deriveAlerts(inputs({ periodSelected: false }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe("no_period_selected");
    expect(alerts[0].severity).toBe("info");
  });

  it("orders by severity then title, deterministically", () => {
    const build = () =>
      deriveAlerts(
        inputs({
          periodSelected: false,
          activePayrollRuns: [
            { id: "r1", name: "July", status: "ready_for_approval", blockingIssueCount: 2, openLateArrivals: 0 },
          ],
          pendingImportBatches: [{ id: "b1", filename: "a.csv", status: "failed" }],
        }),
      );
    const alerts = build();
    const severities = alerts.map((a) => a.severity);
    expect(severities).toEqual([...severities].sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a as never] - order[b as never];
    }));
    expect(build()).toEqual(alerts);
  });

  it("gives every alert a stable id, owner link, and organization", () => {
    for (const alert of deriveAlerts(
      inputs({
        activePayrollRuns: [
          { id: "r1", name: "July", status: "needs_review", blockingIssueCount: 1, openLateArrivals: 0 },
        ],
      }),
    )) {
      expect(alert.id).toContain(alert.code);
      expect(alert.link.startsWith("/")).toBe(true);
      expect(alert.organizationId).toBe("org-1");
    }
  });
});
