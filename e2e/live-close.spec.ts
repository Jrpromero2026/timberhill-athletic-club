import { expect, test, type Page } from "@playwright/test";

/**
 * Period-close workflow verification: create a close run for the dedicated
 * zero-activity fixture period, evaluate readiness (honest blockers),
 * generate the executive package + required export with verified download,
 * acknowledge every warning with recorded notes, complete review → approve
 * (self-approval enabled for Timberhill as DOCUMENTED e2e test
 * configuration) → execute the atomic close, inspect the frozen manifest,
 * then reopen (versioned re-close cycle) and void the replacement so the
 * dev database is left without an active or misleading close.
 *
 * Fixtures: reporting period "E2E Close Window" (2099-06-01 – 2099-06-30,
 * Timberhill, no appointments) and organization_close_policies
 * allow_self_approval=true for Timberhill, both seeded via MCP.
 */

test.describe.configure({ mode: "serial" });

const PERIOD = "E2E Close Window";
let runId = "";

async function voidCurrentRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Void close run/ }).click();
  await page.getByLabel(/Void reason/).fill("e2e cleanup — leave the window open");
  await page.getByRole("button", { name: "Confirm void" }).click();
  await expect(page.getByTestId("close-status")).toHaveText("Voided", {
    timeout: 20_000,
  });
}

test("0. reset: no lingering close run holds the fixture window", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/performance-operations/period-close");
  await page.waitForLoadState("networkidle");

  // A leftover CLOSED run means the period is closed — reopen it first.
  const completed = page
    .getByTestId("close-completed-runs")
    .getByRole("link", { name: new RegExp(PERIOD) });
  if ((await completed.count()) > 0) {
    await completed.first().click();
    await page.waitForURL(/\/period-close\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: /Reopen period/ }).click();
    await page.getByLabel(/Reopen reason/).fill("e2e reset — clearing leftover close");
    await page.getByRole("button", { name: "Confirm reopen" }).click();
    await expect(page.getByText(/superseded by/)).toBeVisible({ timeout: 20_000 });
    await page.goto("/performance-operations/period-close");
    await page.waitForLoadState("networkidle");
  }

  // Void any active run so this spec can create a fresh v-cycle.
  const active = page
    .getByTestId("close-active-runs")
    .getByRole("link", { name: new RegExp(PERIOD) });
  if ((await active.count()) > 0) {
    await active.first().click();
    await page.waitForURL(/\/period-close\/[0-9a-f-]{36}$/);
    await voidCurrentRun(page);
  }
});

