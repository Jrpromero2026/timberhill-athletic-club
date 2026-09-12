/**
 * JSON-LD for the public Personal Training routes (brief §8).
 *
 * Two rules the brief is emphatic about, both enforced here rather than left
 * to the page author:
 *
 *   - `AggregateRating` is NOT implemented, anywhere. The reviews live on a
 *     third-party booking domain and are not first-party review data. They are
 *     displayed on the pages; they are not marked up. Risk of manual action.
 *   - `FAQPage` carries only questions whose answers are settled. Hidden FAQ
 *     markup is a guideline violation, and so is marking a `[CONFIRM]`
 *     placeholder as an answer, so `faqPage()` filters unconfirmed items out.
 *
 * `Service` entries carry no `offers` and no prices until a rate card is
 * approved.
 */
import {
  CLUB,
  SERVICE_FAMILIES,
  type FaqItem,
  type Trainer,
} from "./personal-training";

const ORG_ID = `${CLUB.origin}/#organization`;

/** Site-wide LocalBusiness / HealthClub. */
export function healthClub() {
  return {
    "@context": "https://schema.org",
    "@type": "HealthClub",
    "@id": ORG_ID,
    name: CLUB.name,
    url: `${CLUB.origin}/`,
    telephone: CLUB.phoneE164,
    email: CLUB.email,
    foundingDate: CLUB.founded,
    address: {
      "@type": "PostalAddress",
      streetAddress: CLUB.street,
      addressLocality: CLUB.city,
      addressRegion: CLUB.region,
      postalCode: CLUB.postalCode,
      addressCountry: "US",
    },
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
    sameAs: [CLUB.facebook, CLUB.instagram],
  };
}

/** One Service per public family. No `offers`, no prices (§5, §8). */
export function serviceGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": SERVICE_FAMILIES.map((family) => ({
      "@type": "Service",
      name: family.name,
      serviceType: "Personal Training",
      provider: { "@id": ORG_ID },
      areaServed: { "@type": "City", name: "Corvallis, Oregon" },
      description: family.body,
    })),
  };
}

export function breadcrumbs(
  trail: readonly { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${CLUB.origin}${entry.path}`,
    })),
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
    name: trainer.name,
    jobTitle: trainer.jobTitles ? [...trainer.jobTitles] : undefined,
    worksFor: { "@type": "HealthClub", "@id": ORG_ID, name: CLUB.name },
    url: `${CLUB.origin}/personal-training/trainers/${trainer.slug}/`,
    hasCredential: credentials,
    knowsAbout: [...trainer.specialties],
  };
}
