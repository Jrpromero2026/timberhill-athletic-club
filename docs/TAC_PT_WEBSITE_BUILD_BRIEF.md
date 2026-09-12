# TAC-PT-MKT-002 — Personal Training Website Hub
## Build brief (machine-actionable subset)

Companion to `TAC_Personal_Training_Website_Hub_Specification.pdf`. That document carries the
reasoning, the audit and the full page copy. This file carries only what a developer or an agent
needs to execute: URLs, redirects, exact strings, schema, and gates.

**Architecture decision — locked, treat as fixed input:** Personal Training is a first-class
Timberhill service vertical, not an amenity. It does not depend on the Amenities submenu for
discovery.

- **Canonical:** `https://timberhillac.com/personal-training/`
- **Vanity / campaign:** `https://personaltraining.timberhillac.com` — **301 to canonical.** Not a
  separate site. No content hosted there.
- `/amenities/personal-training/` is legacy content to migrate, then redirect. Not the final
  architecture.

**Platform:** WordPress + Divi Child v4.27.4 (maintained by Oregon Marketing Group).
**Site audited:** timberhillac.com and timberhill-personal-training.setmore.com, 8 September 2026.
**Rule:** do not invent trainers, credentials, prices, testimonials, services or claims. Anything in
`[SQUARE BRACKETS]` is missing content and must be supplied by the PT Director before launch.

---

## 1. Constants — define once, never inline

```
CANONICAL_URL        = "https://timberhillac.com/personal-training/"
VANITY_URL           = "https://personaltraining.timberhillac.com"

SETMORE_CONSULTATION = "https://timberhill-personal-training.setmore.com/book?step=time-slot&products=8aff2d32-3927-4531-a6ba-f12c9e5ab214&type=service&staff=91f71610-48fd-4e00-bd4e-2017f4f4a65b&staffSelected=true"

SETMORE_FREE_TRIAL   = "https://timberhill-personal-training.setmore.com/book?step=staff&products=470be690-c1b9-4664-80da-0502ed6e8565&type=service"

SETMORE_PERF_LAB     = "https://timberhill-personal-training.setmore.com/book?step=time-slot&products=5a6177c8-a52d-4389-a527-37529c61b6ac&type=class&staff=a40500bff96f74d68968fdebe47af4658&staffSelected=true"

SETMORE_REVIEWS      = "https://timberhill-personal-training.setmore.com/reviews?sortBy=highestRated"
```

Store these as theme options or PHP constants. These URLs embed Setmore product and staff IDs — if a
service is rebuilt in Setmore the ID changes and every CTA on the site breaks silently. One
definition, one place to fix.

`SETMORE_CONSULTATION` opens directly on the time-slot picker. Verified working. Do **not** substitute
the booking page root.

---

## 2. CTA strings — exact, no variants

| Tier | String | Destination |
|---|---|---|
| Primary | `BOOK A COMPLIMENTARY CONSULTATION` | `SETMORE_CONSULTATION` |
| Secondary | `MEET THE TRAINING TEAM` | `/personal-training/trainers/` or `#team` |
| Tertiary | `Read all 160 reviews ›` | `SETMORE_REVIEWS`, new tab |
| Tertiary | `Call 541-757-8559` | `tel:5417578559` |

Not "Get Started". Not "Book Now". Not "Free Consult". The same string every time — recognition is the
mechanism.

**Never two primary CTAs in one viewport.** Suppress the mobile sticky bar while an in-page primary
CTA is on screen.

### Do not lead with

`pricing` · `packages` · `discounts` · `PACK` · `nutrition` · `hybrid coaching` ·
`long trainer biographies`

Each is legitimate content with a place further down or on a secondary page. None belongs in the
first thirty seconds. Enforced structurally: nothing above section 09 names a price or SKU, trainer
card philosophy is capped at three sentences, the membership discount appears only on the Join page
below the rate table and below the button.

---

## 3. Routes

| Route | Phase | Action |
|---|---|---|
| `/personal-training/` | 2 | Build — the hub |
| `/personal-training/trainers/` | 2 | Build — roster index, filterable by specialty |
| `/personal-training/consultation/` | 2 | Build — what the consultation is |
| `/personal-training/trainers/[slug]/` | 3 | Build after hub is 30 days live |
| `/personal-training/success-stories/` | 3 | **Gated** on written consent for ≥4 subjects |
| `/amenities/personal-training/` | 2 | **301 →** `/personal-training/` |
| `/facilities-2/` | 1 | **301 →** `/amenities/` |
| `personaltraining.timberhillac.com` | 1 | **301 →** canonical. DNS + cert + redirect only. |

### Vanity subdomain

