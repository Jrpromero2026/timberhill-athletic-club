import { expect, test, type Page } from "@playwright/test";

/**
 * Public Personal Training routes. Runs in the offline suite because these
 * pages read no Supabase data and take no session — they are statically
 * prerendered, so the offline preview serves them exactly as production does.
 *
 * The offline suite runs twice, Desktop Chrome and Pixel 7, so the responsive
 * rules in the build brief are covered by the same file: the mobile-only
 * assertions are guarded on viewport width rather than duplicated.
 *
 * These assert the brief's rules, not the styling — CTA placement, the sticky
 * bar suppression rule, disclosure state, the specialty filter, locked section
 * order, and the markup the brief forbids.
 */

const CTA = "BOOK A COMPLIMENTARY CONSULTATION";
const MOBILE_MAX = 760;

function isMobile(page: Page): boolean {
  const size = page.viewportSize();
  return Boolean(size && size.width <= MOBILE_MAX);
}

test.describe("hub", () => {
  test("renders the locked above-the-fold stack", async ({ page }) => {
    await page.goto("/personal-training");

    await expect(page).toHaveTitle(
      "Personal Training in Corvallis, OR | Timberhill Athletic Club",
    );
    // §4: the H1 is the service name alone.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "PERSONAL TRAINING",
    );
    await expect(
      page.getByText("YOUR GOALS. YOUR PLAN. YOUR COACH."),
    ).toBeVisible();
    // Two buttons and nothing else interactive in the hero.
    const hero = page.locator("[data-hero]");
    await expect(hero.getByRole("link")).toHaveCount(2);
  });

  test("section order is locked and no price appears above section 09", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    const numbers = await page.locator("main .sec-num").allInnerTexts();
    expect(numbers.map((n) => n.trim())).toEqual([
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
    ]);

    const aboveNine = await page.evaluate(() => {
      const nine = [...document.querySelectorAll(".sec-num")].find(
        (el) => el.textContent?.trim() === "09",
      );
      const stop = nine?.closest("section");
      let text = "";
      for (const section of document.querySelectorAll("main > section")) {
        if (section === stop) break;
        text += ` ${(section as HTMLElement).innerText}`;
      }
      return text;
    });
    expect(aboveNine).not.toMatch(/\$|\bper session\b/i);

    // §5: "PACK Training" is retired entirely.
    await expect(page.locator("body")).not.toContainText("PACK Training");
  });

  test("recognition shows all thirteen cards with no carousel", async ({
    page,
  }) => {
    await page.goto("/personal-training");
    await expect(page.locator(".rec-card")).toHaveCount(13);

    if (isMobile(page)) {
      // §9: 1-up on mobile. A carousel would hide what the section exists
      // to show, so every card must be laid out in one column.
      const columns = await page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll(".rec-card")].map((card) =>
              Math.round(card.getBoundingClientRect().left),
            ),
          ).size,
      );
      expect(columns).toBe(1);
    }
  });

  test("FAQ starts fully collapsed and opens one at a time", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    const answers = page.locator(".faq-a");
    await expect(answers).toHaveCount(12);
    await expect(page.locator(".faq-a:visible")).toHaveCount(0);

    const questions = page.locator(".faq-q");
    await questions.first().click();
    await expect(answers.first()).toBeVisible();

    await questions.nth(3).click();
    await expect(answers.first()).toBeHidden();
    await expect(answers.nth(3)).toBeVisible();

    await questions.nth(3).click();
    await expect(answers.nth(3)).toBeHidden();
  });

  test("trainer philosophy is a disclosure, one open at a time", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    await expect(page.locator(".t-phil:visible")).toHaveCount(0);
    const toggles = page.locator(".t-toggle");
    await expect(toggles.first()).toContainText("TRAINING PHILOSOPHY");

    await toggles.first().click();
    await expect(page.locator("#phil-jr-romero")).toBeVisible();
    await expect(toggles.first()).toContainText("LESS");

    await toggles.nth(1).click();
    await expect(page.locator("#phil-jr-romero")).toBeHidden();
    await expect(page.locator("#phil-jess-caze")).toBeVisible();
  });

  test("every primary CTA carries the same string and a source section", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    const primaries = page.locator("[data-primary-cta]");
    const count = await primaries.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i += 1) {
      await expect(primaries.nth(i)).toHaveText(CTA);
      await expect(primaries.nth(i)).toHaveAttribute("data-cta-section", /.+/);
    }

    // §2: none of the banned variants, anywhere on the page.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Get Started|Book Now|Free Consult\b/);
  });

  test("all interactive controls meet the 44px tap target", async ({ page }) => {
    await page.goto("/personal-training");
    const undersized = await page.evaluate(() => {
      const selectors = ".faq-q, .t-toggle, .chip, .hamburger, .f-link";
      return [...document.querySelectorAll(selectors)]
        .map((el) => ({
          cls: el.className.split(" ")[0],
          h: el.getBoundingClientRect().height,
        }))
        .filter((item) => item.h > 0 && item.h < 44);
    });
    expect(undersized).toEqual([]);
  });

  test("no horizontal scroll, and no forms anywhere", async ({ page }) => {
    await page.goto("/personal-training");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
    // §9: booking happens in Setmore. There are no forms on the hub.
    await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
  });
});

