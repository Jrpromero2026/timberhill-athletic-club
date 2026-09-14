import type { Metadata } from "next";
import Link from "next/link";
import { CtaAnalytics } from "@/components/marketing/cta-analytics";
import { Faq } from "@/components/marketing/faq";
import {
  AssetSlot,
  JsonLd,
  PrimaryCta,
} from "@/components/marketing/primitives";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCta } from "@/components/marketing/sticky-cta";
import {
  CLUB,
  OG_IMAGE_META,
  CONSULTATION_AGENDA,
  CONSULTATION_FACTS,
  CONSULTATION_FAQS,
  settledFaqs,
  CONSULTATION_IS_NOT,
  CONSULTATION_PREP,
} from "@/lib/marketing/personal-training";
import {
  breadcrumbs,
  consultationService,
  faqPage,
  webPage,
} from "@/lib/marketing/schema";

/**
 * `/personal-training/consultation/`.
 *
 * §8 query ownership: this route owns "free fitness consultation Corvallis",
 * one of the highest-intent target queries. That is why *free* carries the H1,
 * the title and the description here while the button label stays
 * complimentary — complimentary is the brand word, free is the search word,
 * and the resolution is to put the search word in the copy rather than to
 * change the button.
 */
export const metadata: Metadata = {
  title: "Free Fitness Consultation in Corvallis, OR",
  description:
    "A free 30-minute fitness consultation with a trainer at Timberhill Athletic Club in Corvallis, OR. No charge, no membership needed, nothing sold.",
  alternates: { canonical: "/personal-training/consultation/" },
  openGraph: {
    type: "website",
    title: `Free Fitness Consultation in Corvallis, OR | ${CLUB.name}`,
    description:
      "Thirty minutes with a Timberhill trainer. Completely free, no membership needed, nothing sold at the end of it.",
    url: "/personal-training/consultation/",
    images: [...OG_IMAGE_META],
  },
};

export default function ConsultationPage() {
  const faqSchema = faqPage(CONSULTATION_FAQS);

  return (
    <div className="pg">
      <CtaAnalytics />
      <JsonLd
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Personal Training", path: "/personal-training/" },
          {
            name: "Free Consultation",
            path: "/personal-training/consultation/",
          },
        ])}
      />
      <JsonLd
        data={webPage({
          path: "/personal-training/consultation",
          name: "Free Fitness Consultation in Corvallis, OR",
          description:
            "What the free 30-minute fitness consultation at Timberhill Athletic Club covers, what it is not, and how to book it.",
          authorSlug: "jr-romero",
        })}
      />
      <JsonLd data={consultationService()} />
      {faqSchema ? <JsonLd data={faqSchema} /> : null}

      <a className="visually-hidden" href="#main">
        Skip to content
      </a>

      <SiteHeader current="consultation" />

      <main id="main">
        <section className="page-hero page-hero--tall" data-hero>
          <div className="wrap">
            <nav className="crumbs" aria-label="Breadcrumb">
              <ol>
                <li>
                  <a href={`${CLUB.origin}/`}>HOME</a> ›
                </li>
                <li>
                  <Link href="/personal-training">PERSONAL TRAINING</Link> ›
                </li>
                <li aria-current="page">FREE CONSULTATION</li>
              </ol>
            </nav>
            <h1 className="page-h1 page-h1--lg">
              The Free Fitness Consultation
            </h1>
            <p className="page-lede page-lede--lg">
              Thirty minutes with a Timberhill trainer. It is completely free,
              you do not need to be a member to book one, and nothing is sold at
              the end of it.
            </p>
            <PrimaryCta section="hero" tone="invert" />
          </div>
        </section>

        <section className="strip facts" aria-label="The consultation at a glance">
          <div className="wrap">
            <div className="g4 facts-grid">
              {CONSULTATION_FACTS.map((fact) => (
                <div key={fact.small}>
                  <div className="fact-big">{fact.big}</div>
                  <div className="fact-small">{fact.small}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec">
          <div className="wrap">
            <div className="g2 consult-grid">
              <div>
                <h2
                  className="sec-title sec-title--sm"
                  style={{ marginBottom: 18 }}
                >
                  What happens in the free consultation?
                </h2>
                <div className="agenda">
                  {CONSULTATION_AGENDA.map((item, index) => (
                    <div className="agenda-row" key={item.title}>
                      <span className="agenda-n" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="agenda-t">{item.title}</h3>
                        <p className="agenda-d">{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="blueprint nots-card">
                  <h2 className="nots-title">What it is not</h2>
                  <ul className="nots">
                    {CONSULTATION_IS_NOT.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                {/* Consultation photograph outstanding: 1600×1200, a trainer
                    and a member talking, not training. */}
                <AssetSlot
                  spec="consultation photograph · 1600×1200 · trainer and member talking, not training"
                  shape="landscape"
                  className="consult-photo"
                  framed
                />
              </div>
            </div>
          </div>
        </section>

        <section className="sec sec--surface" aria-labelledby="prep-h">
          <div className="wrap">
            <h2
              className="sec-title sec-title--sm"
              id="prep-h"
              style={{ marginBottom: 24 }}
            >
              What should you bring?
            </h2>
            <div className="g3">
              {CONSULTATION_PREP.map((item) => (
                <div className="blueprint prep-card" key={item.title}>
                  <h3 className="prep-t">{item.title}</h3>
                  <p className="prep-d">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" aria-labelledby="cfaq-h">
          <div className="wrap" style={{ maxWidth: 820 }}>
            <h2
              className="sec-title sec-title--sm"
              id="cfaq-h"
              style={{ marginBottom: 18 }}
            >
              Common questions about the consultation
            </h2>
            <Faq items={settledFaqs(CONSULTATION_FAQS)} openInitially={0} className="" />
          </div>
        </section>

        <section className="final" aria-labelledby="cfinal-h">
          <div className="wrap">
            <h2 className="is-md" id="cfinal-h" style={{ marginBottom: 26 }}>
              Pick a time that suits you.
            </h2>
            <PrimaryCta section="final" size="lg" tone="invert" />
            <div className="final-tel">
              Or <a href={CLUB.phoneHref}>call {CLUB.phone}</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <StickyCta />
    </div>
  );
}