```
DNS   personaltraining   CNAME   timberhillac.com.     (or A record to same host)
TLS   certificate MUST cover the subdomain — verify in a real browser, not curl
301   personaltraining.timberhillac.com/*  ->  https://timberhillac.com/personal-training/
```

Three ways this goes wrong: a **302** instead of 301 (does not pass authority, subdomain gets indexed
separately) · **missing SSL on the subdomain** (visitor who typed the URL off a poster gets a
full-page security warning — most common failure) · **redirect chains** (subdomain → www → canonical
→ trailing slash is four hops; resolve in one).

Exclude the subdomain from the sitemap. Never use it as an internal link target.

It can ship in Phase 1 pointed at the current PT page, so signage and apparel can carry it before the
hub exists.

Verify both redirects resolve in a single hop. Grep the whole site for `/amenities/personal-training/`
and repoint every internal link.

---

## 4. Hub section order

Do not reorder. Nothing above section 09 mentions a price or a service SKU.

**Above-the-fold priority is locked:**

```
PERSONAL TRAINING
YOUR GOALS. YOUR PLAN. YOUR COACH.
[BOOK A COMPLIMENTARY CONSULTATION]   [MEET THE TRAINING TEAM]
```

H1 is the service name alone — the club name is already in the header, the logo and the URL. Brand
line sets in caps as a distinct line, not a subtitle. Two buttons are the only interactive elements
in the hero. Background is **real Timberhill coaching imagery**, navy 55% overlay.

```
01 HERO              locked stack above + nothing else         [primary CTA above fold @ 375×667]
02 TRUST STRIP       four proof points, no images
03 RECOGNITION       13 situation cards, 3-up grid → 1-up mobile, no card links
04 WHAT PT IS        ASSESS · PLAN · COACH · PROGRESS · ADAPT · MEASURE
05 HOW IT WORKS      5 numbered steps                          [primary CTA]
06 MEET THE TEAM     expandable trainer cards, collapsed       [primary CTA]
07 WHY TIMBERHILL    4 differentiators, all evidenced
08 MEMBER RESULTS    testimonial cards from Setmore reviews
09 TRAINING OPTIONS  5 service families, no prices             [primary CTA]
10 ORIENTATION VS PT two-column comparison
11 FAQ               accordion, 12 items, all collapsed on mobile
12 FINAL CTA         navy band, one button, no secondary       [primary CTA]
13 STICKY CTA        mobile only, after hero exits viewport    [primary CTA]
```

Full copy for every section is in the PDF, Production Page Copy. Paste as written.

---

## 5. Service families — public naming

Five public families cover nine internal categories. **Retire "PACK Training" entirely** — the live
name is Performance Lab.

| Public family | Internal categories |
|---|---|
| One-to-One Coaching | Private Training, Personal Coaching, Premier Coaching |
| Partner and Small Group | Small Group Training |
| Hybrid Coaching | Hybrid Coaching (Everfit) |
| Performance Lab | Performance Lab |
| Seasonal and Focused Programs | Built For Her, Peak Ready Performance |

No prices on the hub. No per-service booking links — every card ends in the consultation.

---

## 6. Trainer data

Use a custom post type, not hard-coded cards. Twelve trainers with turnover means hard-coded goes
stale within a quarter.

**Fields:** `photo` (3:4, ≥800×1066) · `name` · `credentials` · `specialties` (multi, fixed
vocabulary) · `works_best_with` (one sentence, second person) · `philosophy` (**2–3 sentences, hard
limit**, first person) · `slug` · `accepting_clients` (bool — show a badge when true, show *nothing*
when false)

The existing amenities page runs full biographies inline, several to six paragraphs — a large part of
why it takes ~14 minutes to read. On the hub a card answers one question: *would this person
understand me?* Full biographies live on the Phase 3 profile page. Existing copy is good — **trim it,
do not rewrite it**.

**Specialty vocabulary (fixed — no free text, or the index filter breaks):**
`Strength` `Muscle Building` `Fat Loss` `Beginners` `Returning to Fitness` `Healthy Aging`
`Injury and Rehabilitation` `Pre and Postnatal` `Athletic Performance` `Youth Athletes`
`Endurance and Events` `Nutrition Coaching` `Martial Arts and Combat Sports` `Corrective Exercise`

**Roster status:** 6 of 12 published. Bios exist for JR, Steve Sackmann, Mason Morgan, Becca Reeve,
Josiah Iwamizu, Devin Shelfer (no photo). Missing entirely: `[Conner McAdams]` `[Emma Ciechanowski]`
`[Jess Caze]` `[Amanda Knight]` `[Kyra Schulties]` `[Jayna Davis]`.

---

## 7. Testimonials

