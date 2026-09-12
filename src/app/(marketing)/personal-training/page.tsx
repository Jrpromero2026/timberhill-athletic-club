import type { Metadata } from "next";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { Faq } from "@/components/marketing/faq";
import {
  AssetSlot,
  Corners,
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
  CLUB,
  COMPARISON,
  DIFFERENTIATORS,
  FEATURED_TESTIMONIAL,
  HUB_FAQS,
  PILLARS,
  RECOGNITION,
  REVIEW_STATS,
  REVIEWS,
  SERVICE_FAMILIES,
  SETMORE,
  STEPS,
  TRAINERS,
  TRUST_POINTS,
} from "@/lib/marketing/personal-training";
import {
  breadcrumbs,
  faqPage,
  healthClub,
  serviceGraph,
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
    "Certified personal trainers in Corvallis. One-to-one, small group and hybrid coaching built around your goals. Book a complimentary 30-minute consultation — free, no commitment.",
  alternates: { canonical: "/personal-training/" },
  openGraph: {
    type: "website",
    title: `Personal Training in Corvallis, OR | ${CLUB.name}`,
    description:
      "Certified personal trainers in Corvallis. One-to-one, small group and hybrid coaching built around your goals. Book a complimentary 30-minute consultation — free, no commitment.",
    url: "/personal-training/",
  },
};

export default function PersonalTrainingHub() {
  const faqSchema = faqPage(HUB_FAQS);

  return (
    <div className="pg">
      <CtaAnalytics />
      <JsonLd data={healthClub()} />
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
              coaching a Timberhill member on the Timberhill floor, under this
              navy 55% overlay. It is the LCP element — preload it and serve a
              mobile crop. No stock: brand navy with no photograph is more
              credible than stock models in a gym that is not this one (§15). */}
          <div className="hero-media slot" aria-hidden="true" />
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
                  <Corners />
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
            <SectionHead
              number="04"
              id="pillars-h"
              title="What personal training actually is"
            />
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
            <SectionHead number="05" id="how-h" title="How it works" />
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
              <p className="note-line">
                {TRAINERS.length} of {CLUB.trainerCount} published · bios and
                credentials from Drive · headshots awaiting name mapping
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
            <SectionHead number="07" id="why-h" title="Why Timberhill" />
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
              <Corners />
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

            <div className="g4">
              {REVIEWS.map((review) => (
                <div className="blueprint review-card" key={review.reviewer}>
                  <Corners />
                  <Stars />
                  <div className="review-box">
                    {review.quote ?? "[VERBATIM — paste from Setmore]"}
                  </div>
                  <div className="review-attrib">
                    <strong>{review.reviewer}</strong>
                    {review.trainer ? <span> · on {review.trainer}</span> : null}
                  </div>
                </div>
              ))}
            </div>

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
            <SectionHead number="09" id="options-h" title="Training options" tight>
              <p className="lede">
                Five ways to train with us. Every one of them starts the same
                way, so you do not have to choose from this page.
              </p>
            </SectionHead>
            <div className="g3">
              {SERVICE_FAMILIES.map((family) => (
                <article className="blueprint family-card" key={family.name}>
                  <Corners />
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
            Two columns on desktop, two labelled blocks stacked on mobile with
            no horizontal scroll (§9). */}
        <section className="sec sec--surface" aria-labelledby="cmp-h">
          <div className="wrap">
            <SectionHead
              number="10"
              id="cmp-h"
              title="Equipment orientation vs personal training"
            />
            <div className="g2 compare">
              <div className="blueprint compare-card">
                <Corners />
                <h3 className="cmp-title">Equipment Orientation</h3>
                <div className="cmp-kicker">INCLUDED WITH MEMBERSHIP</div>
                {COMPARISON.map((row) => (
                  <div className="cmp-row" key={row.label}>
                    <div className="cmp-label">{row.label}</div>
                    <div className="cmp-val">{row.orientation}</div>
                  </div>
                ))}
              </div>
              <div className="blueprint compare-card compare-card--pt on-dark">
                <Corners />
                <h3 className="cmp-title">Personal Training</h3>
                <div className="cmp-kicker">
                  AN ONGOING COACHING RELATIONSHIP
                </div>
                {COMPARISON.map((row) => (
                  <div className="cmp-row" key={row.label}>
                    <div className="cmp-label">{row.label}</div>
                    <div className="cmp-val">{row.training}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 11 · FAQ ═══════════════════════════════════════════════════
            Twelve items, all collapsed. Only the settled answers appear in
            the FAQPage markup above — hidden FAQ markup is a guideline
            violation, and so is marking a [CONFIRM] placeholder as an
            answer (§8). */}
        <section className="sec" aria-labelledby="faq-h">
          <div className="wrap">
            <SectionHead number="11" id="faq-h" title="Questions" />
            <Faq items={HUB_FAQS} />
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