test("1. start a close run for the fixture window", async ({ page }) => {
  await page.goto("/performance-operations/period-close/new");
  await page.waitForLoadState("networkidle");
  const option = await page
    .locator("#close-period option", { hasText: PERIOD })
    .first()
    .getAttribute("value");
  expect(option).toBeTruthy();
  await page.locator("#close-period").selectOption(option!);
  await page.getByRole("button", { name: "Start close review" }).click();
  await page.waitForURL(/\/period-close\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  runId = page.url().match(/period-close\/([0-9a-f-]{36})/)![1]!;

  await expect(page.getByTestId("close-status")).toHaveText("In review");
  await expect(page.getByTestId("close-steps")).toBeVisible();
  await expect(page.locator('[data-step="manifest"]')).toHaveAttribute(
    "data-state",
    "pending",
  );
});

test("2. readiness reports honest blockers and the zero-activity warning", async ({
  page,
}) => {
  await page.goto(`/performance-operations/period-close/${runId}/readiness`);
  await page.getByTestId("readiness-reporting").waitFor({ timeout: 30_000 });

  // Blocking until the executive package + required export exist. Package
  // and export artifacts are PERIOD-scoped, so a rerun may find them
  // already present from an earlier cycle — assert the checks are always
  // evaluated and classified as blocking, whatever their current status.
  await expect(page.locator('[data-check="report_package_ready"]')).toBeVisible();
  await expect(
    page.locator('[data-check="export_executive_summary_csv"]'),
  ).toBeVisible();
  // Zero-activity period: the payroll register cannot exist and is NOT
  // required (mirrors the close RPC's conditional payroll requirement).
  await expect(
    page.locator('[data-check="export_payroll_register_csv"]'),
  ).toHaveAttribute("data-status", "pass");
  await expect(page.locator('[data-check="payroll_finalized"]')).toHaveAttribute(
    "data-status",
    "pass",
  );
  // The empty window is a warning that must be explicitly acknowledged.
  await expect(page.locator('[data-check="zero_activity_period"]')).toHaveAttribute(
    "data-status",
    "fail",
  );
  await expect(page.locator('[data-check="period_open"]')).toHaveAttribute(
    "data-status",
    "pass",
  );
});

test("3. generate the executive report package", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/performance-operations/period-close/${runId}/reports`);
  await page.getByTestId("package-generators").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Executive period package" }).click();
  await expect(
    page.locator('[data-package="executive"][data-package-status="ready"]').first(),
  ).toBeVisible({ timeout: 45_000 });
});

test("4. generate the required export; downloads verify their hash", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/performance-operations/period-close/${runId}/exports`);
  await page.getByTestId("export-generators").waitFor({ timeout: 20_000 });

  // Honest failure: no posted payroll → no register (error, never fake rows).
  await page.getByRole("button", { name: "Payroll register CSV (required)" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    /No posted or locked payroll run/,
    { timeout: 20_000 },
  );

  await page.getByRole("button", { name: "Executive metric CSV (required)" }).click();
  const row = page.locator('[data-export="executive_summary_csv"]').first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Verified download: regenerated bytes must match the recorded sha256.
  const href = await row.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["x-export-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  const body = await response.text();
  expect(body).toContain("Executive Metric Summary");
  expect(body).toContain("Timberhill Athletic Club");
});

test("5. acknowledge every warning with a recorded note", async ({ page }) => {
  test.setTimeout(180_000);
  // Each readiness visit re-evaluates live state; acknowledge open waivable
  // checks one at a time until none remain (the set depends on live dev
  // data — e.g. failed import batches on record, unavailable paid amounts,
  // the permanent revenue-definition warning, the zero-activity warning).
  for (let round = 0; round < 15; round++) {
    await page.goto(`/performance-operations/period-close/${runId}/readiness`);
    await page.getByTestId("readiness-reporting").waitFor({ timeout: 30_000 });
    const openAck = page
      .locator('tr[data-status="fail"][data-resolution="open"]')
      .filter({ has: page.getByRole("button", { name: /Acknowledge…/ }) })
      .first();
    if ((await openAck.count()) === 0) break;
    const code = await openAck.getAttribute("data-check");
    // Re-anchor on the stable data-check attribute: opening the form
    // removes the "Acknowledge…" button the filter above matched on.
    const row = page.locator(`tr[data-check="${code}"]`);
    await row.getByRole("button", { name: /Acknowledge…/ }).click();
    await row
      .getByLabel(`Acknowledgement note for ${code}`)
      .fill("e2e reviewed — acceptable for the fixture close");
    await row.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await expect(row.getByText("acknowledged").first()).toBeVisible({
      timeout: 20_000,
    });
  }
  await page.goto(`/performance-operations/period-close/${runId}/readiness`);
  await page.getByTestId("readiness-reporting").waitFor({ timeout: 30_000 });
  await expect(
    page
      .locator('tr[data-status="fail"][data-resolution="open"]')
      .filter({ has: page.getByRole("button", { name: /Acknowledge…/ }) }),
  ).toHaveCount(0);
  await expect(page.getByText(/0 blocking · 0 unacknowledged/)).toBeVisible();
});

test("6. complete review, approve, and execute the atomic close", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/performance-operations/period-close/${runId}/approval`);
  await page.getByTestId("approval-actions").waitFor({ timeout: 30_000 });

  // Reviewer: re-verifies the full checklist server-side before advancing.
  await page.getByRole("button", { name: "Complete review" }).click();
  await expect(page.getByRole("button", { name: "Approve close" })).toBeVisible({
    timeout: 45_000,
  });

  // Approver (same actor — allowed ONLY by the documented e2e policy).
  await page.getByRole("button", { name: "Approve close" }).click();
  await expect(page.getByTestId("execute-close")).toBeVisible({ timeout: 45_000 });

  // Executor: two-step confirmation for the irreversible transaction.
  await page.getByTestId("execute-close").click();
  await page.getByTestId("confirm-execute-close").click();
  await expect(page.getByText(/Closed .* · manifest/)).toBeVisible({
    timeout: 60_000,
  });

  await page.goto(`/performance-operations/period-close/${runId}`);
  await expect(page.getByTestId("close-status")).toHaveText("Closed", {
    timeout: 20_000,
  });
  await expect(page.locator('[data-step="approval"]')).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("7. the frozen manifest records identity, approvals, and artifacts", async ({
  page,
}) => {
  await page.goto(`/performance-operations/period-close/${runId}/manifest`);
  await page.getByTestId("manifest-identity").waitFor({ timeout: 20_000 });
  await expect(page.getByTestId("manifest-identity")).toContainText(/[0-9a-f]{64}/);
  await expect(page.getByTestId("manifest-approvals")).toBeVisible();
  await expect(page.getByTestId("manifest-exports")).toContainText(
    "executive-summary",
  );
  await expect(page.getByTestId("manifest-acks")).toContainText(
    "zero_activity_period",
  );
  await expect(page.getByTestId("manifest-readiness")).toBeVisible();

  // The dashboard now shows the period closed and the run completed.
  await page.goto("/performance-operations/period-close");
  await expect(
    page.getByTestId("close-completed-runs").getByRole("link", {
      name: new RegExp(PERIOD),
    }),
  ).toBeVisible({ timeout: 20_000 });
});

test("8. reopen creates a versioned cycle; void leaves the window open", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`/performance-operations/period-close/${runId}`);
  await page.getByRole("button", { name: /Reopen period/ }).click();
  await page
    .getByLabel(/Reopen reason/)
    .fill("e2e verification reopen — restoring the fixture window");
  await page.getByRole("button", { name: "Confirm reopen" }).click();

  // The prior close stays frozen and points at the replacement cycle.
  await expect(page.getByText(/superseded by/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("close-status")).toHaveText("Superseded");
  await page.getByRole("link", { name: "a newer close cycle" }).click();
  await page.waitForURL(/\/period-close\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /· v2/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("close-status")).toHaveText("In review");
  await expect(page.getByText(/Re-close cycle — supersedes/)).toBeVisible();

  // Self-cleaning: void the replacement so no active run holds the window.
  await voidCurrentRun(page);
  await page.goto("/performance-operations/period-close");
  await expect(
    page
      .getByTestId("close-active-runs")
      .getByRole("link", { name: new RegExp(PERIOD) }),
  ).toHaveCount(0, { timeout: 20_000 });
});
