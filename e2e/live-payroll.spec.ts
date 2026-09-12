import { expect, test } from "@playwright/test";

/**
 * Live end-to-end payroll workflow against the dev environment:
 * import synthetic appointments → create run → calculate → review (traces,
 * review marks) → submit → approve → post → statements + CSV → dependency
 * guard blocks import reversal → lock → supersede → void replacement →
 * reversal allowed again.
 *
 * Prerequisites (seeded once via MCP SQL; see PHASE_4_REPORT):
 *   trainer "Payton E2E Payroll" (Timberhill) with a published plan
 *   "E2E Payroll 50% Split" (percentage_of_revenue, 50% of listed value,
 *   completed-only, per_line) assigned for purpose primary from 2090-01-01,
 *   service "E2E Signature 60", and reporting period "E2E Payroll Window"
 *   (custom, 2090-01-01 – 2098-12-31, open).
 *
 * Dates and booking IDs are run-unique so appointment fingerprints never
 * collide with prior runs; the spec supersedes its run and reverses its
 * batch at the end so the one-active-run index and the window stay clean
 * for the next run. Adjustment/time approval is NOT exercised here because
 * the suite runs as a single admin and self-approval is (correctly)
 * rejected — that separation is covered by unit + live SQL checks.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const FILE_NAME = `e2e-payroll-${RUN}.csv`;
const RUN_NAME = `E2E Payroll Run ${RUN}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const MONTH = MONTHS[Date.now() % MONTHS.length];
const YEAR = 2090 + (Date.now() % 9);

function buildCsv(): string {
  const headers =
    "Appointment date,Appointment time,Service/class/event,Cost,Team member,Customer name,Country code ,Phone,Email,Label,Status,Comments ,Booking ID,Booked via,Booked on ,Address,City,State,Country,Zipcode / Postal code";
  const rows = [
    // Two completed sessions (64.00 + 100.00 listed → 50% split = 82.00)…
    `3 ${MONTH} ${YEAR},05:30 AM - 06:30 AM,E2E Signature 60,64,Payton E2E Payroll,,,,,No label,Completed,,PAY${RUN}A,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `4 ${MONTH} ${YEAR},07:00 AM - 08:00 AM,E2E Signature 60,100,Payton E2E Payroll,,,,,No label,Completed,,PAY${RUN}B,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    // …and one cancelled session that must be excluded, not paid.
    `5 ${MONTH} ${YEAR},09:00 AM - 09:30 AM,E2E Signature 60,30,Payton E2E Payroll,,,,,No label,Cancelled ,,PAY${RUN}C,Calendar,7 May 2089 10:36 AM,,,,United States,`,
  ];
  return [headers, ...rows].join("\n");
}

let batchUrl = "";
let runUrl = "";

test("1. import synthetic completed sessions for the payroll trainer", async ({ page }) => {
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

  // Resolve the unmatched service once — the saved alias makes later runs
  // auto-match (service matching is alias-based, unlike trainer names).
  await page.goto(`${batchUrl}/review?queue=services`);
  await page.waitForLoadState("networkidle");
  if ((await page.locator("details").count()) > 0) {
    const row = page.locator("details").first();
    await row.locator("summary").click();
    await row.getByLabel("Service").selectOption({ label: "E2E Signature 60" });
    await row.getByRole("button", { name: "Map service" }).click();
    await expect(page.getByText("No rows in this queue.")).toBeVisible({ timeout: 15_000 });
  }

  // Map unknown source statuses (mappings persist per org+source, so earlier
  // runs may already cover them).
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
});

test("2. approve and post the batch", async ({ page }) => {
  await page.goto(`${batchUrl}/approval`);
  // Acknowledge any warnings (e.g. missing client references).
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

test("3. create a payroll run for the e2e window", async ({ page }) => {
  await page.goto("/performance-operations/payroll/new");
  // #run-period, not the header's period selector (both say "Reporting period").
  const periodSelect = page.locator("#run-period");
  const optionValue = await periodSelect
    .locator("option", { hasText: "E2E Payroll Window" })
    .first()
    .getAttribute("value");
  expect(optionValue).toBeTruthy();
  await periodSelect.selectOption(optionValue!);
  await page.getByLabel("Run name").fill(RUN_NAME);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create draft run" }).click();
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  runUrl = new URL(page.url()).pathname;
  await expect(page.getByText(RUN_NAME).first()).toBeVisible();
  await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();
});

test("4. calculate the run deterministically from the ledger", async ({ page }) => {
  await page.goto(runUrl);
  await page.waitForLoadState("networkidle");
  // Click-and-verify: success re-renders the run in needs_review.
  let calculated = false;
  for (let attempt = 0; attempt < 3 && !calculated; attempt++) {
    const button = page.getByRole("button", { name: /^(Calculate|Recalculate)$/ });
    if (await button.count()) {
      await page.waitForLoadState("networkidle");
      await button.first().click();
      await page.waitForTimeout(4000);
    }
    await page.goto(runUrl);
    await page.getByText("Trainer summaries").waitFor({ timeout: 15_000 });
    calculated = (await page.getByText("needs review").first().count()) > 0;
  }
  expect(calculated).toBe(true);

  // 50% of $164.00 listed on completed sessions only.
  await expect(page.getByText("$82.00").first()).toBeVisible();
  await expect(page.getByText("Payton E2E Payroll").first()).toBeVisible();
});

test("5. review shows lines, exclusions, and calculation traces", async ({ page }) => {
  await page.goto(`${runUrl}/review`);
  await expect(page.getByText("No open issues.")).toBeVisible({ timeout: 15_000 });
  const trainerSection = page.locator("details", { hasText: "Payton E2E Payroll" }).first();
  await trainerSection.locator("summary").first().click();
  // Two calculated percentage lines + the excluded cancelled session.
  await expect(trainerSection.getByText("$32.00").first()).toBeVisible();
  await expect(trainerSection.getByText("$50.00").first()).toBeVisible();
  await expect(trainerSection.getByText(/excluded/).first()).toBeVisible();
  // Calculation trace is inspectable for authorized reviewers.
  await trainerSection.getByText("trace").first().click();
  await expect(trainerSection.getByText(/"calc-v1"/).first()).toBeVisible();

  // Structured review: mark the trainer reviewed.
  await page.waitForLoadState("networkidle");
  await trainerSection.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(trainerSection.getByRole("button", { name: "Unmark reviewed" })).toBeVisible({
    timeout: 15_000,
  });
});

test("6. submit, approve, and post the run", async ({ page }) => {
  await page.goto(runUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("button", { name: "Approve run" })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Approve run" }).click();
  await expect(page.getByRole("button", { name: "Post run" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Post run" }).click();
  // Posting freezes the run and records a hashed snapshot.
  await expect(page.getByText("Posted snapshots")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/sha256 [0-9a-f]{16}/).first()).toBeVisible();
  await expect(page.getByText("posted", { exact: true }).first()).toBeVisible();
});

test("7. statements and CSV exports are available", async ({ page }) => {
  await page.goto(`${runUrl}/statements`);
  await expect(page.getByRole("heading", { name: "Department summary" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("$82.00").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download department summary CSV" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View statement" }).first().click();
  await page.waitForURL(/\/statements\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText("Payroll Preparation Statement")).toBeVisible();
  await expect(page.getByText("FINAL GROSS")).toBeVisible();
  await expect(page.getByText("$82.00").first()).toBeVisible();
  await expect(page.getByText(/not net pay/i).first()).toBeVisible();

  // CSV endpoint responds with the statement (authorized in-session).
  const response = await page.request.get(`${page.url()}/export`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const body = await response.text();
  expect(body).toContain("Trainer Payroll Preparation Statement");
  expect(body).toContain("82.00");
});

test("8. posted payroll blocks import reversal (dependency guard)", async ({ page }) => {
  await page.goto(batchUrl);
  await expect(page.getByText("Reversal blocked by payroll")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Reverse batch…" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: RUN_NAME })).toBeVisible();
});

test("9. lock, supersede, and void the replacement draft", async ({ page }) => {
  await page.goto(runUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Lock run" }).click();
  await expect(page.getByText("locked", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Supersede with new run…" }).click();
  await page
    .getByLabel(/Supersession reason/)
    .fill("E2E verification supersession");
  await page.getByRole("button", { name: "Confirm supersede" }).click();
  await expect(page.getByText("superseded", { exact: true }).first()).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText(/Superseded by/)).toBeVisible();

  // Void the replacement draft so the period is free for the next e2e run.
  await page.getByRole("link", { name: /\(superseding\)/ }).click();
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Void run…" }).click();
  await page.getByLabel(/Void reason/).fill("E2E cleanup void");
  await page.getByRole("button", { name: "Confirm void" }).click();
  await expect(page.getByText("voided", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test("10. superseded payroll releases the reversal guard", async ({ page }) => {
  await page.goto(batchUrl);
  await expect(page.getByRole("button", { name: "Reverse batch…" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Reverse batch…" }).click();
  await page.getByLabel(/Reversal reason/).fill("E2E payroll cleanup reversal");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(page.getByText("reversed", { exact: true }).first()).toBeVisible({
    timeout: 25_000,
  });
});
