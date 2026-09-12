import type { Metadata } from "next";
import Link from "next/link";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { JsonLd, PrimaryCta } from "@/components/marketing/primitives";
import { Roster } from "@/components/marketing/roster";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { CLUB, TRAINERS } from "@/lib/marketing/personal-training";
import { breadcrumbs } from "@/lib/marketing/schema";

/**
 * `/personal-training/trainers/` — the roster index.
 *
 * §8 query ownership: this route owns "personal trainer Corvallis" and nothing
 * else owns it. The title and description are not from the spec PDF; confirm
 * them against Production Page Copy when it arrives.
 */
export const metadata: Metadata = {
  title: "Personal Trainers in Corvallis, OR",
  description:
    "Meet the personal trainers at Timberhill Athletic Club in Corvallis. Filter by specialty — strength, healthy aging, pre and postnatal, athletic performance, corrective exercise — and book a free 30-minute consultation.",
  alternates: { canonical: "/personal-training/trainers/" },
  openGraph: {
    type: "website",
    title: `Personal Trainers in Corvallis, OR | ${CLUB.name}`,
    description:
      "Twelve trainers, each with their own specialty. Filter the roster and book a free 30-minute consultation.",
    url: "/personal-training/trainers/",
  },
};

export default function TrainersIndex() {
  return (
    <div className="pg">
      <CtaAnalytics />
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
            <p className="page-lede">
              Twelve trainers, each with their own specialty. You do not have to
              pick one — but if someone here looks like the right fit, say so in
              your consultation.
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
