import { expect, test } from "@playwright/test";

/**
 * The whole deployment is private: with Supabase configured, the marketing
 * preview routes require a session exactly like the operations platform.
 *
 * This belongs in the LIVE suite specifically. `src/proxy.ts` only enforces
 * route protection when Supabase environment variables are present, so the
 * offline suite cannot see this class of failure at all: with no Supabase the
 * proxy returns early and every path looks public.
 *
 * These routes were public until the hub was locked. If one is ever re-opened
 * (by adding its prefix to `PUBLIC_MARKETING_PREFIXES`), it needs its own case
 * here asserting a 200 without a session.
 */

test.describe("marketing preview routes, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const routes = [
    "/",
    "/personal-training",
    "/personal-training/trainers",
    "/personal-training/consultation",
    "/personal-training/trainers/jr-romero",
  ];

  for (const path of routes) {
    test(`${path} requires a session`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL("**/login**");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
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
    // Still protected, with or without an allow-list entry beside it.
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
