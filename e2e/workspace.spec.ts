import { expect, test } from "@playwright/test";

/**
 * The hub is Timberhill's alone. Runs against the offline preview, which
 * mirrors the seeded organizations (Timberhill and G3): only Timberhill may
 * be offered, and no cookie value may select anything else.
 */

test("there is no workspace switcher", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
  await expect(page.getByLabel("Workspace")).toHaveCount(0);
});

for (const value of [
  "bootstrap-g3-sports-fitness",
  "all",
  "99999999-9999-9999-9999-999999999999",
]) {
  test(`a "${value}" workspace cookie still shows Timberhill`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "po-workspace", value, url: "http://localhost:3100" },
    ]);
    await page.goto("/performance-operations/overview");
    await expect(
      page.getByRole("heading", { name: "Timberhill Athletic Club" })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Personal Training" })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Athlete Performance" })
    ).toHaveCount(0);
  });
}
