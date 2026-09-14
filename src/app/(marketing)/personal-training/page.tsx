import type { Metadata } from "next";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { Faq } from "@/components/marketing/faq";
import {
  AssetSlot,
  JsonLd,
  PrimaryCta,
  SectionHead,
  Stars,
} from "@/components/marketing/primitives";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { TeamGrid } from "@/components/marketing/team-grid";
import {
  canonicalPath,
  CLUB,
  OG_IMAGE_META,
  COMPARISON,
  DIFFERENTIATORS,
  FEATURED_TESTIMONIAL,
  HUB_FAQS,
  PILLARS,
  RECOGNITION,
  REVIEW_STATS,
  publishedReviews,
  REVIEWS,
  SERVICE_FAMILIES,
  settledFaqs,
  SETMORE,
  STEPS,
  TRAINERS,
  TRUST_POINTS,
} from "@/lib/marketing/personal-training";
import {
  breadcrumbs,
  faqPage,
  healthClub,
  serviceAnchor,
  serviceGraph,
  webPage,
} from "@/lib/marketing/schema";

/**
 * `/personal-training/` — the hub.
 *
 * Section order 01–13 is LOCKED (§4) and nothing above section 09 names a
 * price or a service SKU. The sections are numbered in the markup so a
 * reordering is visible in review.
 *
 * "Complimentary" is the brand word, "free" is the search word (§8): the word
 * free appears in the meta description below and in the first FAQ answer, so
 * the page ranks for the searched term while the visible CTA keeps its
 * register. Do not resolve that tension by changing the button.
 */
export const metadata: Metadata = {
  title: "Personal Training in Corvallis, OR",
  description:
    "Certified personal trainers in Corvallis, OR. One-to-one, small group and hybrid coaching built around your goals. Book a free 30-minute consultation.",
  alternates: { canonical: canonicalPath("/personal-training") },
  openGraph: {
    type: "website",
    title: `Personal Training in Corvallis, OR | ${CLUB.name}`,
    description:
      "Certified personal trainers in Corvallis, OR. One-to-one, small group and hybrid coaching built around your goals. Book a free 30-minute consultation.",
    url: canonicalPath("/personal-training"),
    images: [...OG_IMAGE_META],
  },
};