test.describe("mobile rules", () => {
  test("primary CTA is above the fold and the sticky bar obeys suppression", async ({
    page,
  }) => {
    test.skip(!isMobile(page), "mobile-only behaviour");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/personal-training");

    // §9: fully visible at 375×667 without scrolling.
    const box = await page.locator('[data-cta-section="hero"]').boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(667);

    const bar = page.locator("[data-sticky-cta], .sticky-cta");
    // Suppressed while the hero is on screen.
    await expect(bar).not.toHaveClass(/is-on/);

    // Appears once the hero has exited.
    await page.evaluate(() => {
      const recognition = document.querySelectorAll("main > section")[2];
      window.scrollTo(0, (recognition as HTMLElement).offsetTop + 200);
    });
    await expect(bar).toHaveClass(/is-on/);

    // §2: suppressed again beside an in-page primary — never two at once.
    await page
      .locator('[data-cta-section="how-it-works"]')
      .scrollIntoViewIfNeeded();
    await expect(bar).not.toHaveClass(/is-on/);
  });

  test("the mobile menu opens and exposes the Personal Training children", async ({
    page,
  }) => {
    test.skip(!isMobile(page), "mobile-only behaviour");
    await page.goto("/personal-training");

    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeHidden();
    await page.locator(".hamburger").click();
    await expect(menu).toBeVisible();
    await expect(menu.locator(".sub")).toHaveCount(3);
  });
});

test.describe("trainers index", () => {
  test("filters by specialty, handles no matches, and resets", async ({
    page,
  }) => {
    await page.goto("/personal-training/trainers");

    await expect(page).toHaveTitle(
      "Personal Trainers in Corvallis, OR | Timberhill Athletic Club",
    );
    await expect(page.locator(".trainer-card")).toHaveCount(8);
    await expect(page.locator(".roster-count")).toHaveText(
      "8 trainers published",
    );

    await page.getByRole("button", { name: "Pre and Postnatal" }).click();
    await expect(page.locator(".trainer-card")).toHaveCount(1);
    await expect(page.locator(".t-name")).toHaveText("Becca Reeve");
    await expect(page.locator(".roster-count")).toContainText(
      "1 trainer · Pre and Postnatal",
    );

    // A specialty no published trainer claims yet shows the empty state
    // rather than an empty grid.
    await page
      .getByRole("button", { name: "Injury and Rehabilitation" })
      .click();
    await expect(page.locator(".empty-card")).toBeVisible();
    await expect(page.locator(".empty-title")).toContainText(
      "Injury and Rehabilitation",
    );

    await page.getByRole("button", { name: "All trainers" }).click();
    await expect(page.locator(".trainer-card")).toHaveCount(8);
    await expect(page.locator(".empty-card")).toHaveCount(0);
  });

  test("only trainers with a published profile link to one", async ({
    page,
  }) => {
    await page.goto("/personal-training/trainers");
    // §3: profiles are Phase 3. Today only JR Romero has one, and seven dead
    // links would be worse than seven cards without one.
    const links = page.getByRole("link", { name: "Full profile ›" });
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute(
      "href",
      "/personal-training/trainers/jr-romero",
    );
  });
});

test.describe("consultation", () => {
  test("leads with the search word and opens on the first question", async ({
    page,
  }) => {
    await page.goto("/personal-training/consultation");

    await expect(page).toHaveTitle(
      "Free Fitness Consultation in Corvallis, OR | Timberhill Athletic Club",
    );
    // §8: complimentary is the brand word, free is the search word — free
    // carries the H1 while the button label stays complimentary.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Free");
    await expect(page.locator("[data-primary-cta]").first()).toHaveText(CTA);

    await expect(page.locator(".faq-a:visible")).toHaveCount(1);
    await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
  });
});

