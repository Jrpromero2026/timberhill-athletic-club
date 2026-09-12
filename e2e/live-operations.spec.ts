import { expect, test, type Page } from "@playwright/test";

/**
 * Executive Operations Center verification: role-aware overview widgets,
 * command palette + permission-aware search, notifications, report center
 * (tabs, saved views CRUD, CSV export + history), department and trainer
 * overviews, workspace switching isolation, responsive shell. Runs as the
 * e2e admin (platform-admin surface); role isolation is unit-tested and
 * RLS-verified in earlier phases.
 *
 * Fixtures: "E2E Payroll Window" period, trainer "Payton E2E Payroll",
 * and one durable pinned notification "E2E fixture notification" seeded
 * via MCP for the e2e admin.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const VIEW_NAME = `E2E view ${RUN}`;

async function selectPeriod(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const selector = page.locator("#period-selector");
  const optionValue = await selector
    .locator("option", { hasText: "E2E Payroll Window" })
    .first()
    .getAttribute("value");
  expect(optionValue).toBeTruthy();
  await selector.selectOption(optionValue!);
  await page.waitForTimeout(2000);
}

test("1. executive overview renders role-aware operations widgets", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await selectPeriod(page);
  await page.goto("/performance-operations/overview");
  await page.getByTestId("overview-status").waitFor({ timeout: 20_000 });

  // Engine-driven status cards with health attributes.
  await expect(page.locator('[data-metric="appointments_completed"]').first()).toBeVisible();
  await expect(page.locator('[data-metric="payroll_gross_cents"]').first()).toBeVisible();
  // Pipeline + governance widgets.
  await expect(page.getByTestId("overview-payroll")).toBeVisible();
  await expect(page.getByTestId("overview-imports")).toBeVisible();
  await expect(page.getByTestId("overview-alerts")).toBeVisible();
  await expect(page.getByTestId("overview-readiness")).toBeVisible();
  await expect(page.getByTestId("overview-timeline")).toBeVisible();
  await expect(page.getByTestId("overview-summary")).toBeVisible();
  await expect(
    page.getByTestId("overview-readiness").locator('[data-metric="organization_readiness_bp"]'),
  ).toBeVisible();
});

test("2. command palette searches pages, actions, and entities", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("open-palette").click();
  await page.getByTestId("command-palette").waitFor({ timeout: 10_000 });

  // Static page/action results, permission-filtered.
  await page.getByLabel("Palette search").fill("payroll");
  await expect(
    page.getByTestId("command-palette").getByRole("button", { name: /^Payroll \/payroll$/ }),
  ).toBeVisible();
  await expect(
    page.getByTestId("command-palette").getByRole("button", { name: "Create payroll run" }),
  ).toBeVisible();

  // Entity search via the single server implementation.
  await page.getByLabel("Palette search").fill("Payton");
  await expect(
    page.getByTestId("command-palette").getByText("Payton E2E Payroll"),
  ).toBeVisible({ timeout: 15_000 });

  // Navigation on selection.
  await page.getByTestId("command-palette").getByText("Payton E2E Payroll").click();
  await page.waitForURL(/\/trainers\/[0-9a-f-]{36}$/, { timeout: 15_000 });
});

test("3. trainer overview shows engine performance section", async ({ page }) => {
  await page.goto("/performance-operations/trainers");
  await selectPeriod(page);
  await page.getByRole("link", { name: "Payton E2E Payroll" }).first().click();
  await page.waitForURL(/\/trainers\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.getByTestId("trainer-performance").waitFor({ timeout: 20_000 });
  await expect(
    page.getByTestId("trainer-performance").locator('[data-metric="appointments_completed"]'),
  ).toBeVisible();
  await expect(
    page.getByTestId("trainer-performance").locator('[data-metric="payroll_gross_cents"]'),
  ).toBeVisible();
});

test("4. department overview renders engine metrics and deep links", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await selectPeriod(page);
  // Find a department via the palette's entity search.
  await page.getByTestId("open-palette").click();
  await page.getByLabel("Palette search").fill("Personal Training");
  await page
    .getByTestId("command-palette")
    .getByRole("button", { name: /Personal Training/ })
    .first()
    .click();
  await page.waitForURL(/\/departments\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.locator('[data-metric="appointments_completed"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-metric="schedule_utilization_bp"]').first()).toBeVisible();
  await expect(page.getByTestId("dept-trainers")).toBeVisible();
});

test("5. notification center lists, and the bell shows the fixture", async ({ page }) => {
  await page.goto("/performance-operations/notifications?tab=pinned");
  await expect(page.getByText("E2E fixture notification").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/performance-operations/notifications?tab=all");
  await expect(page.getByTestId("notification-tabs")).toBeVisible();
  await expect(page.getByText("E2E fixture notification").first()).toBeVisible();

  // Bell dropdown renders recent notifications.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("notification-bell").click();
  await expect(page.getByTestId("notification-dropdown")).toBeVisible();
  await expect(
    page.getByTestId("notification-dropdown").getByText("E2E fixture notification"),
  ).toBeVisible();
});

test("6. report center: tabs, saved view CRUD, export history", async ({ page }) => {
  await page.goto("/performance-operations/reports");
  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-tabs").waitFor({ timeout: 20_000 });
  await expect(page.getByTestId("report-org-metrics")).toBeVisible();

  // Saved views: create → visible → pin → delete (self-cleaning).
  await page.goto("/performance-operations/reports?tab=saved");
  await page.getByLabel(/Save current report as/).fill(VIEW_NAME);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("link", { name: VIEW_NAME })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Pin", exact: true }).first().click();
  await expect(page.getByText("pinned").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("link", { name: VIEW_NAME })).toHaveCount(0, {
    timeout: 15_000,
  });

  // CSV export through the engine, recorded in history.
  const response = await page.request.get("/performance-operations/reports/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const body = await response.text();
  expect(body).toContain("Performance Operations — Metric Report");
  expect(body).toContain("appointments_completed");
  expect(body).toContain("intel-v1");

  await page.goto("/performance-operations/reports?tab=exports");
  await expect(page.getByTestId("report-exports")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("metric_report").first()).toBeVisible();
});

test("7. workspace switching rescopes the operations center", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace").selectOption({ label: "G3 Sports & Fitness" });
  await page.waitForTimeout(2000);
  await page.goto("/performance-operations/overview");
  // G3 has no reporting period selected → honest empty/no-period widget,
  // and no Timberhill pipeline rows leak across.
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Select a reporting period in the header/)).toBeVisible();
  await expect(page.getByText("E2E Payroll Window")).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace").selectOption({ label: "Timberhill Athletic Club" });
  await page.waitForTimeout(2000);
});

test("8. responsive shell: sidebar collapses and mobile drawer works", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  // Persisted via cookie across reloads.
  await page.reload();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");

  // Mobile: sidebar hidden, drawer navigation available.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Reports" }).first()).toBeVisible();
});
