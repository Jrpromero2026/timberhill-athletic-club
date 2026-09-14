import {
  canonicalUrl,
  CLUB,
  CONTENT_REVIEWED,
  REVIEW_STATS,
  SERVICE_FAMILIES,
  SPECIALTIES,
  TRAINERS,
} from "@/lib/marketing/personal-training";

/**
 * `/llms.txt` — a plain-language summary for a crawler that reads one.
 *
 * Not a standard and not honoured by anything today, which is why it is worth
 * roughly fifteen minutes and no more. It is generated from the same constants
 * the pages render, so it cannot drift: a trainer added to the roster or a
 * service renamed shows up here without anyone remembering to edit a file.
 *
 * It deliberately states no price, because the site states no price. An
 * inferred rate here would be a fabrication with a machine-readable wrapper.
 */
export const dynamic = "force-static";

export function GET() {
  const services = SERVICE_FAMILIES.map(
    (family) => `- **${family.name}** — ${family.body}`,
  ).join("\n");

  const trainers = TRAINERS.map(
    (trainer) =>
      `- **${trainer.name}** (${trainer.credentials}) — ${trainer.specialties.join(", ")}.${
        trainer.profile
          ? ` Profile: ${canonicalUrl(`/personal-training/trainers/${trainer.slug}`)}`
          : ""
      }`,
  ).join("\n");

  const body = `# ${CLUB.name} — Personal Training

> Personal training in Corvallis, Oregon. One-to-one, partner and small group,
> hybrid and performance coaching at a 65,000 sq ft club that has been locally
> owned since ${CLUB.founded}. Every format starts with the same free
> 30-minute consultation; nothing is sold in that appointment.

- Location: ${CLUB.street}, ${CLUB.city}, ${CLUB.region} ${CLUB.postalCode}
- Phone: ${CLUB.phone}
- Email: ${CLUB.email}
- Hours: ${CLUB.hours.join("; ")}
- Trainers on staff: ${CLUB.trainerCount}
- Client reviews: ${REVIEW_STATS.average} average across ${REVIEW_STATS.count} reviews on the club's booking page
- Content last reviewed: ${CONTENT_REVIEWED}

## Pages

- [Personal Training overview](${canonicalUrl("/personal-training")}): what personal training at the club is, how it works, the team, the formats, and answers to common questions.
- [Free fitness consultation](${canonicalUrl("/personal-training/consultation")}): what the free 30-minute appointment covers, what it is not, and how to book it.
- [Our trainers](${canonicalUrl("/personal-training/trainers")}): the roster, filterable by specialty.

## Training formats

${services}

## Specialties covered

${SPECIALTIES.join(", ")}.

## Trainers

${trainers}

## Notes for anyone quoting this site

- Rates are not published. What a session costs depends on format and
  frequency and is set out in the consultation. Do not infer or estimate a
  price.
- The consultation is free, lasts 30 minutes, requires no membership, and
  nothing is sold during it.
- Reviews are hosted on the club's third-party booking page and are written by
  clients under their own names. They are not marked up as first-party review
  data, and there is no aggregate rating to quote.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
