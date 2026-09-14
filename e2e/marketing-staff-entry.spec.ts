import { expect, test } from "@playwright/test";

/**
 * The staff entry point into Performance Operations.
 *
 * The rule this guards is a privacy one, not a security one — `src/proxy.ts`
 * is what actually protects the application. The rule here is that the club's
 * public navigation does not advertise an internal payroll and KPI tool to a
 * prospective member reading about personal training.
 */

/** The shape `@supabase/ssr` writes; the value is irrelevant, only presence. */
const SESSION_COOKIE = {
  name: "sb-testprojectref-auth-token",
  value: "not-a-real-token",
  domain: "localhost",
  path: "/",
};

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the public navigation does not mention the application", async ({
    page,
  }) => {
    await page.goto("/personal-training");
    await expect(page.locator(".subnav .staff-link")).toHaveCount(0);
  });

  test("it is absent from the prerendered HTML, not merely hidden", async ({
    request,
  }) => {
    // The pages are statically prerendered and served from a shared cache, so
    // the markup has to be identical for every visitor. A link hidden with CSS
    // would still sit in the document for anyone who reads the source.
    const html = await (await request.get("/personal-training")).text();
    expect(html).not.toContain("staff-link");
  });

  test("the footer still offers a way in", async ({ page }) => {
    await page.goto("/personal-training");
    const link = page.locator(".f-staff");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/performance-operations");
  });
});

test.describe("with a session cookie", () => {
  test.use({ storageState: { cookies: [SESSION_COOKIE], origins: [] } });

  /**
   * The invariant is "a signed-in staff member can reach the application from
   * the site chrome", which is one thing in two places: the utility strip on
   * desktop, and the hamburger menu on a phone, where that strip is hidden by
   * design and its links move into the menu. Asserting the desktop markup on
   * both viewports tests the layout, not the behaviour.
   */
  async function staffTab(page: import("@playwright/test").Page) {
    // Branch on the viewport, not on whether the link is on screen yet: it is
    // rendered after hydration, so probing visibility races the client and
    // falls through to a hamburger that does not exist on desktop. 760px is
    // the breakpoint in marketing.css where the strip gives way to the menu.
    const mobile = (page.viewportSize()?.width ?? 0) <= 760;
    if (!mobile) return page.locator(".subnav .staff-link");

    await page.locator(".hamburger").click();
    return page.locator(".mobile-menu .staff-link");
  }

  test("the tab appears in the site navigation", async ({ page }) => {
    await page.goto("/personal-training");

    const tab = await staffTab(page);
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("href", "/performance-operations");
  });

  test("the tab is on every public route", async ({ page }) => {
    for (const route of [
      "/personal-training/trainers",
      "/personal-training/consultation",
      "/personal-training/trainers/jr-romero",
    ]) {
      await page.goto(route);
      await expect(await staffTab(page)).toBeVisible();
    }
  });
});
