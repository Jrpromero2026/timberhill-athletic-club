import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import {
  AssetSlot,
  JsonLd,
  PrimaryCta,
  Stars,
} from "@/components/marketing/primitives";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import {
  CLUB,
  PROFILE_REVIEWS,
  publishedReviews,
  TRAINERS,
  trainerBySlug,
} from "@/lib/marketing/personal-training";
import { breadcrumbs, person } from "@/lib/marketing/schema";

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
  const description = `${trainer.name} at ${CLUB.name} in Corvallis. ${trainer.worksBestWith} Book a free 30-minute consultation.`;

  return {
    title: headline,
    description,
    alternates: { canonical: `/personal-training/trainers/${trainer.slug}` },
    openGraph: {
      type: "profile",
      title: `${headline} | ${CLUB.name}`,
      description,
      url: `/personal-training/trainers/${trainer.slug}`,
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
  const others = TRAINERS.filter((other) => other.slug !== trainer.slug).slice(
    0,
    4,
  );

  return (
    <div className="pg">
      <CtaAnalytics />
      <JsonLd data={person(trainer)} />
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
              <AssetSlot
                spec="trainer headshot · 3:4 · ≥800×1066 · release signed and filed"
                shape="portrait"
                className="profile-slot"
                framed
              />

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
                <div className="taglist" style={{ marginBottom: 22 }}>
                  {trainer.specialties.map((specialty) => (
                    <span className="tag tag-outline" key={specialty}>
                      {specialty}
                    </span>
                  ))}
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

                {/* §12: the CTA goes to the consultation, not to this
                    trainer's calendar — starting must not require choosing a
                    trainer. */}
                <PrimaryCta section="profile" />
                <p className="cta-note">
                  Booking goes to the consultation, not to this trainer&apos;s
                  calendar.
                </p>
              </div>
            </div>
          </div>
        </section>

        {reviews.length > 0 ? (
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
              <div className="g2">
                {reviews.map((review) => (
                  <div className="blueprint review-card" key={review.reviewer}>
                    <Stars />
                    <div className="review-box">“{review.quote}”</div>
                    <div className="review-attrib">
                      <strong>{review.reviewer}</strong>
                    </div>
                  </div>
                ))}
              </div>
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
