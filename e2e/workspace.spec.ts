import { expect, test } from "@playwright/test";

/**
 * Workspace-selector coverage: switching, persistence across navigation and
 * refresh, All Workspaces scoping. Runs against the offline preview, which
 * mirrors the seeded organizations.
 */

test("workspace switch rescopes the overview", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();

  await page
    .getByLabel("Workspace")
    .selectOption({ label: "G3 Sports & Fitness" });

  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();
  // Department list rescopes to the selected organization.
  await expect(
    page.getByRole("cell", { name: "Athlete Performance" })
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Personal Training" })
  ).toBeHidden();
});

test("selection persists across navigation and browser refresh", async ({
  page,
}) => {
  await page.goto("/performance-operations/overview");
  await page
    .getByLabel("Workspace")
    .selectOption({ label: "G3 Sports & Fitness" });
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();

  // Navigate away and back.
  await page.goto("/performance-operations/payroll");
  await expect(page.getByLabel("Workspace")).toContainText("G3 Sports & Fitness");
  await page.goto("/performance-operations/overview");
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();

  // Hard refresh.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "G3 Sports & Fitness" })
  ).toBeVisible();
});

test("All Workspaces aggregates both organizations", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await page.getByLabel("Workspace").selectOption({ label: "All Workspaces" });

  await expect(
    page.getByRole("heading", { name: "All Workspaces" })
  ).toBeVisible();
  await expect(page.getByText("Cross-organization view")).toBeVisible();
  // Departments from BOTH organizations are visible.
  await expect(
    page.getByRole("cell", { name: "Personal Training" })
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Athlete Performance" })
  ).toBeVisible();
});

test("a tampered workspace cookie falls back to an accessible workspace", async ({
  page,
  context,
}) => {
  // Forge the cookie to an organization ID the user cannot access.
  await context.addCookies([
    {
      name: "po-workspace",
      value: "99999999-9999-9999-9999-999999999999",
      url: "http://localhost:3100",
    },
  ]);
  await page.goto("/performance-operations/overview");
  // Server-side validation ignores the forged value and falls back.
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
});
