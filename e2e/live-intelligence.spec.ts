import { expect, test, type Page } from "@playwright/test";

/**
 * Live intelligence-engine verification: imports synthetic sessions, then
 * asserts the /reports surface renders engine-computed metrics with honest
 * health states — organization metrics, trainer breakdowns, payroll
 * waiting states, configuration readiness, executive summary, workspace
 * and reporting-period switching. Reverses its batch at the end.
 *
 * Fixtures (seeded via MCP, shared with live-payroll.spec.ts): trainer
 * "Payton E2E Payroll", service "E2E Signature 60", reporting period
 * "E2E Payroll Window" (2090-01-01 – 2098-12-31) in Timberhill.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const FILE_NAME = `e2e-intel-${RUN}.csv`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const MONTH = MONTHS[Date.now() % MONTHS.length];
const YEAR = 2090 + (Date.now() % 9);

function buildCsv(): string {
  const headers =
    "Appointment date,Appointment time,Service/class/event,Cost,Team member,Customer name,Country code ,Phone,Email,Label,Status,Comments ,Booking ID,Booked via,Booked on ,Address,City,State,Country,Zipcode / Postal code";
  const rows = [
    `10 ${MONTH} ${YEAR},05:30 AM - 06:30 AM,E2E Signature 60,64,Payton E2E Payroll,,,,,No label,Completed,,INT${RUN}A,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `11 ${MONTH} ${YEAR},07:00 AM - 08:00 AM,E2E Signature 60,100,Payton E2E Payroll,,,,,No label,Completed,,INT${RUN}B,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `12 ${MONTH} ${YEAR},09:00 AM - 09:30 AM,E2E Signature 60,30,Payton E2E Payroll,,,,,No label,Cancelled ,,INT${RUN}C,Calendar,7 May 2089 10:36 AM,,,,United States,`,
  ];
  return [headers, ...rows].join("\n");
}

let batchUrl = "";

/** Select the e2e reporting period in the header (per-test contexts). */
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

