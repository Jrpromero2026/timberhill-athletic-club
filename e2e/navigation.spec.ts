import { expect, test } from "@playwright/test";

/**
 * Shell + navigation coverage. Runs against the offline preview (no Supabase
 * required): the unauthenticated state must render every route with the
 * shared layout, and never crash or leak an error page.
 */

const ROUTES: Array<{ path: string; heading: string }> = [
  { path: "/performance-operations/imports", heading: "Imports" },
  { path: "/performance-operations/appointments", heading: "Appointments" },
  { path: "/performance-operations/revenue", heading: "Revenue" },
  { path: "/performance-operations/payroll", heading: "Payroll" },
  { path: "/performance-operations/trainers", heading: "Trainers" },
  { path: "/performance-operations/clients", heading: "Clients" },
  { path: "/performance-operations/reports", heading: "Reports" },
  { path: "/performance-operations/configuration", heading: "Configuration" },
  { path: "/performance-operations/audit", heading: "Audit" },
];

/**
 * The page never scrolls sideways.
 *
 * A wide element in the shell or in a widget pushes the whole document, and
 * the symptom a person reports is not "the table is wide" — it is that the
 * page drifts under their thumb and controls sit off the edge. Two separate
 * causes were found this way: a header whose flex items would not shrink, and
 * a data table with no scroller of its own.
 *
 * 320px is below any current iPhone, but it is where a too-wide element shows
 * up first, so it is the width worth asserting.
 */
for (const width of [320, 360]) {
  for (const path of ["/performance-operations/overview", "/performance-operations/payroll"]) {
    test(`${path} does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);

      const offenders = await page.evaluate(() => {
        const root = document.documentElement;
        const overflow = root.scrollWidth - root.clientWidth;
        if (overflow <= 0) return { overflow, culprits: [] as string[] };
        // Name what stuck out, so a failure says which element to look at
        // rather than only that the number is wrong. Anything inside its own
        // horizontal scroller is clipped by it and is not the cause.
        const culprits: string[] = [];
        for (const el of document.querySelectorAll("body *")) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.right <= root.clientWidth + 0.5) continue;
          let scrolled = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== "visible") { scrolled = true; break; }
          }
          if (!scrolled) culprits.push(`${el.tagName}.${String(el.className).slice(0, 40)}`);
        }
        return { overflow, culprits };
      });

      expect(
        offenders.overflow,
        `page scrolls ${offenders.overflow}px sideways; past the edge: ${offenders.culprits.slice(0, 3).join(", ") || "(all inside a scroller)"}`,
      ).toBe(0);
    });
  }
}

test("root redirects to the public site, not the operations app", async ({
  page,
}) => {
  // The public owns the front door; staff enter the platform at /overview.
  await page.goto("/");
  await page.waitForURL("**/personal-training");
  await expect(page).toHaveTitle(/Timberhill Athletic Club/);
});

test("the operations app is still reachable at /overview", async ({ page }) => {
  await page.goto("/performance-operations/overview");
  await expect(page).toHaveTitle(/Overview · Performance Operations/);
});

test("overview renders workspace data and honest KPI placeholders", async ({
  page,
}) => {
  await page.goto("/performance-operations/overview");
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
  await page.goto("/performance-operations/overview");
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByRole("menu").getByText("Not signed in")).toBeVisible();
});

/**
 * The header fits the viewport it is given.
 *
 * It did not: at 412px it wanted 455px, so the user-menu button hung 27px
 * past the right edge and its own container intercepted the tap — on a phone
 * you could not open the menu at all, which also meant you could not sign
 * out. The cause was flex items refusing to shrink below their content
 * (min-width: auto), so nothing yielded and the row simply overflowed.
 *
 * Asserted at several widths rather than only the two project viewports,
 * because the failure appears between them: the tablet range was worse than
 * the phone range, since that is where the period selector reappears.
 */
for (const width of [360, 390, 412, 768, 1024]) {
  test(`header fits and the user menu opens at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/performance-operations/overview");

    const header = page.locator("header");
    const overflow = await header.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow, `header overflows its own box at ${width}px`).toBe(0);

    // Reachable, not merely present: the bug left the button visible and
    // enabled with its container on top of it at the click point.
    const button = page.getByRole("button", { name: "User menu" });
    const box = (await button.boundingBox())!;
    expect(box.x + box.width, `user menu sits past the right edge`)
      .toBeLessThanOrEqual(width);

    await button.click();
    await expect(page.getByRole("menu")).toBeVisible();
  });
}

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
  await page.goto("/performance-operations/overview");
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
  await page.goto("/performance-operations/overview");
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

test("/performance-operations is the named entrance to the platform", async ({
  page,
}) => {
  await page.goto("/performance-operations");
  await page.waitForURL("**/overview");
  await expect(page).toHaveTitle(/Overview · Performance Operations/);
});
