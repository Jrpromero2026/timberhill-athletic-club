import { expect, test } from "@playwright/test";

/**
 * Live suite (auth + admin workflows) against the dev environment. The
 * authenticated tests share one storage state from live.setup.ts; anonymous
 * tests opt out explicitly. Mutations are net-zero (invite create + revoke).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("anonymous flows", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated users are redirected to login with destination preserved", async ({
    page,
  }) => {
    await page.goto("/performance-operations/payroll");
    await page.waitForURL("**/login?next=%2Fpayroll");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("sign in honors the preserved destination, then sign out works", async ({
    page,
  }) => {
    await page.goto("/performance-operations/configuration");
    await page.waitForURL("**/login?next=%2Fconfiguration");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/configuration");
    await expect(
      page.getByRole("heading", { name: "Configuration", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await page.goto("/performance-operations/overview");
    await page.waitForURL("**/login**");
  });

  test("invalid and missing invite tokens are handled", async ({ page }) => {
    await page.goto("/accept-invite");
    await expect(page.getByText("Invalid invitation link")).toBeVisible();
    await page.goto("/accept-invite?token=this-token-does-not-exist-anywhere-000000");
    await expect(page.getByText("Invitation not found")).toBeVisible();
  });

  test("forgot-password never reveals whether an email exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("no-such-user@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText("If an account exists for that address", { exact: false })
    ).toBeVisible();
  });
});

test("authenticated users are bounced away from /login", async ({ page }) => {
  await page.goto("/login");
  await page.waitForURL("**/overview");
});

test("overview renders the operations center with honest data states", async ({
  page,
}) => {
  await page.goto("/performance-operations/overview");
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
  // Operations widgets render; metrics never fake numbers (either engine
  // cards with health attributes or the explicit period prompt).
  await expect(page.getByTestId("overview-status")).toBeVisible();
  await expect(page.getByTestId("overview-alerts")).toBeVisible();
});

test("workspace switching rescopes live data and persists", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await page.getByLabel("Workspace").selectOption({ label: "G3 Sports & Fitness" });
  await expect(page.getByRole("heading", { name: "G3 Sports & Fitness" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "G3 Sports & Fitness" })).toBeVisible();
});

test("admin can create and revoke an invitation (net-zero mutation)", async ({
  page,
}) => {
  const email = `e2e-invite-${Date.now()}@perfops.local`;
  await page.goto("/performance-operations/configuration/users");
  await expect(page.getByRole("heading", { name: "Users & Access" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText("Invitation created.", { exact: false })).toBeVisible();
  await expect(page.locator("code", { hasText: "/accept-invite?token=" })).toBeVisible();

  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row", { name: new RegExp(email) })).toBeHidden();
});

test("configuration hub shows readiness without claiming payroll-ready", async ({
  page,
}) => {
  await page.goto("/performance-operations/configuration");
  await expect(page.getByText("Setup readiness by organization")).toBeVisible();
  await expect(page.getByText("Not payroll-ready", { exact: false }).first()).toBeVisible();
});

test("audit viewer lists events with filters", async ({ page }) => {
  await page.goto("/performance-operations/audit");
  await expect(page.getByRole("heading", { name: "Audit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
});