test("1. import and post synthetic sessions", async ({ page }) => {
  await page.goto("/performance-operations/imports/new");
  await page.getByLabel("Source system").selectOption("setmore");
  await page.getByLabel(/CSV file/).setInputFiles({
    name: FILE_NAME,
    mimeType: "text/csv",
    buffer: Buffer.from(buildCsv(), "utf8"),
  });
  await page.getByRole("button", { name: "Upload & inspect" }).click();
  await page.waitForURL(/\/imports\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  batchUrl = new URL(page.url()).pathname;

  // Service alias + status mappings usually persist from earlier suites —
  // resolve tolerantly when a queue still has rows.
  await page.goto(`${batchUrl}/review?queue=services`);
  await page.waitForLoadState("networkidle");
  if ((await page.locator("details").count()) > 0) {
    const row = page.locator("details").first();
    await row.locator("summary").click();
    await row.getByLabel("Service").selectOption({ label: "E2E Signature 60" });
    await row.getByRole("button", { name: "Map service" }).click();
    await expect(page.getByText("No rows in this queue.")).toBeVisible({ timeout: 15_000 });
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto(`${batchUrl}/review?queue=statuses`);
    await page
      .getByText(/Map unknown source statuses|No rows in this queue/)
      .first()
      .waitFor({ timeout: 15_000 });
    const saveButtons = page.getByRole("button", { name: "Save mapping" });
    if ((await saveButtons.count()) === 0) break;
    await page.waitForLoadState("networkidle");
    const form = page.locator("form", { has: saveButtons.first() }).first();
    const sourceValue = await form.locator("span").first().innerText();
    const target = /cancel/i.test(sourceValue)
      ? "cancelled"
      : /complete/i.test(sourceValue)
        ? "completed"
        : "scheduled";
    await form.getByLabel("Canonical status").selectOption(target);
    await form.getByRole("button", { name: "Save mapping" }).click();
    await page.waitForTimeout(2500);
  }

  await page.goto(batchUrl);
  await expect(page.getByText("ready for approval")).toBeVisible({ timeout: 20_000 });

  // Acknowledge warnings + approve (click-and-verify).
  await page.goto(`${batchUrl}/approval`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByText("Approval requirements").waitFor({ timeout: 15_000 });
    const ackButton = page.getByRole("button", { name: /Acknowledge \d+ warning/ });
    if ((await ackButton.count()) === 0) break;
    await page.waitForLoadState("networkidle");
    await ackButton.click();
    const done = await page
      .getByRole("button", { name: "Approve batch" })
      .waitFor({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (done) break;
    await page.goto(`${batchUrl}/approval`);
  }
  let approved = false;
  for (let attempt = 0; attempt < 3 && !approved; attempt++) {
    const approveButton = page.getByRole("button", { name: "Approve batch" });
    if (await approveButton.count()) {
      await page.waitForLoadState("networkidle");
      await approveButton.click();
      await page.waitForTimeout(2500);
    }
    await page.goto(batchUrl);
    await page.getByText("File & adapter").waitFor({ timeout: 15_000 });
    approved = (await page.getByRole("button", { name: "Revoke approval" }).count()) > 0;
    if (!approved) await page.goto(`${batchUrl}/approval`);
  }
  expect(approved).toBe(true);

  await page.goto(batchUrl);
  await page.getByRole("button", { name: /Post \d+ rows…/ }).click();
  await page.getByRole("button", { name: "Confirm post" }).click();
  await expect(page.getByRole("button", { name: "Reverse batch…" })).toBeVisible({
    timeout: 25_000,
  });
});

test("2. reports require a reporting period, then render engine metrics", async ({ page }) => {
  await page.goto("/performance-operations/reports");
  await expect(page.getByText("Select a reporting period")).toBeVisible({ timeout: 15_000 });

  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-org-metrics").waitFor({ timeout: 20_000 });

  // Organization appointment + revenue metrics computed by the engine.
  await expect(page.locator('[data-metric="appointments_completed"]')).toContainText("2");
  await expect(page.locator('[data-metric="revenue_listed_cents"]')).toContainText("$164.00");
  await expect(page.locator('[data-metric="revenue_per_session_cents"]')).toContainText("$82.00");
  // 2 completed / 3 booked ≈ 66.67%
  await expect(page.locator('[data-metric="completed_rate_bp"]')).toContainText("66.67%");
  await expect(page.locator('[data-metric="coaching_minutes"]')).toContainText("2h 0m");
});

test("3. payroll metrics show honest waiting state, not fake zeros", async ({ page }) => {
  await page.goto("/performance-operations/reports");
  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-payroll").waitFor({ timeout: 20_000 });
  const grossCard = page.locator('[data-metric="payroll_gross_cents"]');
  await expect(grossCard).toHaveAttribute("data-health", /waiting_for_payroll|healthy/);
  // With no finalized run overlapping the window the value must be "—".
  if ((await grossCard.getAttribute("data-health")) === "waiting_for_payroll") {
    await expect(grossCard).toContainText("—");
    await expect(grossCard).toContainText("Waiting for payroll");
  }
});

test("4. trainer breakdown, readiness, and executive summary render", async ({ page }) => {
  await page.goto("/performance-operations/reports");
  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-trainers").waitFor({ timeout: 20_000 });

  const trainers = page.getByTestId("report-trainers");
  await expect(trainers.getByText("Payton E2E Payroll")).toBeVisible();
  await expect(trainers.getByText("$164.00").first()).toBeVisible();

  // Readiness panel (executive setup indicators).
  const readiness = page.getByTestId("report-readiness");
  await expect(readiness.locator('[data-metric="organization_readiness_bp"]')).toBeVisible();
  await expect(readiness.locator('[data-metric="compensation_coverage_bp"]')).toBeVisible();

  // Deterministic executive summary.
  const summary = page.getByTestId("report-summary");
  await expect(summary.locator('[data-summary="most_sessions"]')).toContainText(
    "Payton E2E Payroll",
  );
  await expect(summary.locator('[data-summary="top_revenue_department"]')).toBeVisible();
});

test("5. workspace switching rescopes reports", async ({ page }) => {
  await page.goto("/performance-operations/reports");
  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-org-metrics").waitFor({ timeout: 20_000 });

  // Switch to G3 — a different organization with its own (empty) periods.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace").selectOption({ label: "G3 Sports & Fitness" });
  await page.waitForTimeout(2000);
  await page.goto("/performance-operations/reports");
  // No Timberhill metrics may leak: either the period prompt or G3's own
  // (import-waiting) metrics appear — never $164.00.
  await expect(page.getByText("$164.00")).toHaveCount(0);
  await expect(
    page
      .getByText(/Select a reporting period|Waiting for imports/)
      .first(),
  ).toBeVisible({ timeout: 15_000 });

  // Switch back for the remaining tests.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace").selectOption({ label: "Timberhill Athletic Club" });
  await page.waitForTimeout(2000);
});

test("6. reverse the batch (cleanup) and metrics react", async ({ page }) => {
  await page.goto(batchUrl);
  await page.getByRole("button", { name: "Reverse batch…" }).click();
  await page.getByLabel(/Reversal reason/).fill("E2E intelligence cleanup reversal");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(page.getByText("reversed", { exact: true }).first()).toBeVisible({
    timeout: 25_000,
  });

  // The engine reads only ACTIVE ledger rows — reversed data disappears.
  await page.goto("/performance-operations/reports");
  await selectPeriod(page);
  await page.goto("/performance-operations/reports");
  await page.getByTestId("report-org-metrics").waitFor({ timeout: 20_000 });
  await expect(page.locator('[data-metric="revenue_listed_cents"]')).not.toContainText(
    "$164.00",
  );
});
