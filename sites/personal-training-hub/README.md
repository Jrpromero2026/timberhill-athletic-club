# TAC-PT-MKT-002 — Personal Training hub, built

Implementation of the `TAC PT Website Hub` design canvas from a Claude Design
handoff. Four routes, static HTML/CSS/JS, no build step and no dependencies.

**This is a separate deployable from the Performance Operations app.** It
shares the repository and nothing else — no imports into `src/`, no Supabase,
no environment, no build. The app's tooling is scoped away from it
(`vitest` → `tests/unit`, `playwright` → `e2e`, `tsconfig` → `**/*.ts`), and
`eslint.config.mjs` ignores this directory because the JavaScript here targets
the browser directly rather than Next.js.

Open `index.html` in a browser, or serve this folder — every internal link is
relative, so it works from any path. Resize to 375px for the mobile layout.

```
sites/personal-training-hub/
  index.html                     → /personal-training/            (hub, 13 sections)
  trainers/index.html            → /personal-training/trainers/   (roster, filterable)
  consultation/index.html        → /personal-training/consultation/
  trainers/jr-romero/index.html  → /personal-training/trainers/[slug]/   (Phase 3)
  assets/tokens.css              brand tokens over the Industry design system
  assets/site.css                design-system subset + page styles
  assets/site.js                 nav, disclosures, filter, sticky CTA, analytics
  data/trainers.json             roster — source of truth for the CPT import
  tests/smoke.js                 65 behavioural checks; see Verification below
  BUILD_BRIEF.md                 the spec of record — every §N in the code
                                 comments refers to a section of this file
```

## What the canvas was, and what this is

The `.dc.html` canvas framed the four routes in device chrome with route tabs,
a 667 fold line and a BUILD NOTES rail. That was scaffolding for design
approval, not part of the product, so it is not reproduced — the pages are
responsive, and a browser window does what the frames did. Every build note
that carried an implementation constraint is now a comment at the place in the
code it governs.

The canvas also imported `PT Nav` and `PT Footer` as shared components. With no
build step those are inlined per page. In Divi they become template parts; the
markup is identical across all four files, so the diff is mechanical.

## Design system

`tokens.css` is the Industry design system with the brand values from
`BUILD_BRIEF.md` §14 substituted — Royal Blue `#1F4E95`, Charcoal, Light Gray, Light Blue, League
Spartan over Inter. The system's grammar is kept (square corners, hairline
frames, registration-mark corners, the modular grid) and its own steel accent
and Barlow pairing are dropped, exactly as the design session decided. The
club's style-guide PDF was checked against these and agrees.

`site.css` ships only the design-system components this build actually uses —
`.btn`, `.tag`, `.blueprint`/`.corner`. Forms, tables, dialogs and `.card` are
not shipped.

The prototype used container queries at a 760px breakpoint because it rendered
two device frames side by side on one canvas. Here the page is the viewport, so
those are media queries and `cqw` is `vw`; the `clamp()` caps are unchanged, so
the type scale resolves identically at 1280 and 375.

## Brief compliance

- **CTA string** — `BOOK A COMPLIMENTARY CONSULTATION`, byte-identical at all
  six hub placements and one destination. Tracked as one analytics event with
  the source section as a parameter (`hero` · `how-it-works` · `team` ·
  `options` · `final` · `sticky`, plus `header` and `footer`).
- **Never two primaries in one viewport** — the mobile sticky bar appears only
  after the hero exits and hides again whenever any in-page primary CTA is on
  screen. Verified.
- **Section order** — 01–13 locked. Nothing above 09 names a price or a SKU;
  asserted by the test suite. `PACK Training` appears nowhere; Performance Lab
  is the live name.
- **Roster** — 8 published, from the Drive bios. Trimmed, not rewritten.
  Philosophy capped at 2–3 sentences on the card; the full biography lives on
  the Phase 3 profile. Specialties are the closed 14-term vocabulary.
- **Testimonials** — verbatim only. Jen's is real and trimmed for length. The
  four approved Setmore attributions carry a visible "paste from Setmore" slot
  rather than invented copy. `AggregateRating` is not implemented anywhere.
- **Schema** — `HealthClub`, `BreadcrumbList` on all four routes, `Service` per
  public family with no `offers`, `FAQPage`, `Person` on the profile.
- **No forms.** Booking happens in Setmore.
- **Mobile** — primary CTA fully visible at 375×667 (its bottom edge lands at
  280px). Recognition grid 1-up, no carousel. Comparison stacks into two
  labelled blocks. No horizontal scroll at either width. All tap targets ≥44px.
- **Nav** — Personal Training sits at position 2 and its parent is a real link
  in its own right, with the caret as a separate control. Footer has the fourth
  column.

## Three places I diverged from the prototype

1. **`FREE CONSULT` → `FREE CONSULTATION`** in the mobile header. The prototype
   abbreviated it to fit 375px, but brief §2 lists `Free Consult` among the
   banned variants and §10 names this button `FREE CONSULTATION`. The label is
   tightened (10px, less tracking) to fit instead — measured at 143.5px, and
   the header row does not overflow.
