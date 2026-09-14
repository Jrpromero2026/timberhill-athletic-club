/**
 * JSON-LD for the public Personal Training routes (brief §8).
 *
 * Three rules the brief is emphatic about, all enforced here rather than left
 * to the page author:
 *
 *   - `AggregateRating` is NOT implemented, anywhere. The reviews live on a
 *     third-party booking domain and are not first-party review data. They are
 *     displayed on the pages; they are not marked up. Risk of manual action.
 *   - `FAQPage` carries only questions whose answers are settled. Hidden FAQ
 *     markup is a guideline violation, and so is marking a `[CONFIRM]`
 *     placeholder as an answer, so `faqPage()` filters unconfirmed items out.
 *   - `Service` entries carry no `offers` and no prices until a rate card is
 *     approved. `priceRange` on the organization is deliberately absent for
 *     the same reason — it is a coarser claim than a rate, but it is still a
 *     claim about price.
 *
 * Every node is addressed by a stable `@id` on the publishing host, so the
 * organization, its trainers and its services resolve to one entity graph
 * across all four routes rather than four disconnected islands.
 *
 * Two fields a local-business record normally carries are absent on purpose:
 * `geo` and `hasMap` need surveyed coordinates for 2855 NW 29th Street, and a
 * wrong latitude is worse than a missing one. Supply them and add them here.
 */
import {
  canonicalUrl,
  CLUB,
  CONTENT_REVIEWED,
  OG_IMAGE,
  SERVICE_FAMILIES,
  SITE_ORIGIN,
  type FaqItem,
  type Trainer,
} from "./personal-training";

const ORG_ID = `${SITE_ORIGIN}/#organization`;

/** Stable per-trainer identifier, so a Person referenced from the roster and
 *  the same Person on their own profile are one entity, not two. */
export function trainerId(slug: string): string {
  return `${canonicalUrl(`/personal-training/trainers/${slug}`)}#person`;
}

/** Stable per-service identifier. */
function serviceId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${canonicalUrl("/personal-training")}#service-${slug}`;
}

/** The anchor a service card carries on the hub, so an answer engine naming
 *  one service has somewhere to send the reader. */
export function serviceAnchor(name: string): string {
  return `service-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Site-wide LocalBusiness / HealthClub. */
export function healthClub(trainers: readonly Trainer[] = []) {
  return {
    "@context": "https://schema.org",
    "@type": "HealthClub",
    "@id": ORG_ID,
    name: CLUB.name,
    // The club's own website. These routes are published on SITE_ORIGIN, but
    // the business's homepage is the club site, and `sameAs` ties them.
    url: `${CLUB.origin}/`,
    telephone: CLUB.phoneE164,
    email: CLUB.email,
    foundingDate: CLUB.founded,
    image: OG_IMAGE,
    logo: OG_IMAGE,
    address: {
      "@type": "PostalAddress",
      streetAddress: CLUB.street,
      addressLocality: CLUB.city,
      addressRegion: CLUB.region,
      postalCode: CLUB.postalCode,
      addressCountry: "US",
    },
    areaServed: [
      { "@type": "City", name: "Corvallis", containedInPlace: { "@type": "State", name: "Oregon" } },
      { "@type": "City", name: "Philomath" },
      { "@type": "City", name: "Albany" },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "05:00",
        closes: "22:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday", "Sunday"],
        opens: "07:00",
        closes: "19:00",
      },
    ],
    // The roster as employees of the club — the single strongest entity
    // signal on the site, and it was previously declared nowhere.
    employee: trainers.map((trainer) => ({
      "@type": "Person",
      "@id": trainerId(trainer.slug),
      name: trainer.name,
      jobTitle: trainer.jobTitles ? [...trainer.jobTitles] : "Personal Trainer",
      knowsAbout: [...trainer.specialties],
    })),
    makesOffer: SERVICE_FAMILIES.map((family) => ({
      "@type": "Offer",
      itemOffered: { "@id": serviceId(family.name) },
    })),
    sameAs: [CLUB.facebook, CLUB.instagram, `${CLUB.origin}/`],
  };
}

/** One Service per public family. No `offers` with prices (§5, §8), but each
 *  one now has an id and a URL so it can be named and cited. */
export function serviceGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": SERVICE_FAMILIES.map((family) => ({
      "@type": "Service",
      "@id": serviceId(family.name),
      name: family.name,
      serviceType: "Personal Training",
      url: `${canonicalUrl("/personal-training")}#${serviceAnchor(family.name)}`,
      provider: { "@id": ORG_ID },
      areaServed: { "@type": "City", name: "Corvallis, Oregon" },
      description: family.body,
      // Every service starts the same way, and that is the bookable step.
      potentialAction: {
        "@type": "ReserveAction",
        name: "Book a complimentary consultation",
        target: canonicalUrl("/personal-training/consultation"),
      },
    })),
  };
}

