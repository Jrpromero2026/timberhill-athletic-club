import { expect, test, type Page } from "@playwright/test";
import {
  HUB_FAQS,
  RECOGNITION,
  SETMORE,
  SPECIALTIES,
  TRAINERS,
} from "../src/lib/marketing/personal-training";

/** Questions whose answers are settled — the only ones that reach a page. */
const SETTLED_HUB_FAQS = HUB_FAQS.filter((item) => !item.unconfirmed).length;

/**
 * Filter fixtures, derived from the roster rather than named.
 *
 * Both of these used to be literals — "Pre and Postnatal" for the narrowing
 * case and "Injury and Rehabilitation" for the empty one. Adding a trainer who
 * claims rehabilitation turned the empty case into a matching case, so the
 * test asserted the opposite of the truth. Read the roster instead: a
 * specialty exactly one trainer claims narrows to that trainer, and one nobody
 * claims shows the empty state.
 */
const SOLO_SPECIALTY = SPECIALTIES.find(
  (specialty) =>
    TRAINERS.filter((trainer) =>
      trainer.specialties.includes(specialty),
    ).length === 1,
);
const UNCLAIMED_SPECIALTY = SPECIALTIES.find(
  (specialty) =>
    !TRAINERS.some((trainer) => trainer.specialties.includes(specialty)),
);

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

  test("every consultation CTA lands on the consultation, not a service menu", async ({
    page,
  }) => {
    await page.goto("/personal-training");
    const booking = page.locator('a[href*="setmore.com/book"]');
    const count = await booking.count();
    expect(count).toBeGreaterThan(0);

    // One destination for every call to action on the page. A CTA pointing at
    // a specific service (free trial, Performance Lab) would drop the visitor
    // into the booking menu and ask them to pick the product the consultation
    // is supposed to choose for them.
    const targets = new Set(
      await booking.evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
    );
    expect(targets.size).toBe(1);
    expect([...targets][0]).toBe(SETMORE.consultation);

    // And it must be the deep link, not the menu: a bare /book drops the
    // visitor on the full service list.
    expect([...targets][0]).toContain("step=time-slot");
    expect([...targets][0]).toContain("type=service");
  });

  test("recognition shows every card with no carousel", async ({
    page,
  }) => {
    await page.goto("/personal-training");
    // Twelve, not a round number picked for its own sake: the grid is three
    // across, so twelve closes on a full row. Assert against the content
    // rather than a literal, or this test has to be edited every time the
    // list is tuned — which is exactly how it came to assert thirteen after
    // the list had already dropped to twelve.
    await expect(page.locator(".rec-card")).toHaveCount(RECOGNITION.length);
    expect(RECOGNITION.length % 3).toBe(0);

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
    // Derived, not hard-coded: questions still awaiting an answer are held
    // back, so neither a visitor nor the FAQPage markup ever meets a
    // placeholder. Counting the settled items keeps this honest as the FAQ
    // grows without turning every content edit into a test edit.
    await expect(answers).toHaveCount(SETTLED_HUB_FAQS);
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
    isMobile,
  }) => {
    await page.goto("/personal-training");

    // The roster is a desktop-only section of the hub: on a phone it ran 21%
    // of the page, so the grid gives way to a lede and a link through to
    // /personal-training/trainers. There is no card here to disclose, and the
    // disclosure itself is covered on the roster page.
    //
    // Asserted, not skipped — a silent skip would also pass if the grid
    // vanished on desktop by accident.
    if (isMobile) {
      await expect(page.locator(".team-grid")).toBeHidden();
      await expect(page.locator(".team-jump")).toBeVisible();
      await expect(page.locator(".team-jump")).toHaveAttribute(
        "href",
        "/personal-training/trainers",
      );
      return;
    }

    await expect(page.locator(".team-jump")).toBeHidden();
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
    await expect(page.locator(".trainer-card")).toHaveCount(TRAINERS.length);
    await expect(page.locator(".roster-count")).toHaveText(
      `${TRAINERS.length} trainers`,
    );

    // Narrowing: a specialty one trainer claims shows that trainer alone.
    expect(SOLO_SPECIALTY).toBeDefined();
    const soloTrainer = TRAINERS.find((trainer) =>
      trainer.specialties.includes(SOLO_SPECIALTY!),
    )!;
    await page.getByRole("button", { name: SOLO_SPECIALTY! }).click();
    await expect(page.locator(".trainer-card")).toHaveCount(1);
    await expect(page.locator(".t-name")).toHaveText(soloTrainer.name);
    await expect(page.locator(".roster-count")).toContainText(
      `1 trainer · ${SOLO_SPECIALTY}`,
    );

    // A specialty no published trainer claims shows the empty state rather
    // than an empty grid. Skipped once the roster covers every specialty:
    // there is then no way to reach the empty state, and asserting it with a
    // specialty somebody claims would assert a falsehood.
    if (UNCLAIMED_SPECIALTY) {
      await page.getByRole("button", { name: UNCLAIMED_SPECIALTY }).click();
      await expect(page.locator(".empty-card")).toBeVisible();
      await expect(page.locator(".empty-title")).toContainText(
        UNCLAIMED_SPECIALTY,
      );
    }

    await page.getByRole("button", { name: "All trainers" }).click();
    await expect(page.locator(".trainer-card")).toHaveCount(TRAINERS.length);
    await expect(page.locator(".empty-card")).toHaveCount(0);
  });

  test("only trainers with a published profile link to one", async ({
    page,
  }) => {
    await page.goto("/personal-training/trainers");
    // §3: a card links to a profile only where one exists. Dead links would be
    // worse than cards without one.
    //
    // Asserted against the content, not a literal: this named JR Romero and
    // demanded exactly one link, so it failed the moment a second trainer got
    // a profile — which is the change working, not breaking.
    const withProfiles = TRAINERS.filter((t) => t.profile);
    expect(withProfiles.length).toBeGreaterThan(0);

    const links = page.getByRole("link", { name: "Full profile ›" });
    await expect(links).toHaveCount(withProfiles.length);

    const hrefs = await links.evaluateAll((els) =>
      els.map((a) => a.getAttribute("href")),
    );
    expect([...hrefs].sort()).toEqual(
      withProfiles
        .map((t) => `/personal-training/trainers/${t.slug}`)
        .sort(),
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
    // Assert against the content, not a literal: this read `toHaveCount(4)`
    // and broke the moment the credentials moved out of the prose blocks and
    // under the photograph, which was the intended change.
    const jr = TRAINERS.find((t) => t.slug === "jr-romero");
    await expect(page.locator(".block-h")).toHaveCount(jr!.profile!.length);

    // Credentials are a reference list beside the biography, one row per
    // award, not a paragraph of dot-separated prose.
    await expect(page.locator(".creds-row")).toHaveCount(
      jr!.certifications!.length,
    );
    await expect(page.locator(".blocks")).not.toContainText("(CSCS) ·");
  });

  test("the free session is a second door, never the first", async ({ page }) => {
    // JR takes the consultations, so his profile offers nothing else.
    await page.goto("/personal-training/trainers/jr-romero");
    await expect(
      page.locator('[data-cta-section="profile-free-session"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-cta-section="profile"]')).toHaveAttribute(
      "href",
      SETMORE.consultation,
    );

    // A trainer who takes free sessions offers both, and the consultation is
    // still the primary — a second door must never become the first.
    const offering = TRAINERS.find((t) => t.offersFreeSession && t.profile);
    expect(offering).toBeDefined();
    await page.goto(`/personal-training/trainers/${offering!.slug}`);

    const primary = page.locator('[data-cta-section="profile"]');
    const second = page.locator('[data-cta-section="profile-free-session"]');
    await expect(primary).toHaveAttribute("href", SETMORE.consultation);
    await expect(second).toHaveCount(1);

    // Whichever link the second door carries, the copy must match what it can
    // do: only a link with a staff id may promise this trainer by name.
    const href = (await second.getAttribute("href")) ?? "";
    const note = await page.locator(".profile-alt .cta-note").innerText();
    const firstName = offering!.name.split(" ")[0];
    if (href.includes("staff=")) {
      expect(note).toContain(firstName);
    } else {
      expect(note).toContain("choose your trainer");
      expect(note).not.toContain(`with ${firstName} directly`);
    }
  });

  test("a slug with no published profile 404s", async ({ page }) => {
    // Named jess-caze until she got a profile, at which point the test failed
    // for the best possible reason. Take whoever currently has no profile; if
    // everyone on the roster has one, a slug that is not a trainer at all has
    // to 404 rather than render an empty page. Amanda Knight is on staff and
    // deliberately not on the roster, so it is a URL somebody really might try.
    const withoutProfile = TRAINERS.find((t) => !t.profile);
    const slug = withoutProfile ? withoutProfile.slug : "amanda-knight";

    const response = await page.goto(
      `/personal-training/trainers/${slug}`,
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
    // The rendered accordion and the FAQPage markup are filtered by the same
    // rule, so they must agree exactly.
    expect(faq.mainEntity).toHaveLength(SETTLED_HUB_FAQS);
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
