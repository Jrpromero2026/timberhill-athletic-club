import { expect, test } from "@playwright/test";

/**
 * Shell + navigation coverage. Runs against the offline preview (no Supabase
 * required): the unauthenticated state must render every route with the
 * shared layout, and never crash or leak an error page.
 */

const ROUTES: Array<{ path: string; heading: string }> = [
  { path: "/imports", heading: "Imports" },
  { path: "/appointments", heading: "Appointments" },
  { path: "/revenue", heading: "Revenue" },
  { path: "/payroll", heading: "Payroll" },
  { path: "/trainers", heading: "Trainers" },
  { path: "/clients", heading: "Clients" },
  { path: "/reports", heading: "Reports" },
  { path: "/configuration", heading: "Configuration" },
  { path: "/audit", heading: "Audit" },
];

test("root redirects to the public site, not the operations app", async ({
  page,
}) => {
  // The public owns the front door; staff enter the platform at /overview.
  await page.goto("/");
  await page.waitForURL("**/personal-training");
  await expect(page).toHaveTitle(/Timberhill Athletic Club/);
});

test("the operations app is still reachable at /overview", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveTitle(/Overview · Performance Operations/);
});

test("overview renders workspace data and honest KPI placeholders", async ({
  page,
}) => {
  await page.goto("/overview");
  // Default workspace resolves to the first seeded organization.
  await expect(
    page.getByRole("heading", { name: "Timberhill Athletic Club" })
  ).toBeVisible();
  // KPI cards must show the awaiting-data state, never fabricated numbers.
  await expect(page.getByText("Waiting for imported data")).toHaveCount(6);
  // Department summary shows the workspace's departments.
  await expect(page.getByRole("cell", { name: "Personal Training" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "PACK Training" })).toBeVisible();
});

test("unauthenticated state is explicit in the user menu", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByRole("menu").getByText("Not signed in")).toBeVisible();
});

for (const route of ROUTES) {
  test(`route ${route.path} renders with shared layout`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { name: route.heading, exact: true })
    ).toBeVisible();
    if (isMobile) {
      // Mobile: navigation lives in the drawer.
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" })
      ).toBeVisible();
    } else {
      // Desktop: persistent sidebar with the current item marked active.
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByRole("link", { name: route.heading })).toHaveAttribute(
        "aria-current",
        "page"
      );
    }
  });
}

test("sidebar navigation moves between routes without full reloads", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "covered by drawer navigation test");
  await page.goto("/overview");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Payroll" })
    .click();
  await page.waitForURL("**/payroll");
  await expect(
    page.getByRole("heading", { name: "Payroll", exact: true })
  ).toBeVisible();
});

test("mobile drawer opens, navigates, and closes", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile-only behavior");
  await page.goto("/overview");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Reports" })
    .click();
  await page.waitForURL("**/reports");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeHidden();
});

test("unknown routes show the not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to Overview" })
  ).toBeVisible();
});