export function breadcrumbs(trail: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      // "Home" is the club's own homepage, which is where the VISIBLE crumb
      // links. Resolving it against this host instead pointed the markup at a
      // different page than the one on screen, and at a redirect besides.
      item: entry.path === "/" ? `${CLUB.origin}/` : canonicalUrl(entry.path),
    })),
  };
}

/**
 * The page itself: who wrote it, when it was last reviewed, and what it is
 * about. Freshness and named authorship are weighed by answer engines, and
 * neither was declared anywhere before.
 */
export function webPage({
  path,
  name,
  description,
  authorSlug,
}: {
  path: string;
  name: string;
  description: string;
  /** Trainer whose expertise stands behind the copy. */
  authorSlug?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonicalUrl(path)}#webpage`,
    url: canonicalUrl(path),
    name,
    description,
    inLanguage: "en-US",
    isPartOf: { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: CLUB.name, url: `${SITE_ORIGIN}/` },
    about: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    dateModified: CONTENT_REVIEWED,
    ...(authorSlug ? { author: { "@id": trainerId(authorSlug) } } : {}),
  };
}

/**
 * The consultation itself, as a bookable free service.
 *
 * "Free" is the search word (§8) and this is the one thing on the site with a
 * price that CAN be published, because it is zero. `priceCurrency` is required
 * alongside a zero price or the offer is invalid.
 */
export function consultationService() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${canonicalUrl("/personal-training/consultation")}#service`,
    name: "Free Fitness Consultation",
    serviceType: "Fitness consultation",
    url: canonicalUrl("/personal-training/consultation"),
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "City", name: "Corvallis, Oregon" },
    description:
      "A free 30-minute appointment with a Timberhill trainer: what you want, where you are starting, how you move, and what a first block would look like. No membership required and nothing is sold in the room.",
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: canonicalUrl("/personal-training/consultation"),
    },
    potentialAction: {
      "@type": "ReserveAction",
      name: "Book a complimentary consultation",
      target: canonicalUrl("/personal-training/consultation"),
    },
  };
}

/**
 * Only the settled questions. Returns null when nothing qualifies, so a page
 * with no confirmed answers emits no FAQPage at all rather than an empty one.
 */
export function faqPage(items: readonly FaqItem[]) {
  const settled = items.filter((item) => !item.unconfirmed);
  if (settled.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: settled.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Person, on trainer profiles only (§8, Phase 3). */
export function person(trainer: Trainer) {
  const credentials = trainer.profile
    ?.find((block) => block.heading === "Credentials")
    ?.body.split(" · ")
    .map((name) => ({
      "@type": "EducationalOccupationalCredential",
      name,
    }));

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": trainerId(trainer.slug),
    name: trainer.name,
    jobTitle: trainer.jobTitles ? [...trainer.jobTitles] : "Personal Trainer",
    worksFor: { "@id": ORG_ID },
    url: canonicalUrl(`/personal-training/trainers/${trainer.slug}`),
    hasCredential: credentials,
    knowsAbout: [...trainer.specialties],
    description: trainer.worksBestWith,
  };
}

/**
 * The roster as an ordered list of people.
 *
 * `/personal-training/trainers` is the route that owns "personal trainer
 * Corvallis" and it is the densest page of named entities on the site — it
 * previously declared none of them, so an answer engine asked who the trainers
 * in Corvallis are had to infer the list from prose.
 */
export function trainerList(trainers: readonly Trainer[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonicalUrl("/personal-training/trainers")}#roster`,
    name: `Personal trainers at ${CLUB.name}`,
    numberOfItems: trainers.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement: trainers.map((trainer, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Person",
        "@id": trainerId(trainer.slug),
        name: trainer.name,
        jobTitle: trainer.jobTitles ? [...trainer.jobTitles] : "Personal Trainer",
        worksFor: { "@id": ORG_ID },
        knowsAbout: [...trainer.specialties],
        description: trainer.worksBestWith,
        ...(trainer.profile
          ? { url: canonicalUrl(`/personal-training/trainers/${trainer.slug}`) }
          : {}),
      },
    })),
  };
}