test.describe("trainer profile", () => {
  test("renders the published profile and books the consultation", async ({
    page,
  }) => {
    await page.goto("/personal-training/trainers/jr-romero");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "JR Romero",
    );
    // §12: the CTA goes to the consultation, never to a trainer's calendar.
    await expect(page.locator('[data-cta-section="profile"]')).toHaveAttribute(
      "href",
      /products=8aff2d32/,
    );
    await expect(page.locator(".block-h")).toHaveCount(4);
  });

  test("a trainer without a published profile 404s", async ({ page }) => {
    const response = await page.goto(
      "/personal-training/trainers/jess-caze",
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.status()).toBe(404);
  });
});

test.describe("structured data", () => {
  const routes = [
    "/personal-training",
    "/personal-training/trainers",
    "/personal-training/consultation",
    "/personal-training/trainers/jr-romero",
  ];

  for (const route of routes) {
    test(`${route} emits no AggregateRating`, async ({ page }) => {
      await page.goto(route);
      const blocks = await page
        .locator('script[type="application/ld+json"]')
        .allInnerTexts();
      expect(blocks.length).toBeGreaterThan(0);
      // §8: the reviews are third-party booking data. Displayed, never marked
      // up — the risk is a manual action.
      expect(blocks.join(" ")).not.toMatch(/aggregateRating/i);
    });
  }

  test("the FAQPage carries only settled answers", async ({ page }) => {
    await page.goto("/personal-training");
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const faq = blocks.map((b) => JSON.parse(b)).find(
      (data) => data["@type"] === "FAQPage",
    );
    expect(faq).toBeDefined();
    // Twelve questions are visible; four are [CONFIRM] placeholders and must
    // not be marked up as answers.
    expect(faq.mainEntity).toHaveLength(8);
    expect(JSON.stringify(faq)).not.toContain("[CONFIRM");
  });
});

test.describe("isolation from the application", () => {
  /**
   * The marketing design system and the application both define
   * `--color-accent` and `--color-surface`, with different values. The
   * marketing tokens live on `.tac-site` rather than `:root` precisely so they
   * cannot repaint the application — if someone moves them to `:root`, the
   * operations UI turns Royal Blue and this test is what catches it.
   */
  /** Browsers serialise custom properties inconsistently — `#fff` for
   *  `#FFFFFF`, and lowercased hex — so compare normalised values rather than
   *  the exact text the engine happens to return. */
  const hex = (value: string | null) => {
    if (!value) return value;
    const v = value.trim().toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v;
  };

  const read = async (page: Page, prop: string) =>
    hex(
      await page.evaluate(
        (name) =>
          getComputedStyle(document.body).getPropertyValue(name).trim(),
        prop,
      ),
    );

  test("the application keeps its own accent and surface tokens", async ({
    page,
  }) => {
    await page.goto("/overview");
    // G3 red, from globals.css @theme — NOT the marketing Royal Blue.
    expect(await read(page, "--color-accent")).toBe("#c8102e");
    expect(await read(page, "--color-surface")).toBe("#ffffff");
    // The marketing-only tokens must not exist here at all.
    expect(await read(page, "--color-text")).toBe("");
  });

  test("the marketing pages carry the brand tokens, scoped", async ({
    page,
  }) => {
    await page.goto("/personal-training");

    // On <body> the application's values still stand...
    expect(await read(page, "--color-accent")).toBe("#c8102e");

    // ...while inside the wrapper the brand tokens apply (brief §14).
    const raw = await page.evaluate(() => {
      const site = document.querySelector(".tac-site");
      if (!site) return null;
      const styles = getComputedStyle(site);
      return {
        accent: styles.getPropertyValue("--color-accent").trim(),
        surface: styles.getPropertyValue("--color-surface").trim(),
        text: styles.getPropertyValue("--color-text").trim(),
      };
    });
    expect(raw).not.toBeNull();
    expect({
      accent: hex(raw!.accent),
      surface: hex(raw!.surface),
      text: hex(raw!.text),
    }).toEqual({
      // Royal Blue, Light Gray, Charcoal — the brand tokens from §14.
      accent: "#1f4e95",
      surface: "#f2f4f7",
      text: "#2a2a2a",
    });
  });

  test("marketing styles do not reach the application's own headings", async ({
    page,
  }) => {
    await page.goto("/overview");
    // marketing.css sets a League Spartan stack on its headings; the
    // application's must still resolve to its own Geist-based font.
    const font = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      return heading ? getComputedStyle(heading).fontFamily : "";
    });
    expect(font).not.toMatch(/League Spartan/i);
  });
});
