import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { AssetSlot, JsonLd, PrimaryCta, SpecialtyList, Stars } from "@/components/marketing/primitives";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import {
  CLUB,
  OG_IMAGE_META,
  PROFILE_FEATURED,
  PROFILE_REVIEWS,
  SETMORE,
  TRAINERS,
  canonicalPath,
  publishedReviews,
  trainerBySlug,
} from "@/lib/marketing/personal-training";
import { breadcrumbs, person, webPage } from "@/lib/marketing/schema";

/**
 * `/personal-training/trainers/[slug]/` — PHASE 3, built after the hub has
 * been live 30 days (§3).
 *
 * A page exists only for a trainer carrying `profile` blocks, which today is JR
 * Romero alone; every other slug 404s rather than rendering an empty shell, and
 * the roster links to a profile only where one exists. The remaining seven get
 * a page each by adding their biography to the trainer record — no new route
 * code.
 */

export function generateStaticParams() {
  return TRAINERS.filter((trainer) => trainer.profile).map((trainer) => ({
    slug: trainer.slug,
  }));
}

/** `params` is a Promise in this version of Next — it must be awaited. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const trainer = trainerBySlug(slug);
  if (!trainer?.profile) return {};

  const suffix = trainer.credentials.split(" · ")[0];
  const headline = `${trainer.name}, ${suffix} — Personal Trainer in Corvallis`;
  // The page description has to fit a snippet (~160 chars); the schema one
  // does not, so the full works-best-with sentence lives there instead.
  const description = `${trainer.name} at ${CLUB.name} in Corvallis, OR. ${trainer.specialties.slice(0, 3).join(", ")}. Book a free 30-minute consultation.`;

  return {
    title: headline,
    description,
    // Trailing slash, matching the other three routes AND this page's own
    // Person node — they disagreed before, which is two URLs for one page.
    alternates: {
      canonical: canonicalPath(`/personal-training/trainers/${trainer.slug}`),
    },
    openGraph: {
      type: "profile",
      title: `${headline} | ${CLUB.name}`,
      description,
      url: canonicalPath(`/personal-training/trainers/${trainer.slug}`),
      images: [...OG_IMAGE_META],
    },
  };
}

export default async function TrainerProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trainer = trainerBySlug(slug);
  if (!trainer?.profile) notFound();

  const reviews = publishedReviews(PROFILE_REVIEWS[trainer.slug] ?? []);
  const featured = PROFILE_FEATURED[trainer.slug];

  // A trainer's own link if they have one, otherwise the shared free-session
  // link, which opens the staff picker rather than a calendar. The copy below
  // changes with it: only a link carrying a staff id can promise a booking
  // with this trainer.
  const freeSessionUrl = trainer.freeSession
    ? trainer.freeSession
    : trainer.offersFreeSession
      ? SETMORE.freeTrial
      : null;
  const booksThisTrainerDirectly = Boolean(trainer.freeSession);
  const others = TRAINERS.filter((other) => other.slug !== trainer.slug).slice(
    0,
    4,
  );

  return (
    <div className="pg">
      <CtaAnalytics />
      <JsonLd data={person(trainer)} />
      <JsonLd
        data={webPage({
          path: `/personal-training/trainers/${trainer.slug}`,
          name: `${trainer.name} — Personal Trainer in Corvallis`,
          description: trainer.worksBestWith,
          authorSlug: trainer.slug,
        })}
      />
      <JsonLd
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Personal Training", path: "/personal-training/" },
          { name: "Our Trainers", path: "/personal-training/trainers/" },
          {
            name: trainer.name,
            path: `/personal-training/trainers/${trainer.slug}`,
          },
        ])}
      />

      <a className="visually-hidden" href="#main">
        Skip to content
      </a>

      <SiteHeader current="trainers" />

      <main id="main">
        <div className="crumb-strip">
          <nav className="wrap" aria-label="Breadcrumb">
            <ol>
              <li>
                <a href={`${CLUB.origin}/`}>HOME</a> ›
              </li>
              <li>
                <Link href="/personal-training">PERSONAL TRAINING</Link> ›
              </li>
              <li>
                <Link href="/personal-training/trainers">OUR TRAINERS</Link> ›
              </li>
              <li aria-current="page">{trainer.name.toUpperCase()}</li>
            </ol>
          </nav>
        </div>

        <section className="sec" style={{ paddingTop: "clamp(28px,4vw,52px)" }}>
          <div className="wrap">
            <div className="g2 profile-grid">
              {/* Left column: the photograph, and the credentials directly
                  beneath it. They sit here rather than in the biography
                  blocks because they are reference material — scanned once to
                  answer "is this person qualified", not read in sequence with
                  the prose. */}
              <div className="profile-aside">
                <AssetSlot
                  spec="trainer headshot · 3:4 · ≥800×1066 · release signed and filed"
                  shape="portrait"
                  className="profile-slot"
                  framed
                />
                {trainer.certifications ? (
                  <div className="creds">
                    <h2 className="creds-h">Credentials</h2>
                    <ul className="creds-list">
                      {trainer.certifications.map((cert) => (
                        <li className="creds-row" key={cert.award}>
                          <span className="creds-award">
                            {cert.award}
                            {cert.issuer ? (
                              <span className="creds-issuer">{cert.issuer}</span>
                            ) : null}
                          </span>
                          {cert.abbr ? (
                            <span className="creds-abbr">{cert.abbr}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div>
                {trainer.acceptingClients ? (
                  <span
                    className="tag tag-accent"
                    style={{ fontSize: 10, letterSpacing: ".1em" }}
                  >
                    ACCEPTING CLIENTS
                  </span>
                ) : null}
                <h1 className="profile-h1">
                  {trainer.name}, {trainer.credentials.split(" · ")[0]}
                </h1>
                {trainer.jobTitles ? (
                  <div className="profile-role">
                    {trainer.jobTitles.join(" · ").toUpperCase()}
                  </div>
                ) : null}
                <div style={{ marginBottom: 22 }}>
                  <SpecialtyList specialties={trainer.specialties} size="lg" />
                </div>
                <p className="profile-best">{trainer.worksBestWith}</p>

                {/* The full biography lives here, not on the hub card (§6). */}
                <div className="blocks">
                  {trainer.profile.map((block) => (
                    <div key={block.heading}>
                      <h2 className="block-h">{block.heading}</h2>
                      <p className="block-d">{block.body}</p>
                    </div>
                  ))}
                </div>

                {/* §12: the consultation is the primary action here as it is
                    everywhere — starting must not require choosing a trainer.
                    Where a trainer takes free sessions on their own calendar,
                    that sits beneath it as a second door for a reader who has
                    finished the page and already decided. */}
                <PrimaryCta section="profile" />
                {freeSessionUrl ? (
                  <div className="profile-alt">
                    <a
                      className="btn btn-secondary btn-cta"
                      href={freeSessionUrl}
                      target="_blank"
                      rel="noopener"
                      data-cta-section="profile-free-session"
                    >
                      BOOK A FREE 45-MINUTE SESSION
                    </a>
                    <p className="cta-note">
                      The consultation covers what you want and which trainer
                      fits.{" "}
                      {booksThisTrainerDirectly ? (
                        <>
                          This books a free session with{" "}
                          {trainer.name.split(" ")[0]} directly — take it if you
                          have already decided.
                        </>
                      ) : (
                        <>
                          This books a free session straight away; you choose
                          your trainer on the booking page.
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="cta-note">
                    Booking goes to the consultation, not to this trainer&apos;s
                    calendar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {featured || reviews.length > 0 ? (
          <section className="sec sec--surface" aria-labelledby="says-h">
            <div className="wrap">
              <h2
                className="sec-title sec-title--xs"
                id="says-h"
                style={{ marginBottom: 6 }}
              >
                What clients say
              </h2>
              {/* Displayed, never marked up: AggregateRating is deliberately
                  not implemented anywhere in this build (§8). */}
              <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 24px" }}>
                Written by clients under their own names on the club&apos;s
                booking page. Quoted here word for word.
              </p>

              {/* One review given the space to be read rather than scanned.
                  The pull is its opening sentence and the body is the rest,
                  split where the client split it — the whole review, once. */}
              {featured ? (
                <figure className="blueprint quote-card">
                  <div className="g2 quote-grid">
                    <div>
                      <Stars className="quote-stars" />
                      <blockquote className="quote">
                        &ldquo;{featured.pull}&rdquo;
                      </blockquote>
                      <figcaption className="quote-attrib">
                        <strong>{featured.reviewer}</strong>
                        {featured.attribution ? (
                          <span> · {featured.attribution}</span>
                        ) : null}
                      </figcaption>
                    </div>
                    <div className="quote-body">
                      {featured.body.map((paragraph) => (
                        <p key={paragraph.slice(0, 40)}>
                          &ldquo;{paragraph}&rdquo;
                        </p>
                      ))}
                    </div>
                  </div>
                </figure>
              ) : null}
              {/* Three across in one row, matching the hub. Two columns left
                  a third review stranded on a row of its own and paired a long
                  quote with a short one, which reads as a layout fault rather
                  than as proof. Capped at three for the same reason. */}
              {reviews.length > 0 ? (
              <div
                className={`g3 review-row review-row--tight review-row--n${Math.min(
                  3,
                  reviews.length,
                )}`}
              >
                {reviews.slice(0, 3).map((review) => (
                  <figure className="blueprint review-card" key={review.reviewer}>
                    <Stars className="review-stars" />
                    <blockquote className="review-box">
                      “{review.quote}”
                    </blockquote>
                    <figcaption className="review-attrib">
                      <strong>{review.reviewer}</strong>
                    </figcaption>
                  </figure>
                ))}
              </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="sec" aria-labelledby="others-h">
          <div className="wrap">
            <h2
              className="sec-title sec-title--xs"
              id="others-h"
              style={{ marginBottom: 22 }}
            >
              Other trainers
            </h2>
            <div className="g4">
              {others.map((other) => (
                <article className="blueprint other-card" key={other.slug}>
                  <AssetSlot spec="headshot 3:4" shape="portrait" />
                  <div className="other-body">
                    <h3 className="other-name">{other.name}</h3>
                    <div className="other-spec">
                      {other.specialties.join(" · ")}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="cta-row" style={{ marginTop: 26 }}>
              <Link
                className="btn btn-ghost f-link"
                href="/personal-training/trainers"
              >
                See the whole team ›
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <StickyCta />
    </div>
  );
}
