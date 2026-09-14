import { expect, test } from "@playwright/test";
import {
  canonicalPath,
  HUB_FAQS,
  SITE_ORIGIN,
  TRAINERS,
} from "../src/lib/marketing/personal-training";

/**
 * The machine-readable surface of the public site.
 *
 * None of this is visible on a page, which is exactly why it needs a test: a
 * canonical pointing at the wrong host, a sitemap that disagrees with it, or a
 * share card that silently stops rendering are all invisible in review and
 * expensive in the index. Each of these guards a regression that actually
 * happened during the audit that produced them.
 */

const ROUTES = [
  "/personal-training",
  "/personal-training/trainers",
  "/personal-training/consultation",
  "/personal-training/trainers/jr-romero",
] as const;

test.describe("canonical URLs", () => {
  for (const route of ROUTES) {
    test(`${route} canonicalises to itself on the publishing host`, async ({
      page,
    }) => {
      await page.goto(route);
      const href = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");

      // The regression: every route canonicalised to timberhillac.com, a host
      // this deployment does not serve — a request to be dropped from the
      // index in favour of a URL that may not exist.
      expect(href).toBe(`${SITE_ORIGIN}${canonicalPath(route)}`);
    });
  }

  test("the trainer profile agrees with its own Person node", async ({
    page,
  }) => {
    // These disagreed about the trailing slash, which is two URLs for one page.
    await page.goto("/personal-training/trainers/jr-romero");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const person = blocks
      .map((block) => JSON.parse(block))
      .find((data) => data["@type"] === "Person");

    expect(person.url).toBe(canonical);
  });
});

test.describe("crawl directives", () => {
  test("robots.txt allows the marketing routes and hides the application", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Disallow: /performance-operations/");
    expect(body).toContain("Disallow: /login");
    expect(body).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    // The answer engines are named explicitly so a future tightening of the
    // wildcard cannot lock them out of the pages written for them.
    expect(body).toContain("GPTBot");
    expect(body).toContain("ClaudeBot");
  });

  test("the sitemap lists exactly the public routes, and no others", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const body = await response.text();
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    const published = TRAINERS.filter((trainer) => trainer.profile).length;

    expect(locs).toHaveLength(3 + published);
    // A sitemap that disagrees with the canonical on the page it points at is
    // worse than no sitemap, so assert the exact strings.
    expect(locs).toContain(`${SITE_ORIGIN}/personal-training/`);
    expect(locs).toContain(`${SITE_ORIGIN}/personal-training/trainers/`);
    expect(locs).toContain(`${SITE_ORIGIN}/personal-training/consultation/`);
    // The staff application must never appear.
    expect(body).not.toContain("performance-operations");
  });

  test("the front door redirects permanently", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    // 307 keeps the root in the index and passes nothing through.
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toContain("/personal-training");
  });

  test("llms.txt describes the site and quotes no price", async ({
    request,
  }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Timberhill Athletic Club");
    expect(body).toContain(`${SITE_ORIGIN}/personal-training/`);
    // Generated from the same constants the pages render, so the roster
    // cannot drift out of sync with it.
    for (const trainer of TRAINERS) expect(body).toContain(trainer.name);
    // §5: no rate is published anywhere, and a machine-readable summary is
    // not a loophole.
    expect(body).toMatch(/Rates are not published/);
    expect(body).not.toMatch(/\$\d/);
  });
});

test.describe("share cards", () => {
  for (const route of ROUTES) {
    test(`${route} carries an image for a link preview`, async ({ page }) => {
      await page.goto(route);

      // The regression: declaring the card only on the layout lost it on every
      // page, because Next replaces a parent's openGraph rather than merging.
      const og = await page
        .locator('meta[property="og:image"]')
        .first()
        .getAttribute("content");
      expect(og).toBe(`${SITE_ORIGIN}/personal-training/og`);

      const card = await page
        .locator('meta[name="twitter:card"]')
        .getAttribute("content");
      expect(card).toBe("summary_large_image");
    });
  }

  test("the share card actually renders", async ({ request }) => {
    const response = await request.get("/personal-training/og");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("answer-engine surface", () => {
  test("the hub answers questions under question-shaped headings", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    const headings = await page.locator("h1, h2, h3").allInnerTexts();
    const questions = headings.filter((text) => text.trim().endsWith("?"));
    // Was zero of forty-three. The extractable pattern is a question heading
    // with a self-contained answer beneath it.
    expect(questions.length).toBeGreaterThanOrEqual(4);
  });

  test("the orientation comparison is a real table", async ({ page }) => {
    await page.goto("/personal-training");

    const table = page.locator("table.cmp-table");
    await expect(table).toBeVisible();
    // Headers on both axes — that is what makes the label/column/value
    // relationship readable to something that is not looking at the CSS.
    await expect(table.locator("thead th")).toHaveCount(3);
    await expect(table.locator('tbody th[scope="row"]')).toHaveCount(5);
    await expect(table.locator("caption")).toHaveCount(1);
  });

  test("the roster declares the people on it", async ({ page }) => {
    await page.goto("/personal-training/trainers");

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const list = blocks
      .map((block) => JSON.parse(block))
      .find((data) => data["@type"] === "ItemList");

    expect(list).toBeDefined();
    expect(list.itemListElement).toHaveLength(TRAINERS.length);
    const names = list.itemListElement.map(
      (entry: { item: { name: string } }) => entry.item.name,
    );
    for (const trainer of TRAINERS) expect(names).toContain(trainer.name);
  });

  test("the club declares its roster, service offers and a share image", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const graph = blocks.map((block) => JSON.parse(block));
    const club = graph.find((data) => data["@type"] === "HealthClub");

    expect(club.employee).toHaveLength(TRAINERS.length);
    expect(club.image).toBe(`${SITE_ORIGIN}/personal-training/og`);
    expect(club.areaServed.length).toBeGreaterThan(0);
    // §8: no price claim anywhere, and priceRange is still a price claim.
    expect(JSON.stringify(club)).not.toContain("priceRange");

    const page_ = graph.find((data) => data["@type"] === "WebPage");
    expect(page_.dateModified).toBeTruthy();
    expect(page_.author).toBeDefined();
  });

  test("the consultation is marked up as free, and nothing else has a price", async ({
    page,
  }) => {
    await page.goto("/personal-training/consultation");

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const service = blocks
      .map((block) => JSON.parse(block))
      .find((data) => data["@type"] === "Service");

    // Zero is the one price this site can publish, because it is true.
    expect(service.offers.price).toBe(0);
    expect(service.offers.priceCurrency).toBe("USD");
  });

  test("no unsettled answer reaches a page or its markup", async ({ page }) => {
    const unsettled = HUB_FAQS.filter((item) => item.unconfirmed);
    expect(unsettled.length).toBeGreaterThan(0);

    await page.goto("/personal-training");
    const body = await page.locator("body").innerText();
    for (const item of unsettled) expect(body).not.toContain(item.question);
    expect(await page.content()).not.toContain("[CONFIRM");
  });
});