export default function PersonalTrainingHub() {
  const faqSchema = faqPage(HUB_FAQS);
  const reviews = publishedReviews(REVIEWS);

  return (
    <div className="pg">
      <CtaAnalytics />
      {/* The roster travels with the organization as `employee`, so the club
          and the twelve people who work there resolve as one entity graph
          rather than a business and a disconnected list of names. */}
      <JsonLd data={healthClub(TRAINERS)} />
      <JsonLd
        data={webPage({
          path: "/personal-training",
          name: "Personal Training in Corvallis, OR",
          description:
            "What personal training at Timberhill Athletic Club is, how it works, who coaches it, and what it costs to find out.",
          authorSlug: "jr-romero",
        })}
      />
      <JsonLd data={serviceGraph()} />
      <JsonLd
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Personal Training", path: "/personal-training/" },
        ])}
      />
      {faqSchema ? <JsonLd data={faqSchema} /> : null}

      <a className="visually-hidden" href="#main">
        Skip to content
      </a>

      <SiteHeader current="hub" />

      <main id="main">
        {/* ═══ 01 · hero ══════════════════════════════════════════════════
            The locked stack and nothing else: H1, brand line, two buttons.
            H1 is the service name alone — the club name is already in the
            header, the logo and the URL. The primary CTA must be fully
            visible at 375×667 without scrolling: compress the hero height
            rather than pushing the button down (§4, §9). */}
        <section className="hero" data-hero aria-labelledby="hero-h1">
          {/* Hero photograph outstanding: ≥2400×1350, a Timberhill trainer
              coaching a Timberhill member on the Timberhill floor, dropped in
              as an <img> here and sitting under the navy 55% overlay. It is
              the LCP element — preload it and serve a mobile crop. Until then
              this is solid brand navy: no stock, and nothing that advertises
              the absence (§15). */}
          <div className="hero-media" aria-hidden="true" />
          <div className="hero-overlay" aria-hidden="true" />

          <div className="wrap hero-inner">
            <h1 className="hero-h1" id="hero-h1">
              PERSONAL TRAINING
            </h1>
            <p className="hero-brandline">YOUR GOALS. YOUR PLAN. YOUR COACH.</p>
            <div className="rowcol">
              <PrimaryCta section="hero" />
              <a className="btn btn-secondary btn-cta btn-on-dark" href="#team">
                MEET THE TRAINING TEAM
              </a>
            </div>
          </div>
        </section>

        {/* ═══ 02 · trust strip ═══════════════════════════════════════════ */}
        <section className="strip" aria-label="Timberhill at a glance">
          <div className="wrap">
            <div className="g4 strip-grid">
              {TRUST_POINTS.map((point) => (
                <div className="stat" key={point.small}>
                  <span className="stat-big">{point.big}</span>
                  <span className="stat-small">{point.small}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 03 · recognition ═══════════════════════════════════════════
            Before any service is named. Thirteen cards, 3-up to 1-up, no card
            links and NO CAROUSEL — a carousel hides the content the section
            exists to show (§4, §9). */}
        <section className="sec" aria-labelledby="rec-h">
          <div className="wrap">
            <SectionHead
              number="03"
              id="rec-h"
              title="You do not need a reason we would recognise."
              tight
            >
              <p className="lede">
                Most people who start training here arrive with something
                ordinary. One of these is usually close enough.
              </p>
            </SectionHead>
            <ul className="g3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {RECOGNITION.map((situation, index) => (
                <li className="blueprint rec-card" key={situation}>
                  <span className="rec-n" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="rec-t">{situation}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ═══ 04 · what personal training is ═════════════════════════════ */}
        <section className="sec sec--navy on-dark" aria-labelledby="pillars-h">
          <div className="wrap">
            {/* §8 AEO: the heading is the question somebody types, and the
                lede below it is a standalone answer — it names the club and
                the service rather than leaning on the heading for its subject,
                so it survives being quoted on its own. */}
            <SectionHead
              number="04"
              id="pillars-h"
              title="What is personal training at Timberhill?"
              tight
            >
              <p className="lede lede--wide">
                Personal training at Timberhill Athletic Club is one-to-one
                coaching with a certified trainer who builds your program,
                teaches you the movements and adjusts the plan as you progress.
                It is a coaching relationship rather than a set of workouts
                handed over, and it starts with a free thirty-minute
                consultation.
              </p>
            </SectionHead>
            <div className="pillars">
              {PILLARS.map((pillar) => (
                <div className="pillar" key={pillar.key}>
                  <div className="pillar-k">{pillar.key}</div>
                  <div className="pillar-d">{pillar.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 05 · how it works ══════════════════════════════════════════ */}
        <section className="sec" aria-labelledby="how-h">
          <div className="wrap">
            <SectionHead
              number="05"
              id="how-h"
              title="How does personal training work here?"
              tight
            >
              <p className="lede">
                Training at Timberhill starts with a free thirty-minute
                consultation, then a first session where a trainer assesses how
                you move and writes the first version of your program. Most
                people train once or twice a week, and the program is reviewed
                and adjusted as they progress.
              </p>
            </SectionHead>
            <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STEPS.map((step, index) => (
                <li className="step" key={step.title}>
                  {/* Decorative ordinal — the list carries the order. */}
                  <span className="step-n" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="step-body">
                    <h3 className="step-t">{step.title}</h3>
                    <p className="step-d">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="cta-row">
              <PrimaryCta section="how-it-works" />
            </div>
          </div>
        </section>

        {/* ═══ 06 · meet the team ═════════════════════════════════════════ */}
        <section className="sec sec--surface" id="team" aria-labelledby="team-h">
          <div className="wrap">
            <SectionHead
              number="06"
              id="team-h"
              title="Meet the training team"
              tight
            >
              <p className="lede lede--tight">
                Twelve trainers on staff. A card answers one question: would
                this person understand me? You do not have to pick one — the
                consultation does the matching.
              </p>
            </SectionHead>
            <TeamGrid trainers={TRAINERS} />
            <div className="cta-row">
              <PrimaryCta section="team" />
            </div>
          </div>
        </section>

        {/* ═══ 07 · why Timberhill ════════════════════════════════════════ */}
        <section className="sec" aria-labelledby="why-h">
          <div className="wrap">
            <SectionHead
              number="07"
              id="why-h"
              title="Why train at Timberhill?"
              tight
            >
              <p className="lede lede--wide">
                Timberhill Athletic Club has been locally owned in Corvallis
                since 1980. Personal training here is a department with twelve
                certified trainers and five program formats across sixty-five
                thousand square feet — not a service the front desk arranges on
                the side.
              </p>
            </SectionHead>
            <div className="diffs">
              {DIFFERENTIATORS.map((diff) => (
                <div className="diff" key={diff.title}>
                  <h3 className="diff-t">{diff.title}</h3>
                  <p className="diff-d">{diff.body}</p>
                  <div className="diff-ev">{diff.evidence}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 08 · member results ════════════════════════════════════════
            Verbatim only, light trimming for length. Never fabricated, never
            composited — not for a placeholder, not "temporarily" (§7). The
            four approved attributions are public under the reviewer's own
            name; their text is not yet pasted, so the card says what it is
            waiting for rather than inventing copy. Displayed, never marked
            up: AggregateRating is deliberately absent (§8). */}
        <section className="sec sec--surface" aria-labelledby="results-h">
          <div className="wrap">
            <SectionHead number="08" id="results-h" title="Member results" tight>
              <p className="lede lede--wide">
                {REVIEW_STATS.average} average across {REVIEW_STATS.count}{" "}
                reviews. {REVIEW_STATS.fiveStar} of them are five stars.
              </p>
            </SectionHead>

            <figure className="blueprint quote-card">
              <div className="g2 quote-grid">
                <div>
                  <Stars className="quote-stars" />
                  <blockquote className="quote">
                    “{FEATURED_TESTIMONIAL.pull}”
                  </blockquote>
                  <figcaption className="quote-attrib">
                    <strong>{FEATURED_TESTIMONIAL.reviewer}</strong>
                    <span> · {FEATURED_TESTIMONIAL.attribution}</span>
                  </figcaption>
                </div>
                <div className="quote-body">
                  {FEATURED_TESTIMONIAL.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>“{paragraph}”</p>
                  ))}
                </div>
              </div>
            </figure>

            {reviews.length > 0 ? (
              <div className="g4">
                {reviews.map((review) => (
                  <div className="blueprint review-card" key={review.reviewer}>
                    <Stars />
                    <div className="review-box">“{review.quote}”</div>
                    <div className="review-attrib">
                      <strong>{review.reviewer}</strong>
                      {review.trainer ? (
                        <span> · on {review.trainer}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* §7: read the count from the live figure or review it monthly. */}
            <a
              className="btn btn-ghost reviews-link"
              href={SETMORE.reviews}
              target="_blank"
              rel="noopener"
            >
              Read all {REVIEW_STATS.count} reviews ›
            </a>
          </div>
        </section>

        {/* ═══ 09 · training options ══════════════════════════════════════
            The first section that may name a service. No prices anywhere on
            the hub, and no per-service booking links — every card ends in the
            consultation. "PACK Training" is retired: the live name is
            Performance Lab (§4, §5). */}
        <section className="sec" aria-labelledby="options-h">
          <div className="wrap">
            <SectionHead
              number="09"
              id="options-h"
              title="What kinds of personal training can you book?"
              tight
            >
              <p className="lede">
                Timberhill offers five personal training formats: one-to-one
                coaching, partner and small group, hybrid coaching, Performance
                Lab, and seasonal and focused programs. Every one of them starts
                with the same free consultation, so you do not have to choose
                from this page.
              </p>
            </SectionHead>
            <div className="g3">
              {SERVICE_FAMILIES.map((family) => (
                <article
                  className="blueprint family-card"
                  id={serviceAnchor(family.name)}
                  key={family.name}
                >
                  <AssetSlot spec="service image · 800×600" shape="landscape" />
                  <div className="family-body">
                    <h3 className="f-name">{family.name}</h3>
                    <p className="f-line">{family.body}</p>
                    <a
                      className="btn btn-ghost f-link"
                      href={SETMORE.consultation}
                      data-cta-section="options"
                    >
                      Start with a consultation ›
                    </a>
                  </div>
                </article>
              ))}
            </div>
            <div className="cta-row">
              <PrimaryCta section="options" />
            </div>
          </div>
        </section>

        {/* ═══ 10 · orientation vs personal training ══════════════════════
            A real <table>, not a grid of divs.

            Five attributes compared across two options is the shape an answer
            engine lifts wholesale, and it settles the question that separates
            a paying client from a browsing member. As divs it was a wall of
            text with the relationship between label, column and value carried
            only by CSS. With <th scope> on both axes that relationship is in
            the markup, and the mobile treatment falls out of the table rather
            than needing a second stacked copy (§9: no horizontal scroll). */}
        <section className="sec sec--surface" aria-labelledby="cmp-h">
          <div className="wrap">
            <SectionHead
              number="10"
              id="cmp-h"
              title="How is personal training different from the free equipment orientation?"
              tight
            >
              <p className="lede lede--wide">
                The equipment orientation is a single appointment included with
                a Timberhill membership that shows you how to use the machines
                safely. Personal training is an ongoing relationship with a
                coach who builds a program for your goal and progresses it —
                the orientation ends when you leave the floor, the program does
                not.
              </p>
            </SectionHead>

            <div className="cmp-scroll">
              <table className="cmp-table">
                <caption className="visually-hidden">
                  Equipment orientation compared with personal training, across
                  five attributes
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">Attribute</span>
                    </th>
                    <th scope="col">
                      Equipment Orientation
                      <span className="cmp-kicker">
                        Included with membership
                      </span>
                    </th>
                    <th scope="col" className="cmp-col--pt">
                      Personal Training
                      <span className="cmp-kicker">
                        An ongoing coaching relationship
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {/* `data-col` is what labels each cell once the columns
                          stack at phone width — the header row is off-screen
                          there, so without it a value has no column. */}
                      <td data-col="Equipment Orientation">{row.orientation}</td>
                      <td className="cmp-col--pt" data-col="Personal Training">
                        {row.training}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══ 11 · FAQ ═══════════════════════════════════════════════════
            All collapsed. Only settled answers are rendered, and the same set
            appears in the FAQPage markup above — hidden FAQ markup is a
            guideline violation, and so is marking a placeholder as an answer
            (§8). Four questions are written and waiting on the PT Director;
            they return to the page with their answers. */}
        <section className="sec" aria-labelledby="faq-h">
          <div className="wrap">
            <SectionHead
              number="11"
              id="faq-h"
              title="Common questions about personal training"
            />
            <Faq items={settledFaqs(HUB_FAQS)} />
          </div>
        </section>

        {/* ═══ 12 · final CTA ═════════════════════════════════════════════
            Navy band, one button, no secondary (§4). */}
        <section className="final" aria-labelledby="final-h">
          <div className="wrap">
            <h2 id="final-h">Thirty minutes. No commitment.</h2>
            <p>
              Sit down with a trainer, talk about what you want, and leave with
              a plan for a first session. If it is not for you, that is a fine
              outcome too.
            </p>
            <PrimaryCta section="final" size="lg" tone="invert" />
            <div className="final-tel">
              <a href={CLUB.phoneHref}>Call {CLUB.phone}</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* ═══ 13 · sticky CTA — mobile only ════════════════════════════════ */}
      <StickyCta />
    </div>
  );
}
