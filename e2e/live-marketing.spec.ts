import { expect, test } from "@playwright/test";

/**
 * The public marketing routes must stay public with Supabase configured.
 *
 * This belongs in the LIVE suite specifically. `src/proxy.ts` only enforces
 * route protection when Supabase environment variables are present, so the
 * offline suite cannot see this class of failure at all: with no Supabase the
 * proxy returns early and every path looks public.
 *
 * The regression it guards is not hypothetical. When these pages were first
 * merged into the application, `/personal-training` was absent from the
 * proxy's allow-list, so every visitor to the club's marketing site would have
 * been redirected to an internal login page. Anything added under
 * `(marketing)` needs a case here.
 */

test.describe("public marketing routes, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const routes = [
    { path: "/personal-training", heading: "PERSONAL TRAINING" },
    { path: "/personal-training/trainers", heading: "Our Trainers" },
    {
      path: "/personal-training/consultation",
      heading: "The Free Fitness Consultation",
    },
    { path: "/personal-training/trainers/jr-romero", heading: "JR Romero" },
  ];

  for (const route of routes) {
    test(`${route.path} serves the public without a session`, async ({
      page,
    }) => {
      const response = await page.goto(route.path);

      expect(response?.status()).toBe(200);
      // The failure mode being guarded is a redirect, so assert the URL did
      // not move as well as the status.
      expect(new URL(page.url()).pathname).not.toContain("/login");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        route.heading,
      );
    });
  }

  test("the application itself still requires a session", async ({ page }) => {
    // The counterpart assertion: opening the marketing routes must not have
    // widened access to anything else.
    await page.goto("/performance-operations/payroll");
    await page.waitForURL(
      "**/login?next=%2Fperformance-operations%2Fpayroll",
    );
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a marketing-lookalike path is not public", async ({ page }) => {
    // The allow-list matches whole segments, so this must still be protected.
    await page.goto("/personal-training-internal");
    await page.waitForURL("**/login**");
  });

  test("an old top-level platform path redirects into the namespace", async ({
    page,
  }) => {
    // Staff bookmarks and pre-move notification links still point at /payroll.
    await page.goto("/payroll");
    await page.waitForURL("**/login?next=%2Fperformance-operations%2Fpayroll");
  });
});