Source: the club's own Setmore review page. 5.0 average, 160 reviews, 159 five-star. Verbatim only —
light trimming for length is fine, rewriting is not.

Approved for immediate use (already public under the reviewer's own name):
Jennifer Gervais → Jess Caze · Shawn Collins → Josiah Iwamizu · Barb LeBoss → Conner McAdams ·
Dick Keis → Conner McAdams · Judy Saslow → Emma Ciechanowski.

**Never fabricate or composite a testimonial** — not for a placeholder, not for a mockup, not
"temporarily". No before/after photos without dated written consent on file. No numeric outcome
claims without documentation.

Render the review count from the live figure or review it monthly. Do not hard-code a number that
will silently go stale.

---

## 8. SEO

```
title       Personal Training in Corvallis, OR | Timberhill Athletic Club
description Certified personal trainers in Corvallis. One-to-one, small group and hybrid
            coaching built around your goals. Book a complimentary 30-minute consultation
            — free, no commitment.
h1          Personal Training
canonical   https://timberhillac.com/personal-training/
vanity      https://personaltraining.timberhillac.com  (301, excluded from sitemap)
```

**"Complimentary" is the brand word. "Free" is the search word.** The button label is locked as
complimentary — correct for positioning. But prospects type *free*, and one of the highest-intent
target queries is "free fitness consultation Corvallis". Resolve it without breaking the rule: the
word *free* appears in the meta description and in the FAQ answer ("It is completely free"), so the
page ranks for the searched term while the visible CTA keeps its register.
**Do not solve this by changing the button.**

**Query ownership — one page per query.** `/personal-training/` owns "personal training Corvallis
Oregon", "personal fitness trainer Corvallis", "strength training Corvallis", "Timberhill personal
training". `/personal-training/trainers/` owns "personal trainer Corvallis".
`/personal-training/consultation/` owns "free fitness consultation Corvallis".

**Schema — JSON-LD in head, not inline microdata:**
- `LocalBusiness` / `HealthClub` site-wide
- `Service` per public family (no `offers`, no prices, until a rate card is approved)
- `FAQPage` — only questions visible on the page; hidden FAQ markup is a guideline violation
- `Person` on trainer profiles (Phase 3): `name`, `jobTitle`, `worksFor`, `hasCredential`, `knowsAbout`
- `BreadcrumbList` on all PT pages
- **`AggregateRating` — DO NOT IMPLEMENT.** The reviews live on a third-party booking domain and are
  not first-party review data. Display them; do not mark them up. Risk of manual action.

---

## 9. Mobile and technical

- Primary CTA fully visible at 375×667 without scrolling. Compress hero height rather than pushing
  the button down.
- Sticky CTA: full width, ≥48px tall, appears after hero exits viewport, suppressed when an in-page
  primary CTA is on screen.
- All tap targets ≥44×44px, including FAQ headers and card expanders.
- The `Personal Training` nav parent must be **tappable in its own right**, not just an expander.
  This is the most common failure when a Divi dropdown is promoted. Verify on iOS Safari and Android
  Chrome.
- Recognition grid: 1-up on mobile. **No carousel** — it hides the content the section exists to show.
- Comparison table stacks into two labelled blocks; no horizontal scroll.
- Images: WebP + JPEG fallback, lazy-loaded below fold, explicit width/height to prevent CLS.
- Hero image is the LCP element — preload it, serve a mobile crop, target LCP < 2.5s on 4G.
- **No forms on the hub.** Booking happens in Setmore.
- WCAG 2.1 AA. `#7FC8FF` (Light Blue) **fails AA for body text on white** — restrict to large text,
  icons, rules and accents on dark. Body copy uses `#2A2A2A` or `#1F4E95`.

**Analytics:** track the primary CTA as one event with the source section as a parameter
(`hero` / `how-it-works` / `team` / `options` / `final` / `sticky`). Without the parameter the
placement map cannot be evaluated after launch.

---

## 10. Navigation

Promote Personal Training to position 2, immediately after About and before Amenities.

```
About · Personal Training › · Amenities › · Family › · Join · Schedules · Members · Contact · Club News
        └ Overview · Our Trainers · Free Consultation
```

Leave a `Personal Training` stub inside the Amenities dropdown pointing at the same hub — returning
visitors have learned where it lives.

Optional but high leverage: a small solid Royal Blue `FREE CONSULTATION` button in the header, on
every page.

**Footer:** add a fourth column — Personal Training Overview · Meet the Training Team · **Book a Free
Consultation** · Read Our Reviews.

---

## 11. Content to delete at launch

- Empty trainer tab labelled `Tab` on the amenities page — renders publicly
- PACK Training section and the 2024 PACK brochure PDF link
- Both Google Forms (Fitness Service Request, Nutrition Service Request) — parallel intake queue,
  no owner
- Every reference to MyFitnessPal and Fitbit — the department runs Everfit

---

## 12. Acceptance criteria — what the visitor must leave knowing

The site is **Exposure #1** in the Mere Exposure System. If a design or copy change puts any of these
at risk, the change is wrong.

1. Timberhill has a serious Personal Training department — *hero, trust strip, Why Timberhill, full team*
2. Personal Training may apply to them — *recognition section, before any service is named*
3. Timberhill has professional trainers with different specialties — *cards with credentials, specialties, works-best-with*
4. Starting does not require choosing a trainer or a package — *How It Works, matching prompt, no pricing on the hub*
5. The clear first step is a complimentary consultation — *one CTA string, five placements, one destination*

---

## 13. Phase gates

**Phase 1 — ship now, no dependencies**

- [ ] Rename Setmore service to `Complimentary Consultation (30 min)` so the promise matches the CTA
- [ ] **Assign ≥3 trainers to the consultation service.** It is currently hard-assigned to one staff
      ID — if that calendar fills, the site's primary CTA appears to have no availability. Highest
      priority item in this document.
- [ ] Add a Personal Training tile to the homepage icon row (link to the current PT page until the
      hub exists)
- [ ] Delete the empty `Tab` trainer tab
- [ ] Remove the PACK brochure link and both Google Forms links
- [ ] 301 `/facilities-2/` → `/amenities/`
- [ ] Register `personaltraining.timberhillac.com`, issue the certificate, 301 it to the current PT
      page so signage and apparel can carry it immediately
- [ ] Confirm who holds DNS and certificate access — club, Oregon Marketing Group, or registrar
- [ ] **Capture the analytics and Search Console baseline before any of the above ships**

**Phase 2 — the hub. Gated on content, not developer capacity.**

Blocked until all six are resolved:

- [ ] Six trainer bios + credentials collected
- [ ] Headshots for those six, plus Devin Shelfer; releases signed and filed
- [ ] Canonical name and title for JR — `JR Romero` vs `JR Prieto-Romero`, `Director of Personal
      Training` vs `Head Trainer`
- [ ] Canonical spelling — `Conner` vs `Connor` (reviews say Connor, roster says Conner)
- [ ] Canonical form — `Becca` vs `Rebecca` Reeve
- [ ] FAQ `[CONFIRM]` items answered: non-member eligibility, and whether any price may be published

Then: build the three Phase 2 routes, restructure nav, add footer column, homepage band, Join block,
Amenities tile, `/fitness/` orientation block, 301 the old PT page, **repoint the vanity subdomain
from the legacy page to the new canonical hub**, deploy schema, pass QA, submit sitemap.

**Phase 3 — after 30 days live**

Individual trainer profiles · success stories (only with consent on file) · review CTA analytics by
placement and reorder if the data disagrees with the placement map · quarterly testimonial refresh
with a named owner.

---

## 14. Reference data (verified)

```
Canonical https://timberhillac.com/personal-training/
Vanity    https://personaltraining.timberhillac.com  (301 to canonical)
Address   2855 Northwest 29th Street, Corvallis, Oregon 97330
Phone     541-757-8559
PT email  jr@timberhillsports.com
Club hrs  Mon–Fri 5:00 AM–10:00 PM · Sat–Sun 7:00 AM–7:00 PM   (website)
Setmore   Mon–Fri 5 AM–9 PM · Sat–Sun 7 AM–7 PM                (DISCREPANCY — reconcile)
Founded   1980          Facility  65,000 sq ft
Reviews   5.0 avg, 160 reviews, 159 five-star
Social    facebook.com/TimberhillAthleticClub · instagram.com/timberhill_ac
```

**Brand tokens:** Royal Blue `#1F4E95` · Charcoal `#2A2A2A` · Light Gray `#F2F4F7` ·
Light Blue `#7FC8FF` · Black `#000000` · White `#FFFFFF`.
Headline font League Spartan, support font Inter.

---

## 15. Assets still outstanding

**Real Timberhill coaching imagery only** — a Timberhill trainer coaching a Timberhill member on the
Timberhill floor.

Hero photograph (≥2400×1350) · homepage band photograph (1600×1200) · 6 trainer headshots
(800×1066) · 5 service-family images (800×600) · 6 section icons (SVG) · homepage tile icon ·
OG image (1200×630, derived from hero).

One two-hour shoot covers all of it. Schedule it **before** development starts.

**Do not license stock while waiting.** A page on solid brand navy with no photograph is more
credible than a page built on stock models in a gym that is not this one.
