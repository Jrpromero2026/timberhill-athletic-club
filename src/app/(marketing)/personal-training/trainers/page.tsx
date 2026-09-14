import type { Metadata } from "next";
import Link from "next/link";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { JsonLd, PrimaryCta } from "@/components/marketing/primitives";
import { Roster } from "@/components/marketing/roster";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import {
  canonicalPath,
  CLUB,
  OG_IMAGE_META,
  TRAINERS,
} from "@/lib/marketing/personal-training";
import { breadcrumbs, trainerList, webPage } from "@/lib/marketing/schema";

/**
 * `/personal-training/trainers/` — the roster index.
 *
 * §8 query ownership: this route owns "personal trainer Corvallis" and nothing
 * else owns it. The title and description are not from the spec PDF; confirm
 * them against Production Page Copy when it arrives.
 */
export const metadata: Metadata = {
  title: "Personal Trainers in Corvallis, OR",
  // Under 160 characters so the closing ask survives the snippet — the
  // previous 218-character version lost it to the ellipsis.
  description:
    "Meet the personal trainers at Timberhill Athletic Club in Corvallis, OR. Filter the roster by specialty and book a free 30-minute consultation.",
  alternates: { canonical: canonicalPath("/personal-training/trainers") },
  openGraph: {
    type: "website",
    title: `Personal Trainers in Corvallis, OR | ${CLUB.name}`,
    description:
      "Twelve trainers, each with their own specialty. Filter the roster and book a free 30-minute consultation.",
    url: canonicalPath("/personal-training/trainers"),
    images: [...OG_IMAGE_META],
  },
};

export default function TrainersIndex() {
  return (
    <div className="pg">
      <CtaAnalytics />
      <JsonLd
        data={webPage({
          path: "/personal-training/trainers",
          name: "Personal Trainers in Corvallis, OR",
          description:
            "The personal training roster at Timberhill Athletic Club, filterable by specialty.",
          authorSlug: "jr-romero",
        })}
      />
      {/* The densest page of named entities on the site. Declaring the roster
          is what lets an answer engine list the trainers rather than infer
          them from prose. */}
      <JsonLd data={trainerList(TRAINERS)} />
      <JsonLd
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Personal Training", path: "/personal-training/" },
          { name: "Our Trainers", path: "/personal-training/trainers/" },
        ])}
      />

      <a className="visually-hidden" href="#main">
        Skip to content
      </a>

      <SiteHeader current="trainers" />

      <main id="main">
        <section className="page-hero" data-hero>
          <div className="wrap">
            <nav className="crumbs" aria-label="Breadcrumb">
              <ol>
                <li>
                  <a href={`${CLUB.origin}/`}>HOME</a> ›
                </li>
                <li>
                  <Link href="/personal-training">PERSONAL TRAINING</Link> ›
                </li>
                <li aria-current="page">OUR TRAINERS</li>
              </ol>
            </nav>
            <h1 className="page-h1">Our Trainers</h1>
            {/* §8 AEO: a standalone answer to "who are the personal trainers
                in Corvallis" — it names the club and the city rather than
                relying on the H1 above it for its subject, so it still reads
                correctly quoted on its own. */}
            <p className="page-lede">
              Timberhill Athletic Club has twelve certified personal trainers on
              staff in Corvallis, Oregon, each with their own specialty — from
              strength and athletic performance to pre and postnatal, healthy
              aging and corrective exercise. You do not have to pick one, but if
              someone here looks like the right fit, say so in your
              consultation.
            </p>
          </div>
        </section>

        <Roster trainers={TRAINERS} />

        <section className="final" aria-labelledby="tr-final-h">
          <div className="wrap">
            <h2 className="is-sm" id="tr-final-h">
              Not sure who to pick?
            </h2>
            <p className="is-sm">
              That is what the consultation is for. Describe what you want and
              we will match you.
            </p>
            <PrimaryCta section="final" size="lg" tone="invert" />
          </div>
        </section>
      </main>

      <SiteFooter />
      <StickyCta />
    </div>
  );
}
