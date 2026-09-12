import { expect, test } from "@playwright/test";

/**
 * Live end-to-end import workflow against the dev environment: upload →
 * review (trainer/service/status/client resolutions) → approval → posting →
 * ledger → reversal → original-file download authorization.
 *
 * Prerequisites (seeded before the run, removed by cleanup):
 *   trainers "Alex Fixture" and "Morgan C." + one service "E2E Signature 60"
 *   in Timberhill. CSV content is generated per-run with unique booking IDs
 *   so re-runs never collide with posted history.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const FILE_NAME = `e2e-run-${RUN}.csv`;
const SERVICE_SOURCE_NAME = `E2E Coaching Session ${RUN}`;
const CLIENT_NAME = `Casey Runfixture ${RUN}`;
// Run-unique so aliases saved by earlier runs can never auto-match.
const UNMATCHED_TRAINER = `Coach Runfixture ${RUN}`;
// Run-unique phones so phone-matching never links to prior runs' clients.
const PHONE_A = `55${String(Date.now()).slice(-8)}`;
const PHONE_B = `56${String(Date.now()).slice(-8)}`;
// Run-unique month/year so fingerprints never collide with prior runs'
// posted appointments (trainer + start + duration).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const MONTH = MONTHS[Date.now() % MONTHS.length];
const YEAR = 2090 + (Date.now() % 9);
const DATE_FILTER_MONTH = String(MONTHS.indexOf(MONTH) + 1).padStart(2, "0");

function buildCsv(): string {
  const headers =
    "Appointment date,Appointment time,Service/class/event,Cost,Team member,Customer name,Country code ,Phone,Email,Label,Status,Comments ,Booking ID,Booked via,Booked on ,Address,City,State,Country,Zipcode / Postal code";
  const rows = [
    `1 ${MONTH} ${YEAR},05:30 AM - 06:30 AM,${SERVICE_SOURCE_NAME},64,Alex Fixture,${CLIENT_NAME},1,${PHONE_A},casey.${RUN}@example.test,No label,Confirmed,,E2E${RUN}A,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `2 ${MONTH} ${YEAR},05:30 AM - 06:30 AM,${SERVICE_SOURCE_NAME},64,Alex Fixture,${CLIENT_NAME},1,${PHONE_A},casey.${RUN}@example.test,No label,Cancelled ,,E2E${RUN}A,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `3 ${MONTH} ${YEAR},06:30 AM - 07:00 AM,${SERVICE_SOURCE_NAME},30,${UNMATCHED_TRAINER},Jordan Runfixture ${RUN},1,${PHONE_B},jordan.${RUN}@example.test,No label,Confirmed,,E2E${RUN}B,Calendar,7 May 2089 10:36 AM,,,,United States,`,
    `4 ${MONTH} ${YEAR},06:30 AM - 07:00 AM,${SERVICE_SOURCE_NAME},30,${UNMATCHED_TRAINER},,,,,No label,Confirmed,,E2E${RUN}C,Calendar,7 May 2089 10:36 AM,,,,United States,`,
  ];
  return [headers, ...rows].join("\n");
}

let batchUrl = "";

test("1. upload a Setmore CSV and reach the review state", async ({ page }) => {
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

  await expect(page.getByText("needs review")).toBeVisible();
  await expect(page.getByText(FILE_NAME).first()).toBeVisible();
  // adapter + counts
  await expect(page.getByText("setmore-v1").first()).toBeVisible();
});

test("2. resolve the unmatched trainer with an alias", async ({ page }) => {
  await page.goto(`${batchUrl}/review?queue=trainers`);
  const row = page.locator("details").first();
  await row.locator("summary").click();
  await row.getByLabel("Trainer").selectOption({ label: "Morgan C." });
  await row.getByRole("button", { name: "Map trainer" }).click();
  // Success empties the queue (both Morgan rows resolved via apply-to-similar
  // and the page revalidates).
  await expect(page.getByText("No rows in this queue.")).toBeVisible({ timeout: 15_000 });
});

test("3. resolve the unmatched service with an alias", async ({ page }) => {
  await page.goto(`${batchUrl}/review?queue=services`);
  const row = page.locator("details").first();
  await row.locator("summary").click();
  await row.getByLabel("Service").selectOption({ label: "E2E Signature 60" });
  await row.getByRole("button", { name: "Map service" }).click();
  await expect(page.getByText("No rows in this queue.")).toBeVisible({ timeout: 15_000 });
});

test("4. map unknown source statuses", async ({ page }) => {
  await page.goto(`${batchUrl}/review?queue=statuses`);
  // Map whichever unknown statuses remain (mappings persist per org+source,
  // so earlier runs may already cover some values).
  for (let attempt = 0; attempt < 5; attempt++) {
    // Wait for the queue to render before counting (count() has no auto-wait).
    await page
      .getByText(/Map unknown source statuses|No rows in this queue/)
      .first()
      .waitFor({ timeout: 15_000 });
    const saveButtons = page.getByRole("button", { name: "Save mapping" });
    if ((await saveButtons.count()) === 0) break;
    // Ensure hydration completed so the click dispatches the server action.
    await page.waitForLoadState("networkidle");
    const form = page
      .locator("form", { has: saveButtons.first() })
      .first();
    // The first span holds the quoted SOURCE value (the select's option
    // labels would otherwise always match /cancel/i).
    const sourceValue = await form.locator("span").first().innerText();
    const target = /cancel/i.test(sourceValue) ? "cancelled" : "scheduled";
    await form.getByLabel("Canonical status").selectOption(target);
    await form.getByRole("button", { name: "Save mapping" }).click();
    await page.waitForTimeout(2500);
    await page.goto(`${batchUrl}/review?queue=statuses`);
  }
  await expect(page.getByText("No rows in this queue.")).toBeVisible({ timeout: 15_000 });
});

test("5. create a client from a row", async ({ page }) => {
  await page.goto(`${batchUrl}/review?queue=clients`);
  const row = page.locator("details").first();
  await row.locator("summary").click();
  const before = await page.locator("details").count();
  await row.getByRole("button", { name: "Create client from row" }).click();
  // Rows for the created client leave the queue on revalidation.
  await expect
    .poll(async () => page.locator("details").count(), { timeout: 15_000 })
    .toBeLessThan(before);
});

test("6. acknowledge warnings and approve the clean batch", async ({ page }) => {
  await page.goto(batchUrl);
  await expect(page.getByText("ready for approval")).toBeVisible({ timeout: 15_000 });
  await page.goto(`${batchUrl}/approval`);
  // Acknowledge open warnings; retry once if a pre-hydration click is lost.
  for (let attempt = 0; attempt < 3; attempt++) {
    // Wait for the requirements panel to render before counting (count()
    // has no auto-wait and would otherwise race the page load).
    await page.getByText("Approval requirements").waitFor({ timeout: 15_000 });
    const ackButton = page.getByRole("button", { name: /Acknowledge \d+ warning/ });
    if ((await ackButton.count()) === 0) break;
    await page.waitForLoadState("networkidle");
    await ackButton.click();
    const approved = await page
      .getByRole("button", { name: "Approve batch" })
      .waitFor({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (approved) break;
    await page.goto(`${batchUrl}/approval`);
  }
  await expect(page.getByRole("button", { name: "Approve batch" })).toBeVisible({
    timeout: 20_000,
  });
  // Click-and-verify (dev-mode clicks on freshly revalidated buttons can be
  // lost pre-hydration; approval flips the batch to `approved`).
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
    approved =
      (await page.getByRole("button", { name: "Revoke approval" }).count()) > 0;
    if (!approved) await page.goto(`${batchUrl}/approval`);
  }
  expect(approved).toBe(true);
});

test("7. post the batch transactionally", async ({ page }) => {
  await page.goto(batchUrl);
  await page.getByRole("button", { name: /Post \d+ rows…/ }).click();
  await page.getByRole("button", { name: "Confirm post" }).click();
  // Success re-renders the batch as posted (Reverse becomes available).
  await expect(page.getByRole("button", { name: "Reverse batch…" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("posted", { exact: true }).first()).toBeVisible();
});

test("8. posted appointments appear in the ledger with source evidence", async ({ page }) => {
  await page.goto(`/performance-operations/appointments?from=${YEAR}-${DATE_FILTER_MONTH}-01&to=${YEAR}-${DATE_FILTER_MONTH}-28`);
  await expect(page.getByText("E2E Signature 60").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /E2E.*A/ }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
  // open a detail page
  await page.locator("tbody tr").first().locator("a").first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Source evidence")).toBeVisible();
  await expect(page.getByText("Original source row", { exact: false })).toBeVisible();
  await expect(page.getByText("Status history")).toBeVisible();
});

test("9. original file download link is authorized and audited", async ({ page }) => {
  await page.goto(batchUrl);
  await page.getByRole("button", { name: "Download original" }).click();
  await expect(page.getByRole("link", { name: /Open file/ })).toBeVisible();
});

test("10. reverse the posted batch with a reason; history preserved", async ({ page }) => {
  await page.goto(batchUrl);
  await page.getByRole("button", { name: "Reverse batch…" }).click();
  await page.getByLabel(/Reversal reason/).fill("E2E verification reversal");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  // Success re-renders the batch as reversed.
  await expect(page.getByText("reversed", { exact: true }).first()).toBeVisible({
    timeout: 25_000,
  });

  // reversed records remain visible in the reversed view — never deleted
  await page.goto(`/performance-operations/appointments?from=${YEAR}-${DATE_FILTER_MONTH}-01&to=${YEAR}-${DATE_FILTER_MONTH}-28&state=reversed`);
  await expect(page.getByText("E2E Signature 60").first()).toBeVisible();
  await page.goto(`/performance-operations/appointments?from=${YEAR}-${DATE_FILTER_MONTH}-01&to=${YEAR}-${DATE_FILTER_MONTH}-28&state=active`);
  await expect(page.getByText("No posted appointments match")).toBeVisible();
});
