import { expect, test, type Page } from "@playwright/test";

/**
 * Live Phase 9 verification: analytics landing + executive scorecard,
 * period switching with FINAL / NOT FINAL labels, scorecard drill paths,
 * goal lifecycle, benchmark lifecycle, dashboard builder (widgets,
 * reorder, defaults, sharing, duplicate, archive), cohorts with privacy,
 * presentation mode, dataset exports, and analytics subscriptions on the
 * scheduled-report engine.
 *
 * Runs against the seeded fixtures: reporting periods "E2E Payroll
 * Window" (open) and "E2E Analytics Closed Window" (closed, seeded for
 * finality labeling). Alphabetically this spec runs before the import/
 * intelligence suites, so the window carries NO synthetic appointments —
 * assertions target structure and honest states, not values. Everything
 * created here is run-unique and cleaned to a non-misleading state.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const GOAL_NAME = `E2E Goal ${RUN}`;
const DEPT_GOAL_NAME = `E2E Dept Goal ${RUN}`;
const BENCH_NAME = `E2E Bench ${RUN}`;
const DASH_NAME = `E2E Dash ${RUN}`;

async function selectPeriod(page: Page, label: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const selector = page.locator("#period-selector");
  const optionValue = await selector
    .locator("option", { hasText: label })
    .first()
    .getAttribute("value");
  expect(optionValue).toBeTruthy();
  await selector.selectOption(optionValue!);
  await page.waitForTimeout(2000);
}

test("1. analytics landing renders headline comparisons and sections", async ({ page }) => {
  await page.goto("/performance-operations/analytics");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics");
  await expect(page.getByTestId("analytics-headline")).toBeVisible({ timeout: 20_000 });
  // Four headline metrics with engine-honest states.
  await expect(page.locator('[data-testid="analytics-headline"] [data-metric]')).toHaveCount(4);
  // Payroll is unavailable (no posted run) — shown as such, never zero.
  await expect(
    page.locator('[data-metric="payroll_gross_cents"][data-health="waiting_for_payroll"]'),
  ).toBeVisible();
  await expect(page.getByTestId("analytics-sections")).toBeVisible();
  await expect(page.locator('[data-finality="not_final"]').first()).toBeVisible();
});

test("2. period switch relabels finality: closed period is FINAL", async ({ page }) => {
  await page.goto("/performance-operations/analytics");
  await selectPeriod(page, "E2E Analytics Closed Window");
  await page.goto("/performance-operations/analytics");
  await expect(page.locator('[data-finality="final"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics");
  await expect(page.locator('[data-finality="not_final"]').first()).toBeVisible({
    timeout: 20_000,
  });
});

test("3. executive scorecard compares periods with honest eligibility", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/executive");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/executive");
  await expect(page.getByTestId("analytical-summaries")).toBeVisible({ timeout: 30_000 });
  // Deterministic finality statement, never AI.
  await expect(page.getByTestId("analytical-summaries")).toContainText(/not final/i);
  const sections = page.getByTestId("executive-scorecard-section");
  await expect(sections.first()).toBeVisible();
  // Comparison cells expose their eligibility; readiness rows refuse
  // historical comparison as point-in-time metrics.
  await expect(page.locator('[data-comparison-eligibility]').first()).toBeVisible();
  await expect(
    page
      .locator('tr[data-metric="organization_readiness_bp"]')
      .locator('[data-comparison-eligibility="point_in_time_metric"]')
      .first(),
  ).toBeVisible();
  // Department comparison chart ships a data-table fallback when rows
  // exist; an empty window states so explicitly instead.
  const departments = page.getByTestId("executive-departments");
  await expect(departments).toBeVisible();
  const summary = departments.locator("summary");
  if (await summary.count()) {
    await summary.click();
    await expect(departments.locator("table")).toBeVisible();
  } else {
    await expect(departments).toContainText("No data in this window");
  }
});

test("4. scorecards drill from organization to department to trainer", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/scorecards");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/scorecards");
  await expect(page.getByTestId("scorecard-tabs")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("scorecard-view")).toBeVisible();

  await page.goto("/performance-operations/analytics/scorecards?card=department");
  await expect(page.getByTestId("scorecard-department-picker")).toBeVisible({ timeout: 20_000 });
  const firstDept = page.getByTestId("scorecard-department-picker").locator("a").first();
  await firstDept.click();
  await expect(page.getByTestId("scorecard-view")).toBeVisible({ timeout: 20_000 });

  await page.goto("/performance-operations/analytics/scorecards?card=trainer");
  await expect(page.getByTestId("scorecard-trainer-picker")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("scorecard-trainer-picker").locator("a").first().click();
  await expect(page.getByTestId("scorecard-view")).toBeVisible({ timeout: 20_000 });
  // Trainer payroll rows stay honest (posted payroll only).
  await expect(
    page.locator('tr[data-metric="payroll_gross_cents"]').first(),
  ).toBeVisible();
});

test("5. goal lifecycle: create organization goal, approve, see progress", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/performance-operations/analytics/goals");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/goals");
  await page.locator("summary", { hasText: "New goal" }).click();
  const form = page.getByTestId("goal-create-form");
  await form.locator('input[name="name"]').fill(GOAL_NAME);
  await form.locator('select[name="metricId"]').selectOption("appointments_completed");
  await form.locator('select[name="goalType"]').selectOption("minimum");
  await form.locator('input[name="targetValue"]').fill("1");
  await form.locator('input[name="startDate"]').fill("2090-01-01");
  await form.locator('input[name="endDate"]').fill("2098-12-31");
  await form.getByRole("button", { name: "Create draft goal" }).click();
  await expect(form.getByText(/created as a draft/i)).toBeVisible({ timeout: 20_000 });

  const card = page.locator("li", { hasText: GOAL_NAME }).first();
  await expect(card).toHaveAttribute("data-goal-status", "draft");
  await card.getByTestId("goal-approve").click();
  await expect(page.locator("li", { hasText: GOAL_NAME }).first()).toHaveAttribute(
    "data-goal-status",
    "active",
    { timeout: 20_000 },
  );
  // Progress renders the engine value vs target (0 completed sessions —
  // a REAL zero: the pipeline has data, this window has none).
  await expect(
    page.locator("li", { hasText: GOAL_NAME }).getByTestId("goal-current-value"),
  ).toBeVisible();
});

test("6. department-scoped goal is created and labeled", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/goals");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/goals");
  await page.locator("summary", { hasText: "New goal" }).click();
  const form = page.getByTestId("goal-create-form");
  await form.locator('input[name="name"]').fill(DEPT_GOAL_NAME);
  await form.locator('select[name="metricId"]').selectOption("appointments_completed");
  await form.locator('select[name="scopeLevel"]').selectOption("department");
  await form.locator('select[name="departmentId"]').selectOption({ index: 0 });
  await form.locator('input[name="targetValue"]').fill("1");
  await form.locator('input[name="startDate"]').fill("2090-01-01");
  await form.locator('input[name="endDate"]').fill("2098-12-31");
  await form.getByRole("button", { name: "Create draft goal" }).click();
  await expect(form.getByText(/created as a draft/i)).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator("li", { hasText: DEPT_GOAL_NAME }).first().getByText("department"),
  ).toBeVisible();
});

test("7. benchmark lifecycle: create internal standard, approve, compare", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/performance-operations/analytics/benchmarks");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/benchmarks");
  await page.locator("summary", { hasText: "New benchmark" }).click();
  const form = page.getByTestId("benchmark-create-form");
  await form.locator('input[name="name"]').fill(BENCH_NAME);
  await form.locator('select[name="metricId"]').selectOption("appointments_completed");
  await form.locator('select[name="sourceType"]').selectOption("internal_standard");
  await form.locator('input[name="value"]').fill("1");
  await form
    .locator('textarea[name="evidence"]')
    .fill("E2E internal standard set by the live verification suite.");
  await form.locator('input[name="effectiveFrom"]').fill("2090-01-01");
  await form.getByRole("button", { name: "Create draft benchmark" }).click();
  await expect(form.getByText(/created as a draft/i)).toBeVisible({ timeout: 20_000 });

  const card = page.locator("li", { hasText: BENCH_NAME }).first();
  await expect(card).toHaveAttribute("data-benchmark-status", "draft");
  await card.getByTestId("benchmark-approve").click();
  await expect(page.locator("li", { hasText: BENCH_NAME }).first()).toHaveAttribute(
    "data-benchmark-status",
    "approved",
    { timeout: 20_000 },
  );
  // Approved benchmark compares against the live engine value.
  await expect(
    page.locator("li", { hasText: BENCH_NAME }).getByTestId("benchmark-current"),
  ).toBeVisible();
  await expect(page.locator("li", { hasText: BENCH_NAME })).toContainText(/vs benchmark/);
});

test("8. dashboard builder: widgets, reorder, default, share, duplicate, archive", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/performance-operations/analytics/dashboards");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/dashboards");
  const createForm = page.getByTestId("dashboard-create-form");
  await createForm.locator('input[name="name"]').fill(DASH_NAME);
  await createForm.getByRole("button", { name: "Create dashboard" }).click();
  await expect(page.getByText("Dashboard created.")).toBeVisible({ timeout: 20_000 });
  await page.goto("/performance-operations/analytics/dashboards");
  await page.getByRole("link", { name: DASH_NAME }).first().click();
  await expect(page.getByTestId("widget-add-form")).toBeVisible({ timeout: 20_000 });

  const addForm = page.getByTestId("widget-add-form");
  // metric widget
  await addForm.locator('select[name="widgetType"]').selectOption("metric");
  await addForm.getByTestId("widget-metric").selectOption("appointments_completed");
  await addForm.getByTestId("widget-add").click();
  await expect(page.locator('[data-widget-type="metric"]')).toBeVisible({ timeout: 20_000 });
  // comparison widget
  await addForm.locator('select[name="widgetType"]').selectOption("comparison");
  await addForm.getByTestId("widget-metric").selectOption("appointments_completed");
  await addForm.getByTestId("widget-add").click();
  await expect(page.locator('[data-widget-type="comparison"]')).toBeVisible({ timeout: 20_000 });
  // trend widget
  await addForm.locator('select[name="widgetType"]').selectOption("trend");
  await addForm.getByTestId("widget-metric").selectOption("appointments_completed");
  await addForm.getByTestId("widget-add").click();
  await expect(page.locator('[data-widget-type="trend"]')).toBeVisible({ timeout: 20_000 });
  // goal widget referencing the ACTIVE goal from test 5
  await addForm.locator('select[name="widgetType"]').selectOption("goal_progress");
  await addForm.locator('select[name="goalId"]').selectOption({ label: GOAL_NAME });
  await addForm.getByTestId("widget-add").click();
  await expect(page.locator('[data-widget-type="goal_progress"]')).toBeVisible({
    timeout: 20_000,
  });

  // reorder: the first widget moves later
  const grid = page.getByTestId("dashboard-grid");
  const firstBefore = await grid.locator("[data-widget-id]").first().getAttribute("data-widget-id");
  await grid.locator("[data-widget-id]").first().getByTestId("widget-move-down").click();
  await expect
    .poll(
      async () =>
        grid.locator("[data-widget-id]").first().getAttribute("data-widget-id"),
      { timeout: 20_000 },
    )
    .not.toBe(firstBefore);

  // share within a department (admin holds share permissions)
  const shareForm = page.getByTestId("dashboard-share-form");
  await shareForm.getByTestId("dashboard-share-scope").selectOption("department");
  await shareForm.locator('select[name="departmentId"]').selectOption({ index: 0 });
  await shareForm.getByTestId("dashboard-share-save").click();
  await expect(page.getByText("Sharing set to department.")).toBeVisible({ timeout: 20_000 });

  // default, duplicate, archive-the-copy from the list
  await page.goto("/performance-operations/analytics/dashboards");
  const row = page.locator("li", { hasText: DASH_NAME }).first();
  await row.getByTestId("dashboard-set-default").click();
  await expect(
    page.locator("li", { hasText: DASH_NAME }).first().getByText("my default"),
  ).toBeVisible({ timeout: 20_000 });
  await row.getByTestId("dashboard-duplicate").click();
  await expect(page.locator("li", { hasText: `${DASH_NAME} (copy)` })).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator("li", { hasText: `${DASH_NAME} (copy)` })
    .first()
    .getByTestId("dashboard-archive")
    .click();
  await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/performance-operations/analytics/dashboards?show=archived");
  await expect(page.locator("li", { hasText: `${DASH_NAME} (copy)` })).toBeVisible({
    timeout: 20_000,
  });
});

test("9. cohorts render privacy-safe counts with department filters", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/cohorts");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/cohorts");
  await expect(page.getByTestId("cohort-filters")).toBeVisible({ timeout: 30_000 });
  // Either a populated heat map with the privacy note, or the explicit
  // empty state — never client names, never silent placeholders.
  const heatmap = page.getByTestId("cohort-heatmap");
  if (await heatmap.count()) {
    await expect(page.getByTestId("cohort-privacy-note")).toContainText(
      /No client names appear/,
    );
  } else {
    await expect(page.getByText("No client activity in this window")).toBeVisible();
  }
  // Department filter narrows without error.
  await page.getByTestId("cohort-filters").locator("a").nth(1).click();
  await expect(page.getByTestId("cohort-filters")).toBeVisible({ timeout: 20_000 });
});

test("10. presentation mode renders print-ready executive view", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/presentation");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/presentation");
  await expect(page.getByTestId("presentation-root")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Confidential — internal use only/).first()).toBeVisible();
  await expect(page.getByText(/Not final — figures may change/i).first()).toBeVisible();
  await expect(page.getByTestId("presentation-print")).toBeVisible();
  await page.getByTestId("presentation-exit").click();
  await expect(page).toHaveURL(/\/analytics$/);
});

test("11. dataset export downloads hashed CSV and records the event", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/performance-operations/analytics/datasets");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/datasets");
  await expect(page.getByTestId("dataset-list")).toBeVisible({ timeout: 20_000 });

  const response = await page.request.get("/performance-operations/analytics/datasets/export?dataset=metric_time_series");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-export-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  const body = await response.text();
  expect(body).toContain("Forecast-ready historical dataset");
  expect(body).toContain("metric_id");
  expect(body).toContain("finality");
  // No projected values, machine currency in cents: the note is embedded.
  expect(body).toContain("no projected values");

  await page.goto("/performance-operations/analytics/datasets");
  await expect(page.getByText("metric_time_series").first()).toBeVisible({ timeout: 20_000 });
});

test("12. analytics subscription executes with NOT FINAL labeling", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/performance-operations/reports?tab=scheduled");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/reports?tab=scheduled");
  await page.locator("#sched-type").waitFor({ timeout: 20_000 });
  await page.locator("#sched-type").selectOption("executive_scorecard");
  await page.locator("#sched-frequency").selectOption("monthly");
  await page.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByRole("status").first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/performance-operations/reports?tab=scheduled");
  const definitionRow = page
    .locator("li", { hasText: "executive scorecard" })
    .first();
  await definitionRow.getByTestId("run-report-now").waitFor({ timeout: 20_000 });
  const firstRowBefore = await page
    .locator("[data-scheduled-run-status]")
    .first()
    .innerText()
    .catch(() => "");
  await definitionRow.getByTestId("run-report-now").click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .locator("[data-scheduled-run-status]")
          .first()
          .innerText()
          .catch(() => "");
      },
      { timeout: 60_000 },
    )
    .not.toBe(firstRowBefore);
  await expect(
    page.locator('[data-scheduled-run-status="succeeded"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scheduled-run-history")).toContainText("not final");
});

test("13. responsive layout and keyboard navigation", async ({ page }) => {
  // Select the period at desktop width (the header selector hides on
  // mobile) — the cookie persists across the resize.
  await page.goto("/performance-operations/analytics");
  await selectPeriod(page, "E2E Payroll Window");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/performance-operations/analytics");
  await expect(page.getByTestId("analytics-headline")).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Keyboard: tabbing reaches the scorecard tab links.
  await page.goto("/performance-operations/analytics/scorecards");
  await expect(page.getByTestId("scorecard-tabs")).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 60; i++) {
    const inTabs = await page.evaluate(
      () => !!document.activeElement?.closest('[data-testid="scorecard-tabs"]'),
    );
    if (inTabs) break;
    await page.keyboard.press("Tab");
  }
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest('[data-testid="scorecard-tabs"]'),
    ),
  ).toBe(true);
});

test("14. saved period persists across analytics pages; cleanup leaves honest state", async ({ page }) => {
  test.setTimeout(120_000);
  // The period cookie persists across navigation within the session.
  await page.goto("/performance-operations/analytics");
  await selectPeriod(page, "E2E Payroll Window");
  await page.goto("/performance-operations/analytics/executive");
  await expect(page.getByTestId("analytical-summaries")).toBeVisible({ timeout: 30_000 });
  await page.goto("/performance-operations/analytics/goals");
  await expect(page.getByTestId("goal-list")).toBeVisible({ timeout: 20_000 });

  // Cleanup: cancel + archive the run's goals; deprecate + archive the
  // benchmark — nothing misleading stays active in the dev database.
  const goal = page.locator("li", { hasText: GOAL_NAME }).first();
  await goal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("li", { hasText: GOAL_NAME }).first()).toHaveAttribute(
    "data-goal-status",
    "cancelled",
    { timeout: 20_000 },
  );
  await page
    .locator("li", { hasText: GOAL_NAME })
    .first()
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.locator("li", { hasText: GOAL_NAME })).toHaveCount(0, {
    timeout: 20_000,
  });
  const deptGoal = page.locator("li", { hasText: DEPT_GOAL_NAME }).first();
  await deptGoal.getByRole("button", { name: "Cancel draft" }).click();
  await expect(
    page.locator("li", { hasText: DEPT_GOAL_NAME }).first(),
  ).toHaveAttribute("data-goal-status", "cancelled", { timeout: 20_000 });

  await page.goto("/performance-operations/analytics/benchmarks");
  const bench = page.locator("li", { hasText: BENCH_NAME }).first();
  await bench.getByRole("button", { name: "Deprecate" }).click();
  await expect(page.locator("li", { hasText: BENCH_NAME }).first()).toHaveAttribute(
    "data-benchmark-status",
    "deprecated",
    { timeout: 20_000 },
  );
});
