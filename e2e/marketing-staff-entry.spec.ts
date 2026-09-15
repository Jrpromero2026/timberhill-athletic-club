import { expect, test } from "@playwright/test";

/**
 * The staff entry point into Performance Operations.
 *
 * It is permanent and public by decision of the PT Director — the tab used to
 * appear only for a visitor carrying a session cookie. These tests pin the two
 * things that keep a public link to an internal application harmless: it
 * reaches every marketing page, and it stays out of the search index.
 */

const ROUTES = [
  "/personal-training",
  "/personal-training/trainers",
  "/personal-training/consultation",
  "/personal-training/trainers/jr-romero",
] as const;

/** 760px is the breakpoint in marketing.css where the utility strip gives way
 *  to the hamburger menu, and the tab moves with it. */
async function staffTab(page: import("@playwright/test").Page) {
  const mobile = (page.viewportSize()?.width ?? 0) <= 760;
  if (!mobile) return page.locator(".subnav .staff-link");

  await page.locator(".hamburger").click();
  return page.locator(".mobile-menu .staff-link");
}

test.describe("the tab", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    test(`${route} carries it, signed out`, async ({ page }) => {
      await page.goto(route);

      const tab = await staffTab(page);
      await expect(tab).toBeVisible();
      await expect(tab).toHaveAttribute("href", "/performance-operations");
    });
  }

  test("it is server-rendered, not drawn by script", async ({ request }) => {
    // These pages are statically prerendered and served from a shared cache.
    // A link that only appears after hydration would be missing for anyone
    // with JavaScript off, and missing from the cached document entirely.
    const html = await (await request.get("/personal-training")).text();
    expect(html).toContain("staff-link");
    expect(html).toContain('href="/performance-operations"');
  });

  test("the footer keeps its own way in", async ({ page }) => {
    await page.goto("/personal-training");
    const link = page.locator(".f-staff");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/performance-operations");
  });
});

test.describe("kept out of the index", () => {
  test("the link is nofollow", async ({ page }) => {
    await page.goto("/personal-training");
    await expect(page.locator(".subnav .staff-link").first()).toHaveAttribute(
      "rel",
      "nofollow",
    );
  });

  test("robots.txt disallows the destination, slash or no slash", async ({
    request,
  }) => {
    const body = await (await request.get("/robots.txt")).text();

    // `Disallow: /performance-operations/` is a prefix match, so it does NOT
    // cover `/performance-operations` — which is exactly the URL this tab
    // links to. The gap only mattered once the link became public.
    expect(body).toContain("Disallow: /performance-operations");
    const rules = body.match(/Disallow: \/performance-operations\S*/g) ?? [];
    expect(rules.some((rule) => !rule.endsWith("/"))).toBe(true);
  });

  test("the destination is not in the sitemap", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).not.toContain("performance-operations");
  });
});