2. **Profile CTA note** used `opacity: .6`, which measures 3.99:1 on white and
   fails AA for body text. Swapped for `--color-neutral-700` at 6.5:1 —
   the same opacity-to-ramp-step fix the design session applied elsewhere.
3. **Nav caret** hover and click cancelled each other out in a naive port
   (hover opened the menu, then the click read it as open and closed it).
   Clicking now pins the menu open; hover only applies on pointer devices.

Two smaller calls: the desktop subnav is `display: block` so its left edge
lines up with the brand above it (as a flex container its inner `.wrap` centred
instead), and `Full profile ›` appears only on JR's card, since his is the only
profile that exists until Phase 3 — seven dead links would be worse than seven
cards without one.

## Known, deliberate, not defects

Two sets of glyphs sit below AA and are `aria-hidden="true"` decoration:

| Element | Measured | Needs | Why it stays |
|---|---|---|---|
| `.step-n` — the 01–05 ordinals in How It Works | 1.85:1 | 3:1 | The order is carried by the `<ol>`. Change `--color-accent-300` to `--color-accent-500` (4.5:1) if they should read as content. |
| `.nav-caret` — the ▾ glyph | 3.01:1 | 4.5:1 | Duplicates `aria-expanded` on a button whose accessible name is "Show Personal Training pages". |

Both are exempt as pure decoration, but they are the kind of thing an auditor
will ask about, so the one-token fix is noted.

## Still outstanding — content, not build work

Nothing below is blocked on development.

**Images.** Every slot is sized, framed and captioned with its spec, so
dropping a file in causes no reflow. Hero ≥2400×1350 (the LCP element — the
`<picture>` and `<link rel=preload>` markup is in place, commented, in
`index.html`); 8 headshots at 3:4 ≥800×1066; 5 service images at 800×600;
consultation photograph 1600×1200; OG image 1200×630. **No stock** — brand navy
with no photograph is the better placeholder.

**Headshot mapping.** 23 files sit in Drive under Trainer Pictures, all camera
filenames. Nobody should guess who is who on a public roster: rename them to
trainer names, or supply a mapping.

**Copy.** The section copy is the design session's draft, written to the brief's
constraints. The spec PDF's Production Page Copy was never supplied — paste it
over as written when it arrives. Titles and meta descriptions for the trainers
and consultation routes are likewise not from the PDF; the hub's are verbatim
from §8.

**Four `[CONFIRM]` FAQ answers** — non-member eligibility, whether any price may
be published, the cancellation policy, and nutrition scope. They are visible on
the page and withheld from the `FAQPage` markup until answered, because marking
up a placeholder as an answer is worse than omitting the question.

**Four `[VERBATIM — paste from Setmore]` review slots**, and `[REVIEWER NAME]`
on the profile.

**JR's title** is unresolved — the Drive bio heading says Head Trainer, the body
says Director of Training. Both are carried, in the visible role line and in
`jobTitle`. Pick one.

**Steve Sackmann** is off the roster: the brief lists him as published but the
Drive bios doc has no entry. Add the bio and he goes back on. Amanda Knight is
Coming Soon; Kyra Schulties and Jayna Davis are missing entirely.

**Review count** is hard-coded as 160 in three places on the hub. Read it from
the live Setmore figure or review it monthly. `data/trainers.json` holds the
figure alongside the roster.

**Club hours discrepancy** — the website says Mon–Fri 5 AM–10 PM, Setmore says
5 AM–9 PM. The footer and the schema carry the website hours. Reconcile.

## Porting to WordPress + Divi

- `data/trainers.json` is shaped for the `trainer` post type in brief §6:
  `photo` · `name` · `credentials` · `specialties` · `works_best_with` ·
  `philosophy` · `slug` · `accepting_clients`. Specialties are a closed
  taxonomy — free text breaks the index filter.
- The roster is rendered into the HTML, not fetched from that JSON, so the
  cards stay in the crawlable document and work with JavaScript off. Keep the
  file and the two pages in step until the CPT exists, then the file becomes
  the import and the pages become templates.
- The five Setmore URLs belong in theme options or PHP constants, defined once.
  They embed product and staff IDs: rebuild a service in Setmore and every CTA
  on the site breaks silently.
- Redirects, the vanity subdomain, nav restructuring and the Phase 1 checklist
  are in `BUILD_BRIEF.md` and are not code in this folder.

## Verification

From the repository root:

```
npm i playwright            # already a devDependency of the app
node sites/personal-training-hub/tests/smoke.js
                            # CHROMIUM=/path/to/chrome to use an existing binary
```

It drives the pages over `file://` and starts no server, so it does not
collide with the app's Playwright suites or their dev servers.

65 checks at 1280 and 375: disclosure state and one-at-a-time behaviour, the
specialty filter across match / no-match / reset, the sticky-bar suppression
rule, the 667 fold, tap-target heights, locked section order, no price above
section 09, no forms, no `AggregateRating`, and no console errors. All passing.

Markup, JSON-LD, `aria-controls` targets, duplicate ids, internal links and
custom-property definitions were validated separately; a rendered-contrast
audit at both widths reports no real-text failures.
