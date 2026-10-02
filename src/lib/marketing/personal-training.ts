/**
 * Personal Training marketing content — the single source of truth for the
 * public `/personal-training/*` routes.
 *
 * Everything here traces to `docs/TAC_PT_WEBSITE_BUILD_BRIEF.md`; the § numbers
 * in the comments are its sections. Three rules from that brief are enforced
 * by the shape of this file rather than by review:
 *
 *   1. The primary CTA string is a single exported constant, so the six
 *      placements cannot drift apart (§2).
 *   2. Specialties are a closed union derived from SPECIALTIES, so a typo
 *      fails typecheck instead of silently breaking the roster filter (§6).
 *   3. A testimonial carries either verbatim `quote` text or `pending: true`.
 *      There is no way to express an invented one (§7).
 *
 * Nothing in here imports from the Performance Operations application, and the
 * application does not import from here.
 */

/* ── constants ─────────────────────────────────────────────────────────── */

/**
 * §1. These URLs embed Setmore product and staff IDs. If a service is rebuilt
 * in Setmore the ID changes and every CTA breaks silently — so they are
 * defined once, here, and nowhere else.
 *
 * `consultation` is the primary call to action everywhere. `freeTrial` is the
 * free 45-minute session, offered as a second action on the profile of any
 * trainer who takes them — it opens the staff picker rather than a calendar,
 * because it carries no `staff` parameter. `performanceLab` is recorded so the
 * ID is not lost and is deliberately not linked from any page: sending a
 * prospect to a specific service asks them to diagnose which product they
 * need, which is the job the consultation exists to do.
 *
 * `consultation` is a DEEP LINK, not the booking menu. `step=time-slot` with a
 * product and a pre-selected staff member should land the visitor straight on
 * the calendar for the Personal Training consultation, with nothing to choose
 * first. If either GUID stops resolving — the service rebuilt, or that trainer
 * unassigned from it — Setmore does not error. It falls back to the full
 * service menu, which is indistinguishable from the link having been wrong all
 * along, and puts every unrelated service back in front of the prospect. If
 * anyone reports landing on a list of services, check these two IDs first.
 */
export const SETMORE = {
  consultation:
    "https://timberhill-personal-training.setmore.com/book?step=time-slot&products=8aff2d32-3927-4531-a6ba-f12c9e5ab214&type=service&staff=91f71610-48fd-4e00-bd4e-2017f4f4a65b&staffSelected=true",
  freeTrial:
    "https://timberhill-personal-training.setmore.com/book?step=staff&products=470be690-c1b9-4664-80da-0502ed6e8565&type=service",
  performanceLab:
    "https://timberhill-personal-training.setmore.com/book?step=time-slot&products=5a6177c8-a52d-4389-a527-37529c61b6ac&type=class&staff=a40500bff96f74d68968fdebe47af4658&staffSelected=true",
  reviews:
    "https://timberhill-personal-training.setmore.com/reviews?sortBy=highestRated",
} as const;

/** §2. Exact, no variants. Not "Get Started", not "Book Now", not
 *  "Free Consult" — recognition is the mechanism. */
export const PRIMARY_CTA = "BOOK A COMPLIMENTARY CONSULTATION";

/**
 * The sticky mobile bar, and only the sticky mobile bar.
 *
 * The full string is 33 characters and wraps to two lines inside a phone-width
 * bar, which makes the one persistent control on the page look broken. This is
 * the same action with the same destination, shortened to fit. It is the ONLY
 * sanctioned variant — every other placement uses PRIMARY_CTA verbatim.
 */
export const STICKY_CTA = "BOOK A CONSULTATION";

/**
 * Where these pages are actually published — the host that owns them in the
 * index.
 *
 * This is deliberately NOT `CLUB.origin`. Two different facts were conflated
 * before: the club's website (timberhillac.com, which the navigation and the
 * wider site links point at) and the host serving the Personal Training
 * routes. Canonicals, the sitemap and the OpenGraph URLs describe the second;
 * everything about the club as a business describes the first.
 *
 * Pointing a custom domain at this deployment is one environment variable —
 * set `NEXT_PUBLIC_SITE_ORIGIN` and every canonical, sitemap entry, schema
 * `@id` and share URL follows. No trailing slash.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  "https://timberhill-athletic-club.vercel.app"
).replace(/\/$/, "");

/**
 * Canonical path shape: NO trailing slash, because that is what this
 * deployment actually serves.
 *
 * `trailingSlash` is at its Next default, so `/personal-training/` answers 308
 * and `/personal-training` answers 200. A canonical has to name the URL that
 * returns the page, not one that redirects to it — a canonical pointing at a
 * redirect is a contradictory signal, and a sitemap full of them is reported
 * as "Page with redirect" and indexed from nothing.
 *
 * The trailing-slash shape this used to produce was inherited from the build
 * brief, where it was correct: the canonical host was WordPress, and trailing
 * slashes are the WordPress convention. It stopped being correct the moment
 * this deployment became the published home, and nothing caught it, because
 * the test compared the rendered canonical against this same helper rather
 * than against what the server does with it. It now fetches them.
 */
export function canonicalPath(path: string): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, "")}`;
  return clean;
}

export function canonicalUrl(path: string): string {
  return `${SITE_ORIGIN}${canonicalPath(path)}`;
}

/**
 * The share card, and the organization's `image`/`logo`.
 *
 * Generated by `(marketing)/personal-training/og/route.tsx` at a fixed path,
 * so this constant is the one place the URL is written.
 */
export const OG_IMAGE = `${SITE_ORIGIN}/personal-training/og`;

/**
 * The OpenGraph image block, for spreading into a page's `openGraph`.
 *
 * Next REPLACES a parent layout's `openGraph` object when a page declares its
 * own rather than merging the two, so declaring the card once in the layout
 * silently lost it on all four pages. Every page spreads this in.
 */
export const OG_IMAGE_META = [
  {
    url: OG_IMAGE,
    width: 1200,
    height: 630,
    alt: "Personal Training at Timberhill Athletic Club in Corvallis, Oregon",
  },
] as const;

/**
 * Last substantive review of the public copy (§12 freshness).
 *
 * Answer engines weigh recency when choosing between competing sources, and
 * nothing on these pages said when they were written. Update this when the
 * copy changes — not on every deploy, which would be a lie.
 */
export const CONTENT_REVIEWED = "2026-09-14";

/** §14. Verified reference data. */
export const CLUB = {
  name: "Timberhill Athletic Club",
  canonical: "https://timberhillac.com/personal-training/",
  origin: "https://timberhillac.com",
  street: "2855 Northwest 29th Street",
  city: "Corvallis",
  region: "OR",
  postalCode: "97330",
  /** Surveyed by the PT Director from the club's own pin, 15 Sep 2026. These
   *  were deliberately absent until then: a local-business record with the
   *  wrong latitude puts the club on somebody else's street in a map pack,
   *  and it is the kind of error nobody notices for a year. */
  latitude: 44.5951,
  longitude: -123.2938,
  phone: "541-757-8559",
  phoneHref: "tel:5417578559",
  phoneE164: "+1-541-757-8559",
  email: "jr@timberhillsports.com",
  founded: "1980",
  squareFeet: "65,000",
  /**
   * Staff count: the ten in TRAINERS plus the one in ROSTER_PENDING.
   *
   * Confirmed 2026-09-29. It was twelve, built from a roster that carried two
   * people who have since left; adding Tais Vega and removing them lands on
   * eleven.
   *
   * `trainerCountWord` exists because this number appears in running copy as a
   * word and in the stat band as a digit. It was written out in five places in
   * three spellings, so when the count changed every one of them went stale
   * independently. Interpolate these two; do not type the number.
   */
  trainerCount: 11,
  trainerCountWord: "eleven",
  facebook: "https://www.facebook.com/TimberhillAthleticClub",
  instagram: "https://www.instagram.com/timberhill_ac",
  /** Website hours. Setmore advertises Mon–Fri 5 AM–9 PM; §14 flags the
   *  discrepancy as unreconciled. These are the website's. */
  hours: ["Mon–Fri 5:00 AM–10:00 PM", "Sat–Sun 7:00 AM–7:00 PM"],
} as const;

/** §7. Read from the live Setmore figure or review monthly — do not let a
 *  hard-coded number go stale. One definition so the audit is one edit. */
/**
 * Verified against the live Setmore page 2026-09-29.
 *
 * The true mean is 4.99 — 159 five-star and one four-star. Setmore itself
 * displays 5.0, and that is the figure quoted here, so the site and the page
 * a visitor clicks through to agree. `fiveStar` over `count` is the honest
 * version of the same claim and is what the differentiator strip shows.
 *
 * §7 says to read this from the live figure or review it monthly rather than
 * hard-code a number that goes stale. It is hard-coded; this date is the
 * review.
 */
export const REVIEW_STATS = {
  average: "5.0",
  count: 160,
  fiveStar: 159,
  verifiedOn: "2026-09-29",
} as const;

/* ── specialties ───────────────────────────────────────────────────────── */

/** §6. Fixed vocabulary. Free text breaks the index filter, so the type
 *  system closes the set. */
export const SPECIALTIES = [
  "Strength",
  "Muscle Building",
  "Fat Loss",
  "Beginners",
  "Returning to Fitness",
  "Healthy Aging",
  "Injury and Rehabilitation",
  "Pre and Postnatal",
  "Athletic Performance",
  "Youth Athletes",
  "Endurance and Events",
  "Nutrition Coaching",
  "Martial Arts and Combat Sports",
  "Corrective Exercise",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

/* ── trainers ──────────────────────────────────────────────────────────── */

export type Trainer = {
  slug: string;
  name: string;
  credentials: string;
  specialties: readonly Specialty[];
  /** One sentence, second person. */
  worksBestWith: string;
  /** §6: 2–3 sentences, hard limit. Existing copy trimmed, not rewritten.
   *  The full biography belongs on the profile page. */
  philosophy: string;
  /** §6: show a badge when true, show *nothing* when false — never a
   *  "full" state. */
  acceptingClients: boolean;
  /** Headshot, 3:4, ≥800×1066, release signed and filed. Null until the
   *  Drive files are renamed to trainer names — nobody should guess who is
   *  who on a public roster. */
  photo: string | null;
  /** Long-form biography blocks. Present only where a Phase 3 profile page
   *  exists; the roster links to a profile only when this is set. */
  profile?: readonly { heading: string; body: string }[];
  /** Job title, for the profile page and its Person schema. */
  jobTitles?: readonly string[];
  /**
   * Whether this trainer takes free 45-minute training sessions.
   *
   * The consultation is the front door and stays the primary call to action on
   * every page including this one. This is the second door, for a visitor who
   * has read a profile and already decided. JR Romero does not have one —
   * consultations are his.
   */
  offersFreeSession?: boolean;
  /**
   * This trainer's OWN Setmore link, landing on their calendar.
   *
   * Absent for everyone today. The only free-session link that exists is
   * `SETMORE.freeTrial`, which carries no `staff` parameter and opens the
   * staff picker, so a visitor chooses their trainer there — including one
   * they have just finished reading about. `offersFreeSession` alone falls
   * back to that link and the page says so rather than promising a direct
   * booking it cannot deliver.
   *
   * Set this and the copy changes to name the trainer. Each URL carries that
   * trainer's own Setmore staff id and must be copied from a real booking for
   * that person — building one by editing somebody else's puts the session on
   * the wrong calendar.
   */
  freeSession?: string;
  /**
   * Degrees and certifications, most significant first, for the list under
   * the profile photograph.
   *
   * Structured rather than one pre-joined string: the post-nominal is what a
   * reader scans for, and it can only be set apart from the award if the two
   * are separate fields. Splitting a joined string on " · " and guessing which
   * trailing parenthesis is an abbreviation works until a credential contains
   * a bracket for any other reason.
   */
  certifications?: readonly { award: string; issuer?: string; abbr?: string }[];
};

export const TRAINERS: readonly Trainer[] = [
  {
    slug: "jr-romero",
    name: "JR Romero",
    credentials: "CSCS · Head Trainer · B.S. Exercise and Sport Science, OSU",
    specialties: [
      "Fat Loss",
      "Muscle Building",
      "Strength",
      "Nutrition Coaching",
      "Athletic Performance",
    ],
    worksBestWith:
      "You want a structured, measurable plan for body composition, muscle and strength — and you want the standard held.",
    philosophy:
      "His coaching philosophy is rooted in biomechanics, exercise science, behavior change, and progressive overload. He believes lasting success is built through consistency, accountability, and a commitment to continual improvement. The Standard is the product.",
    acceptingClients: true,
    photo: null,
    // Unresolved Phase 2 gate: the Drive bio heading says Head Trainer, the
    // body says Director of Training. Both are carried until one is picked.
    jobTitles: ["Head Trainer", "Director of Training"],
    // Split out of the former "Credentials" prose block. Same nine, same
    // order, same wording — only the joining changed.
    certifications: [
      {
        award: "B.S. Exercise and Sport Science",
        issuer: "Oregon State University",
      },
      { award: "Certified Strength and Conditioning Specialist", abbr: "CSCS" },
      { award: "Certified Personal Trainer", abbr: "NSCA-CPT" },
      { award: "Performance Enhancement Specialist", abbr: "NASM-PES" },
      { award: "Physique & Bodybuilding Coach", abbr: "NASM-PBC" },
      { award: "Precision Nutrition Level 1 Coach", abbr: "Pn1" },
      { award: "Certified Speed & Agility Coach", abbr: "CSAC-NSPA" },
      { award: "Kinetic Integration Exercise Professional", abbr: "KIEP" },
      { award: "CrossFit Level 1 Trainer", abbr: "CF-L1" },
    ],
    profile: [
      {
        heading: "Approach",
        body: "JR Romero serves as the Director of Training at Timberhill Athletic Club and Director of Performance at G3 Performance. With more than 15,000 hours of hands-on coaching experience, he has spent over a decade helping clients build stronger bodies, improve their health, enhance performance, and achieve lasting physical transformation. His coaching philosophy is rooted in biomechanics, exercise science, behavior change, and progressive overload. He believes lasting success is built through consistency, accountability, and a commitment to continual improvement. The Standard is the product.",
      },
      {
        heading: "Who he works with",
        body: "JR's coaching experience spans a wide range of populations, from beginners starting their fitness journey to competitive athletes and high-performing professionals seeking to maximize their physical potential. His approach combines evidence-based training, practical nutrition coaching, and individualized programming to create measurable results and sustainable progress. He specializes in body recomposition, muscle hypertrophy, strength development, and performance enhancement.",
      },
      {
        heading: "Built For Her™",
        body: "JR is the creator of Built For Her™, a standards-based coaching system for women's physique and performance. The system integrates progressive strength training, nutrition strategy, recovery, and accountability to help women develop strength, build muscle, improve body composition, and achieve a higher standard of physical capability.",
      },

    ],
  },
  {
    slug: "jess-caze",
    offersFreeSession: true,
    name: "Jess Caze",
    credentials: "CSCS · B.S. Exercise & Sports Science",
    specialties: [
      "Corrective Exercise",
      "Athletic Performance",
      "Strength",
      "Healthy Aging",
    ],
    worksBestWith:
      "You want to move well and keep doing the things you love, with the mechanics fixed rather than worked around.",
    philosophy:
      "Jess is passionate about helping clients build confidence, stay active, and maintain the physical capabilities needed to enjoy the activities that matter most to them. She focuses on creating sustainable habits and meaningful results that last.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Strength and Conditioning Specialist", abbr: "CSCS" },
      { award: "B.S. Exercise & Sports Science" },
    ],
    // The trainer's own words, from the roster card. No long-form
    // biography exists for them; none has been written here.
    profile: [
      { heading: "Approach", body: "Jess is passionate about helping clients build confidence, stay active, and maintain the physical capabilities needed to enjoy the activities that matter most to them. She focuses on creating sustainable habits and meaningful results that last." },
    ],
  },
  {
    slug: "mason-morgan",
    offersFreeSession: true,
    name: "Mason Morgan",
    credentials: "CSCS · Kinesiology, Oregon State University",
    specialties: [
      "Athletic Performance",
      "Youth Athletes",
      "Strength",
      "Beginners",
    ],
    worksBestWith:
      "You are an athlete, or a parent of one, and want training that transfers to the sport.",
    philosophy:
      "My goal as a coach is to inspire people to become more active and confident in their abilities, whether that means taking more daily walks, beginning a fitness journey, or striving for athletic excellence. I believe movement has the power to improve quality of life at every stage.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Strength and Conditioning Specialist", abbr: "CSCS" },
      { award: "Kinesiology", issuer: "Oregon State University" },
    ],
    // The trainer's own words, from the roster card. No long-form
    // biography exists for them; none has been written here.
    profile: [
      { heading: "Approach", body: "My goal as a coach is to inspire people to become more active and confident in their abilities, whether that means taking more daily walks, beginning a fitness journey, or striving for athletic excellence. I believe movement has the power to improve quality of life at every stage." },
    ],
  },
  {
    slug: "becca-reeve",
    offersFreeSession: true,
    name: "Becca Reeve",
    // A summary, not the full set — the same split JR's record uses, where the
    // line carries three and `certifications` carries nine. The three
    // post-nominals lead because they are compact; the awards written out in
    // full live in the list under her photograph.
    credentials:
      "CPT · MCS · WCS · Pregnancy and Postpartum Corrective Exercise Specialist · PN1 Nutrition Coach",
    specialties: [
      "Pre and Postnatal",
      "Corrective Exercise",
      "Nutrition Coaching",
      "Strength",
    ],
    worksBestWith:
      "You are a woman training through pregnancy, postpartum, or any stage where you want to feel functionally strong.",
    philosophy:
      "I work with women to improve general fitness and wellness and aim to empower them to feel functionally strong and confident in their bodies.",
    acceptingClients: true,
    photo: null,
    // Ordered so the women's-health credentials sit together, which is what
    // she is sought out for: the foundational certification, then pregnancy
    // and postpartum, menopause and women's coaching, then the rest.
    //
    // ISSA is named as the issuer only on the Glute Specialist, because that
    // is the only one she attributed. No issuing body is invented for the
    // others, and the two abbreviations are the ones she gave.
    certifications: [
      { award: "Certified Personal Trainer", abbr: "CPT" },
      { award: "Pregnancy and Postpartum Corrective Exercise Specialist" },
      { award: "Menopause Coaching Specialist", abbr: "MCS" },
      { award: "Women's Coaching Specialist", abbr: "WCS" },
      {
        award: "Glute Specialist",
        issuer: "International Sports Sciences Association",
      },
      { award: "Nutrition Coach", abbr: "PN1" },
    ],
    // Her own words, from the roster card. This is the whole biography on
    // file: there is no long-form bio for her the way there is for JR, and
    // none has been written here. The page stands on her credentials, her
    // specialties and three clients in her own clients' words.
    profile: [
      {
        heading: "Approach",
        body: "I work with women to improve general fitness and wellness and aim to empower them to feel functionally strong and confident in their bodies.",
      },
    ],
  },
  {
    slug: "josiah-iwamizu",
    offersFreeSession: true,
    name: "Josiah Iwamizu",
    credentials:
      "CPT · Specialist in Strength and Conditioning · Corrective Exercise Specialist · Certified Nutrition Coach · Brown belts in judo and jiu-jitsu",
    specialties: [
      "Martial Arts and Combat Sports",
      "Athletic Performance",
      "Strength",
      "Youth Athletes",
    ],
    worksBestWith:
      "You come from combat sports, or you want conditioning built by someone who has competed at that level.",
    philosophy:
      "With nearly two decades immersed in the world of sports and fitness, I bring a deep passion and wealth of experience to every training session. I've coached a wide range of clients — from kids just starting out to adults chasing personal bests — so I know how to adapt and motivate at every level.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Personal Trainer", abbr: "CPT" },
      // From the certificate itself, issued 2026-09-12 and valid to
      // 2026-09-12 + 2 years. The issuing body is read off the artwork, not
      // off the filename. No post-nominal is recorded: the certificate states
      // none, and inventing one would put letters after his name that no
      // issuer awarded. The certificate number is deliberately absent — it
      // identifies him personally and belongs nowhere on a public page.
      {
        award: "Specialist in Strength and Conditioning",
        issuer: "International Sports Sciences Association",
      },
      { award: "Corrective Exercise Specialist" },
      { award: "Certified Nutrition Coach" },
      { award: "Brown belts in judo and jiu-jitsu" },
    ],
    // His full biography, in his own words, supplied by the PT Director.
    // One paragraph per block: a block renders as a single <p>, so two
    // paragraphs in one body would run together.
    profile: [
      {
        heading: "Background",
        body: "With nearly two decades immersed in the world of sports and fitness, I bring a deep passion and wealth of experience to every training session. My journey began on the basketball court and soccer field, but it was martial arts — specifically judo and jiu-jitsu — that truly shaped my path. Over the past 15 years, I've dedicated myself to mastering these disciplines, with 10 years spent competing professionally on national and international stages.",
      },
      {
        heading: "Approach",
        body: "While I never had the chance to play collegiate or professional team sports, martial arts opened the door for me to become a professional athlete — and now, I use that experience to help others push past their limits.",
      },
      {
        heading: "Who he works with",
        body: "Whether your goal is body recomposition, improving athletic performance, or dialing in your strength and conditioning, I've got you covered. I've coached a wide range of clients — from kids just starting out to adults chasing personal bests — so I know how to adapt and motivate at every level. Let's train and unlock your full potential!",
      },
    ],
  },
  {
    slug: "conner-mcadams",
    offersFreeSession: true,
    name: "Conner McAdams",
    credentials: "CPT-ACE",
    specialties: [
      "Strength",
      "Healthy Aging",
      "Corrective Exercise",
      "Beginners",
    ],
    worksBestWith:
      "You want clear standards and a roadmap, whether you are starting out or already performing.",
    philosophy:
      "His philosophy is simple: meet people exactly where they are, then guide them — methodically and relentlessly — toward where they want to be. Every client shares a common goal of self-improvement, and Conner excels at building the roadmap that turns that ambition into measurable progress.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Personal Trainer", abbr: "CPT-ACE" },
    ],
    // The trainer's own words, from the roster card. No long-form
    // biography exists for them; none has been written here.
    profile: [
      { heading: "Approach", body: "His philosophy is simple: meet people exactly where they are, then guide them — methodically and relentlessly — toward where they want to be. Every client shares a common goal of self-improvement, and Conner excels at building the roadmap that turns that ambition into measurable progress." },
    ],
  },
  {
    slug: "emma-ciechanowski",
    offersFreeSession: true,
    name: "Emma Ciechanowski",
    credentials: "ACSM-CPT · H.B.S. Kinesiology, Oregon State University",
    specialties: [
      "Beginners",
      "Healthy Aging",
      "Strength",
      "Returning to Fitness",
    ],
    worksBestWith:
      "You are starting from the beginning, or returning after time away, and want a program built to your real life. Spanish-speaking training available.",
    philosophy:
      "As a personal trainer, my goal is to help clients build sustainable habits, gain confidence, and achieve meaningful results that improve their everyday lives. My coaching philosophy focuses on creating realistic, personalized programs that support long-term success both inside and outside the gym.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Personal Trainer", abbr: "ACSM-CPT" },
      { award: "H.B.S. Kinesiology", issuer: "Oregon State University" },
    ],
    // The trainer's own words, from the roster card. No long-form
    // biography exists for them; none has been written here.
    profile: [
      { heading: "Approach", body: "As a personal trainer, my goal is to help clients build sustainable habits, gain confidence, and achieve meaningful results that improve their everyday lives. My coaching philosophy focuses on creating realistic, personalized programs that support long-term success both inside and outside the gym." },
    ],
  },
  {
    slug: "devin-shelfer",
    offersFreeSession: true,
    name: "Devin Shelfer",
    credentials: "NASM-CPT",
    specialties: ["Beginners", "Strength", "Returning to Fitness"],
    worksBestWith:
      "You are new to lifting and want someone patient while you learn what your body can do.",
    philosophy:
      "The world of physical fitness has always been an interest of mine. What started as an interest has slowly turned into an obsession as I've delved deeper into learning the human body. Beginning the journey is always an excitingly scary process but every step taken is matched with realizations on just how powerful both your mind and body can be.",
    acceptingClients: true,
    photo: null,
    certifications: [
      { award: "Certified Personal Trainer", abbr: "NASM-CPT" },
    ],
    // The trainer's own words, from the roster card. No long-form
    // biography exists for them; none has been written here.
    profile: [
      { heading: "Approach", body: "The world of physical fitness has always been an interest of mine. What started as an interest has slowly turned into an obsession as I've delved deeper into learning the human body. Beginning the journey is always an excitingly scary process but every step taken is matched with realizations on just how powerful both your mind and body can be." },
    ],
  },
  {
    slug: "tais-vega",
    offersFreeSession: true,
    name: "Tais Vega",
    // The headline and the page title are built from the first segment of
    // this line, so it holds her role and nothing else: the degree was in her
    // name ("Tais Vega, B.S. Health and Exercise Science") and the PT Director
    // asked for it out. It is not lost — it is in `certifications` below,
    // under her photograph, where the other trainers' degrees sit.
    credentials: "Exercise Physiologist",
    // All four are named in her biography: progress after physical therapy,
    // returning to exercise, athletic performance, and building strength.
    specialties: [
      "Injury and Rehabilitation",
      "Returning to Fitness",
      "Athletic Performance",
      "Strength",
    ],
    worksBestWith:
      "You are continuing your progress after physical therapy, returning to exercise, improving athletic performance, or working toward a healthier lifestyle.",
    // Third person, unlike every other philosophy here. Her biography was
    // supplied written about her rather than by her, and rewriting it into
    // first person would be inventing a quotation.
    philosophy:
      "Tais brings the discipline, teamwork, and performance-focused mindset of a competitive athlete to every client interaction. Her education and athletic background have given her a strong understanding of human movement, exercise programming, and the physical demands required to achieve individual health and performance goals.",
    // Not stated when her biography was supplied. False shows no badge and
    // makes no claim either way, which is the honest default; flip it to true
    // once confirmed.
    acceptingClients: false,
    photo: null,
    // The degree is the one credential on record. "Exercise Physiologist" is
    // a role rather than a credential with an issuing body, so it stays in
    // the credentials line and the prose rather than appearing here.
    certifications: [
      {
        award: "B.S. Health and Exercise Science, cum laude",
        issuer: "Southern Oregon University",
      },
    ],
    profile: [
      {
        heading: "Background",
        body: "Tais Vega is an exercise physiologist and a cum laude graduate of Southern Oregon University, where she earned her bachelor's degree in Health and Exercise Science. An accomplished collegiate athlete, Tais competed in volleyball at the national level and helped her team earn third place at the NAIA National Volleyball Tournament.",
      },
      {
        heading: "Approach",
        body: "Tais brings the discipline, teamwork, and performance-focused mindset of a competitive athlete to every client interaction. Her education and athletic background have given her a strong understanding of human movement, exercise programming, and the physical demands required to achieve individual health and performance goals.",
      },
      {
        heading: "Who she works with",
        body: "Whether you are continuing your progress after physical therapy, returning to exercise, improving athletic performance, or working toward a healthier lifestyle, Tais provides knowledgeable, personalized guidance to help you build strength, improve mobility, and enhance your overall wellness.",
      },
    ],
  },
  {
    slug: "amanda-knight",
    offersFreeSession: true,
    name: "Amanda Knight",
    credentials: "CPT \u00b7 Bodybuilding Specialist \u00b7 Nutrition Coach",
    // Her own list, mapped onto the closed vocabulary: active aging,
    // bodybuilding, weight loss, strength training and nutrition. "Women's
    // fitness" is the one thing she names that has no term in SPECIALTIES, so
    // it is carried by her biography rather than by the filter.
    specialties: [
      "Healthy Aging",
      "Muscle Building",
      "Fat Loss",
      "Strength",
      "Nutrition Coaching",
    ],
    worksBestWith:
      "You are a woman who wants to build strength \u2014 through menopause, through weight loss, or simply to feel better in your everyday life.",
    philosophy:
      "I believe success is built through encouragement, accountability, consistency, and a willingness to take ownership of your progress. My role is to provide the guidance, support, and expertise needed to help you move forward with confidence.",
    // Not stated when her biography was supplied. False shows no badge and
    // makes no claim either way; flip it to true once confirmed.
    acceptingClients: false,
    photo: null,
    // All three are ISSA, named as the issuer because she attributed them.
    //
    // Her Girls Gone Strong Menopause Coaching Specialist is deliberately
    // absent: she wrote "currently pursuing". `certifications` feeds
    // `hasCredential` in the Person schema, which is a claim to hold a
    // credential, and she does not hold this one yet. Her nine years in
    // medical dispatch are experience rather than a certification and are in
    // the biography, where they read as the story they are.
    certifications: [
      { award: "Certified Personal Trainer", issuer: "International Sports Sciences Association", abbr: "CPT" },
      { award: "Bodybuilding Specialist", issuer: "International Sports Sciences Association" },
      { award: "Nutrition Coach", issuer: "International Sports Sciences Association" },
    ],
    // Her biography as supplied, one paragraph per block. The professional
    // blocks come first and the personal ones after, which is the order she
    // wrote them in.
    profile: [
      { heading: "Approach", body: "Fitness has been a lifelong passion of mine, and I am dedicated to helping women become the strongest, healthiest, and most confident versions of themselves through every stage of life. My coaching focuses on active aging, women's fitness, nutrition, strength training, bodybuilding, weight loss, and sustainable lifestyle change." },
      { heading: "Background", body: "My journey into health and fitness is backed by both professional experience and personal commitment. Before moving to the United States, I spent nine years working as a medical dispatcher in Western Australia, developing a strong foundation in anatomy, physiology, and emergency care. My passion for understanding the human body eventually led me to competitive fitness, where I experienced firsthand the discipline, resilience, and confidence that come from pursuing challenging goals." },
      { heading: "How she coaches", body: "Today, I combine science-based training with practical, personalized coaching to help my clients achieve results that fit their bodies, lifestyles, and long-term goals. I believe success is built through encouragement, accountability, consistency, and a willingness to take ownership of your progress. My role is to provide the guidance, support, and expertise needed to help you move forward with confidence." },
      { heading: "Who she works with", body: "One of the most rewarding parts of coaching is watching clients discover strength they never knew they had and accomplish goals they once thought were out of reach. Whether your goal is to build muscle, lose weight, improve mobility, navigate menopause, or simply feel better in your everyday life, I am committed to helping you succeed." },
      { heading: "Away from the gym", body: "Outside of coaching, I enjoy spending time outdoors and staying active in ways that bring balance to my life. Horse riding has been a longtime passion of mine, and I love exploring local trails on foot whenever I can. In the summer months you will often find me at the ballpark as the on-field Public Address Announcer for the Corvallis Knights baseball team." },
      { heading: "Family", body: "Family is also at the center of my life. I am happily married and part of a large blended family that includes four children and a growing number of grandchildren. Although I now live in the United States, my roots remain firmly connected to Australia, and I regularly travel home to stay connected with family and friends." },
      { heading: "Favourite exercise", body: "The Deficit Sumo Goblet Squat is one of my favourite exercises because it targets the glutes, inner thighs, and quads while allowing for a greater range of motion. I love the challenge and the way it engages the lower body from start to finish." },
    ],
  },
];

/** §6 roster status. Not rendered as trainers — recorded so the gap is
 *  visible in code review rather than only in a document. */
/**
 * On staff, but not on the public roster: no bio, no credentials, no
 * specialties, and a profile cannot be written from a name. Confirmed with the
 * PT Director 2026-09-29.
 *
 * Kyra Schulties and Jayna Davis were here and have left the club. Steve
 * Sackmann was marked "off roster" on the assumption that a missing bio meant
 * a departure; he is on staff, and it was the bio that was missing, not him.
 */
export const ROSTER_PENDING = [
  { name: "Steve Sackmann", status: "On staff", blockedOn: "Bio, credentials, specialties." },
] as const;

export function trainerBySlug(slug: string): Trainer | undefined {
  return TRAINERS.find((trainer) => trainer.slug === slug);
}

/* ── hub sections ──────────────────────────────────────────────────────── */

/** §4 section 03. Thirteen situation cards, before any service is named. */
export const RECOGNITION = [
  "You have not trained in years and the gym floor feels like someone else's territory.",
  "You train regularly and nothing has changed in six months.",
  "You are coming back from an injury and are not sure what is safe.",
  "You have an event with a date on it and a distance you have never covered.",
  "You are in your sixties or seventies and want to stay independent.",
  "You are pregnant or postpartum and need a program built for that, not adjusted for it.",
  "Your teenager wants to lift and you want it taught properly the first time.",
  "Your doctor told you to exercise without telling you which exercise.",
  "You are in season and cannot afford to break down before it ends.",
  "You take the classes and want something built around you instead.",
  "You know what to do. You just do not do it unless someone is expecting you.",
  "You have lost weight before and would like it to be the last time.",
] as const;

/**
 * §4 section 04.
 *
 * Structured on the value equation: worth rises with the outcome you want and
 * your odds of reaching it, and falls with how long it takes and how much it
 * costs you to do. Four pillars, one per term, laid out 2×2 — the top row is
 * what multiplies, the bottom row is what divides.
 *
 * The method itself (assess, plan, coach, progress, adapt, measure) is not
 * lost: it is section 05, "How does personal training work here?", where it
 * belongs. Stating it twice made section 04 answer a question nobody asked.
 */
export const PILLARS = [
  {
    key: "THE GOAL",
    body: "A clear destination, in your words and written down. Not \u201cget in shape\u201d \u2014 a target with an edge on it, so there is something to aim at and a way to know you reached it.",
  },
  {
    key: "THE ODDS",
    body: `A qualified coach, a structured plan and a professional environment all raise the odds that this works. ${CLUB.trainerCountWord.replace(/^./, (c) => c.toUpperCase())} certified trainers, and progress measured rather than guessed at.`,
  },
  {
    key: "THE TIMELINE",
    body: "The consultation and the trainer match get you started without a long runway. No onboarding course, no getting fit enough first \u2014 the first session can follow in the same week.",
  },
  {
    key: "THE EFFORT",
    body: "You do not design the program, troubleshoot it, decide when to progress, or rethink it every few weeks. That is the trainer\u2019s job. Yours is to turn up on the days you said you would.",
  },
] as const;

/**
 * §4 section 05a. The five stages of the Timberhill Personal Training System.
 *
 * This is the method, stated once. STEPS below is the client's journey through
 * it — what happens to you, in order, from booking to training. The two are
 * deliberately different: a prospect needs to know both that there is a system
 * and what their own first month looks like, and collapsing them into one list
 * loses whichever half it drops.
 *
 * Kept to a single short line each. This renders as a five-across rail, and a
 * paragraph in that space reads as noise rather than method.
 */
export const PT_SYSTEM = [
  { key: "ASSESS", body: "Movement, history, schedule and the goal in your words." },
  { key: "PLAN", body: "A written program built for that assessment, not a template." },
  { key: "COACH", body: "Sessions on the floor with someone watching every rep." },
  { key: "MEASURE", body: "Progress recorded and reviewed on a set cadence." },
  { key: "PROGRESS", body: "Load and difficulty advance as the measurements allow." },
] as const;

/**
 * Truthful availability. Trainer schedules genuinely do vary by time of day,
 * and new-client openings genuinely move week to week \u2014 so this says exactly
 * that and no more. It is not a countdown, a seat count or a deadline, and it
 * must never become one.
 */
export const AVAILABILITY_NOTE =
  "Trainer schedules and new-client openings change through the week. The consultation is where you find out what is actually open.";

/** §4 section 05b. */
export const STEPS = [
  {
    title: "Book a complimentary consultation",
    body: "Thirty minutes, free, no commitment. Pick a time that works — the booking page opens straight on available slots.",
  },
  {
    title: "Talk it through",
    body: "Goals, history, schedule, injuries, and what has and has not worked for you before. Mostly we listen.",
  },
  {
    title: "We match you to a trainer",
    body: "You do not have to choose one from a page of photographs. We put you with the trainer whose specialty fits what you described.",
  },
  {
    title: "First session",
    body: "An assessment and the first version of your program, so you leave knowing exactly what you are doing next week.",
  },
  {
    title: "Train, review, adjust",
    body: "Sessions at whatever frequency you agreed, with progress reviewed on a set cadence rather than whenever it comes up.",
  },
] as const;

/** §4 section 02. */
export const TRUST_POINTS = [
  { big: CLUB.founded, small: "Corvallis-owned and operating since" },
  { big: String(CLUB.trainerCount), small: "Trainers on staff" },
  {
    big: REVIEW_STATS.average,
    small: `Average across ${REVIEW_STATS.count} client reviews`,
  },
  { big: CLUB.squareFeet, small: "Square feet of floor, courts and pool" },
] as const;

/** §4 section 07. Four differentiators, each evidenced. */
export const DIFFERENTIATORS = [
  {
    title: "A department, not an amenity",
    body: `A director who owns the standard, ${CLUB.trainerCountWord} certified trainers, five program formats, and one consultation that decides which of them you need. Programming, progression and accountability are defined \u2014 not left to whoever is free. Personal training here is not something the front desk arranges on the side.`,
    evidence: `DIRECTOR-LED · ${CLUB.trainerCount} TRAINERS · 5 FORMATS`,
  },
  {
    title: "Corvallis-owned since 1980",
    body: "The club has been here for four decades under local ownership. The trainers coach members they see in the parking lot.",
    evidence: "FOUNDED 1980",
  },
  {
    title: "The reviews are public and they are ours",
    body: "Every review on our booking page is written by a client under their own name. We do not curate them.",
    evidence: `${REVIEW_STATS.average} AVERAGE · ${REVIEW_STATS.fiveStar} OF ${REVIEW_STATS.count} FIVE-STAR`,
  },
  {
    title: "Room to train properly",
    body: "Sixty-five thousand square feet means a squat rack when you need one and space to move without queueing.",
    evidence: "65,000 SQ FT",
  },
] as const;

/** §5. Five public families covering nine internal categories. "PACK
 *  Training" is retired entirely — the live name is Performance Lab. No
 *  prices, and no per-service booking link: every card ends in the
 *  consultation. */
export const SERVICE_FAMILIES = [
  {
    name: "One-to-One Coaching",
    body: "Your trainer, your hour, your program. The default for anyone who wants the plan built and coached around them alone.",
  },
  {
    name: "Partner and Small Group",
    body: "Two to a handful of people training the same program together. Coached, not a class.",
  },
  {
    name: "Hybrid Coaching",
    body: "Your program delivered through Everfit with regular check-ins, on its own or between in-person sessions.",
  },
  {
    name: "Performance Lab",
    body: "Small-group performance work on a set schedule for people who want to train hard in a room with others doing the same.",
  },
  {
    // Described, not named. The individual programs come and go, and a name
    // on a public page outlives the program behind it: a visitor who reads
    // one and asks for it by name months later has been told something that
    // is no longer true. The consultation is where what is currently open
    // gets named.
    name: "Seasonal and Focused Programs",
    body: "Time-boxed programs built around a single focus rather than running continuously. Each has its own start date and length, and what is open changes through the year.",
  },
] as const;

/** §4 section 10. Two columns on desktop, two labelled blocks on mobile. */
export const COMPARISON = [
  {
    label: "What it is",
    orientation: "A walkthrough of the equipment and how to use it safely.",
    training: "A coach who builds and runs a program for your goal.",
  },
  {
    label: "How long",
    orientation: "One appointment.",
    training: "For as long as you are working toward something.",
  },
  {
    label: "Cost",
    orientation: "Included with membership.",
    training: "Discussed in your consultation.",
  },
  {
    label: "Who it suits",
    orientation:
      "You know what you want to do and need to learn the machines.",
    training: "You want the plan made, coached and progressed for you.",
  },
  {
    label: "What you leave with",
    orientation: "Confidence on the floor.",
    training:
      "A written program, a schedule and someone accountable for it.",
  },
] as const;

/* ── FAQ ───────────────────────────────────────────────────────────────── */

export type FaqItem = {
  question: string;
  answer: string;
  /** True where the answer is still awaiting the PT Director. Such an item is
   *  neither rendered nor marked up: §8 keeps unsettled answers out of the
   *  FAQPage, and showing the visitor a placeholder where an answer belongs is
   *  worse than omitting the question. Supply the answer and clear this flag
   *  and the question returns to the page. */
  unconfirmed?: boolean;
};

/** §4 section 11. Twelve items, all collapsed; the unconfirmed ones are held
 *  back until their answers are settled. */
export const HUB_FAQS: readonly FaqItem[] = [
  {
    question: "Is the consultation really free?",
    answer:
      "Yes. It is completely free, it lasts thirty minutes, and you do not need to be a member to book one. There is no obligation. We will learn what you are working toward, identify the training structure that fits, and explain our recommendation clearly \u2014 then you decide whether you want to move forward.",
  },
  {
    question: "Do I have to be a member of the club?",
    answer:
      "No. You do not need to be a member of Timberhill Athletic Club to book a consultation or to train with one of our trainers. Personal training is open to members and non-members alike.",
  },
  {
    // §4 forbids naming a price above section 09 and §5 forbids publishing a
    // rate card at all until one is approved. This answers the query shape
    // without publishing a number: silence gave an answer engine nothing to
    // quote on the highest-intent question on the topic, and a competitor
    // answering it gets cited instead. Replace with a range the day one is
    // approved. NEEDS DIRECTOR SIGN-OFF.
    question: "How much does personal training cost?",
    answer:
      "What you pay depends on the format you choose and how often you train — one-to-one coaching, partner and small group, and hybrid coaching are priced differently, and frequency changes the figure again. Rates are set out in the free consultation, alongside the plan they would pay for, so you see the number and what it buys at the same time. Membership pricing is separate and lives on the Join page.",
  },
  {
    question: "Do I have to choose a trainer?",
    answer:
      "No. Tell us what you are working toward and we match you. If the match is wrong, we change it.",
  },
  {
    question: "What happens in the first session?",
    answer:
      "An assessment — movement, history, and where you are starting from — and the first version of your program.",
  },
  {
    question: "How often would I train?",
    answer:
      "Most people start at one or two sessions a week. The consultation is where that gets decided against your schedule, not a package.",
  },
  {
    question: "I have an injury. Can I still train?",
    answer:
      "Usually yes, and often that is the reason to. Bring any restrictions your provider has given you to the consultation.",
  },
  {
    question: "Can two of us train together?",
    answer: "Yes — Partner and Small Group Training is built for that.",
  },
  {
    question: "Can I be coached without coming into the club?",
    answer:
      "Yes. Hybrid Coaching runs your program through Everfit with check-ins, either on its own or between in-person sessions.",
  },
  {
    question: "What should I bring to the consultation?",
    answer:
      "Nothing, beyond the questions you want answered. The consultation is a conversation rather than a training session, so there is no need for kit or a change of clothes. If a doctor or physical therapist has given you restrictions, bring those \u2014 they shape the program from day one.",
  },
  {
    question: "What if I need to cancel or reschedule?",
    answer:
      `We ask for twenty-four hours' notice. Tell your trainer or call the club on ${CLUB.phone} at least a day before the session and we will move it to a time that works.`,
  },
  {
    question: "Do you offer nutrition support?",
    answer:
      "Yes. We offer nutrition coaching in more than one form, because what somebody needs varies — from guidance alongside training to something more structured. Several of our trainers hold nutrition certifications, and the consultation is where we work out which option fits you.",
  },
];

/**
 * The questions that are ready to be read.
 *
 * Applied in the page, not only in the accordion: `<Faq>` is a client
 * component, so whatever it is handed is serialised into the document whether
 * it renders or not. Filtering at the call site means the `[CONFIRM]` notes —
 * which are addressed to the PT Director, not to a visitor — never reach the
 * browser at all, rather than merely never being painted.
 */
export function settledFaqs(items: readonly FaqItem[]): readonly FaqItem[] {
  return items.filter((item) => !item.unconfirmed);
}

export const CONSULTATION_FAQS: readonly FaqItem[] = [
  {
    question: "Is it really free?",
    answer:
      "Yes, and there is no obligation. We will learn what you are working toward, identify the training structure that fits your needs, and explain our recommendation clearly. Whether you go ahead is your decision.",
  },
  {
    question: "Do I need to be a member?",
    answer:
      "No. The consultation is open to anyone, and so is training itself — you do not have to join the club first.",
  },
  {
    question: "Will I be asked to work out?",
    answer:
      "No. The thirty minutes is a conversation — nobody trains, nothing is measured, and you do not need to change or warm up. Come straight from work if that is easiest.",
  },
  {
    question: "What if I need to reschedule?",
    answer:
      `Twenty-four hours' notice is all we ask. Tell your trainer or call the club on ${CLUB.phone} and we will find another time.`,
  },
];

/* ── testimonials ──────────────────────────────────────────────────────── */

/**
 * §7. Verbatim only — light trimming for length is fine, rewriting is not.
 * Never fabricate or composite a testimonial: not for a placeholder, not for
 * a mockup, not "temporarily". A card either carries real `quote` text or
 * declares `pending`, and the type makes those the only two options.
 */
export type Testimonial =
  | { reviewer: string; trainer?: string; quote: string; pending?: never }
  | { reviewer: string; trainer?: string; quote?: never; pending: true };

/** From the Drive testimonials folder, trimmed for length only. */
export const FEATURED_TESTIMONIAL = {
  reviewer: "Jen",
  attribution: "training with JR Romero since May 2025",
  pull: "The accomplishment I'm most proud of is getting back to most of the sports and activities I enjoyed before my injury. I honestly wasn't sure that would be possible.",
  body: [
    "When I started training with JR at Timberhill Athletic Club, my primary goal was to continue the strength-building journey I had started in physical therapy after a complete proximal hamstring rupture. I spent a full year in physical therapy rebuilding basic function.",
    "Despite consistently getting stronger and seeing remarkable muscle growth, I never feel sore after workouts. JR's programming is thoughtfully structured and progressive in a way that challenges me without leaving me feeling beat up.",
    "To anyone considering personal training, I'd say it's never too late to start. Strength is one of the best investments you can make in your future.",
  ],
} as const;

/**
 * §7. Verbatim reviews from the club's own Setmore page, public under each
 * reviewer's own name. Pulled 2026-09-29 by the PT Director.
 *
 * The hub renders the FIRST THREE. They are ordered for three different
 * trainers and three different reasons somebody starts — coming back from an
 * injury, being unsure you can lift at all, and wanting a measurable result —
 * rather than three variations on "good trainer". To change what the page
 * shows, move a review into the first three; nothing else needs touching.
 *
 * Annie Todd's is the strongest review in this set and is deliberately not in
 * the three: at 180 words it would force every card in the row to its height.
 * It is the reason to write Becca Reeve a profile page, where it has room.
 *
 * Typos and trainer-name misspellings are the reviewers' own and are kept.
 * "Connor" appears where the client wrote it; the attribution beside the
 * quote spells Conner McAdams correctly.
 *
 * Jen Akeroyd's Setmore review is deliberately absent from this pool. It is
 * the featured review on JR Romero's profile, where it runs in full; a cut of
 * it in a card here would put the same client on the hub twice.
 */
export const REVIEWS: readonly Testimonial[] = [
  // ── rendered on the hub ──────────────────────────────────────────────
  {
    reviewer: "Catherine Williams",
    trainer: "Josiah Iwamizu",
    quote:
      "I am delighted with my experience training with Josiah. When we started about four months ago, I couldn't use my right arm and right shoulder at all, due to injury. Now a short time later I am pain-free and I am lifting more than I was when I injured myself. Josiah is quite knowledgeable about the human body and has helped me so much.",
  },
  {
    reviewer: "Meredith Payne",
    trainer: "Devin Shelfer",
    quote:
      "Devin was remarkable. He made me feel comfortable and confident that I can do strength training successfully. He really took the time to understand my needs and give me a doable regime.",
  },
  {
    reviewer: "Karen Emery",
    trainer: "Becca Reeve",
    quote:
      "I've been training with Becca for 4 1/2 months and her program has increased my range of motion, strength and has added 40 yards to my golf swing.",
  },
  // ── also approved and public; promote any of these into the top three ─
  {
    reviewer: "Marlene G Hawk",
    trainer: "Josiah Iwamizu",
    quote:
      "Jo Iwamizu's coaching is excellent. I'm 70+yrs old and had been pretty much inactive for going on 6 years when I decided to get back in the gym. Jo paid close attention to my physical fitness goals, my physical limitations, and my personal beliefs that affect my well-being holistically. He developed a workout program for me, arranged for me to have a body analysis done, explained the results, developed a food guide based on those results, and always helps me stay on track with all of it. I can trust that he wants me to succeed. He is knowledgeable in all areas of physical fitness that we have discussed. A top notch professional. I truly am grateful for him",
  },
  {
    reviewer: "Shawn Collins",
    trainer: "Josiah Iwamizu",
    quote:
      "Jo continues to be a great trainer for me. He checks in regularly to make sure old injuries aren't being aggravated, and tunes my workouts to build sustainable strength. I feel lucky to work with him.",
  },
  {
    reviewer: "Amy Leslie",
    trainer: "Conner McAdams",
    quote:
      "Connor set me up with just the routine I needed post surgery. He's a great listener and changes things up to prevent boredom. Just a few sessions gave me the confidence to tackle a real workout on my own.",
  },
  {
    reviewer: "Barb LeBoss",
    trainer: "Conner McAdams",
    quote:
      "I have been working with Connor, and within a short time I see improvement. He works me hard, but it's so conscientious about how much to do, what to do and how to do it, making sure that nothing causes discomfort or pain. He's a great Personal Trainer.",
  },
  {
    reviewer: "Dick Keis",
    trainer: "Conner McAdams",
    quote:
      "I was not looking forward to staring this weight training program. But Connor changed my mind set. He was sensitive to what I was capable of and made me look forward to my next session.",
  },
  {
    reviewer: "Dallas Caples",
    trainer: "Emma Ciechanowski",
    quote:
      "I had my first session with Emma recently, and I have appreciated how we are working to build back and increase my strength sustainably after taking time off due to surgery. I feel challenged but not overwhelmed, and I look forward to continuing our work together.",
  },
  {
    reviewer: "Ann Brodie",
    trainer: "Emma Ciechanowski",
    quote:
      "Emma was very helpful in suggesting some changes in my technique on some machines and also suggesting others to do. She warned me about using some of the machines because of my having ostoporesis. She was very professional and pleasant to work with.",
  },
  {
    reviewer: "Jennifer A",
    trainer: "Mason Morgan",
    quote:
      "I have seen steady progress over the last 2 months that I have trained with Mason. He provides expert tips on the fine points of form. This is really important for preventing injuries. He is also good at giving variations to increase challenges as I improve. I have a long way to go, but he makes me confident that ongoing change is possible! Thanks, Mason!",
  },
  {
    reviewer: "LA Starcevich",
    trainer: "Mason Morgan",
    quote:
      "I loved training with Mason. He gave me lots of new exercises to try and helped me add weight to the exercises and improve my form. I learned a lot in 8 sessions. Mason is a great guy and pleasant to work with. Highly recommend!",
  },
  {
    reviewer: "Shannon",
    trainer: "Mason Morgan",
    quote:
      "Mason has been the greatest trainer to work with my mom and I. He works with our injuries and customize our workouts accordingly. Mason is excellent at encouraging and making workouts fun even! The best part about working with Mason is his ability to explain the body mechanics and importance of proper form. I highly recommend Mason as the best personal trainer!",
  },
  {
    reviewer: "Erica",
    trainer: "Devin Shelfer",
    quote:
      "Devin is simply a great trainer. I've worked with him most of the year and I am stronger than ever, and every session has been fun and rewarding. Highly recommend!",
  },
  {
    reviewer: "Erica McKenzie",
    trainer: "Devin Shelfer",
    quote:
      "Devin has been wonderful to work with. Super knowledgeable, great at demonstrating moves and checking for correct form, and adjusting readily for any physical challenges. I am really happy i signed up and enjoy working with him!",
  },
  {
    reviewer: "Jennifer Gervais",
    trainer: "Jess Caze",
    quote:
      "Jess Caze was great- listened carefully to what I wanted and worked within the parameters I set. She is clearly very knowledgable. She was focused, professional, and very helpful. Highly recommended.",
  },
  // Trimmed for card width — two sentences out, none rewritten. This is the
  // cut that renders everywhere, including her profile: at 826 characters the
  // full review set a 537px row height against a 148-character review beside
  // it, and the short card was mostly empty space.
  {
    reviewer: "Annie Todd",
    trainer: "Becca Reeve",
    quote:
      "I came to Becca 6 months post partum and unable to hold my baby while standing for more than a few minutes due to back pain, which was devastating to me. I started going to Becca for this reason, which quickly resolved, but I've gotten so much more out of our sessions than I bargained for. She is able to pinpoint small weaknesses and teach you how to strengthen them. She is so incredibly smart and finds ways to help you connect to your body and feel comfortable and confident in your body. She is THE person to see postpartum, or better yet while pregnant to help prepare your body and gain strength.",
  },
  // The reviewer wrote her qualities as a vertical list. Run together here
  // because a review card holds one string; no words are changed.
  {
    reviewer: "Karen Barker",
    trainer: "Becca Reeve",
    quote:
      "I've worked with Timberhill Trainer Rebeca Reeve for 8 months. I feel better, look better, and I'm getting stronger every week. Rebecca is great partner on the fitness journey. Rebecca is: Smart. Knowledgeable. Inspirational. Great with the fit, or not so fit. Hears you when you need to be heard. Tough when you need toughness. Fun. I give Rebecca 150 points on a scale of 100.",
  },
  {
    reviewer: "Vicki Joines",
    trainer: "Emma Ciechanowski",
    quote:
      "One of the best things I've done for myself. Signed up to work with a personal trainer at Timberhill. I'm getting so much stronger and feel amazing. Emma is so easy to work with and so encouraging. Love it!",
  },
  // Steve Sackmann is on staff but has no published profile yet. Both of his
  // reviews are from the same client and both misspell his surname — "Sackman"
  // in one, "Jackman" in the other. Kept verbatim; the attribution spells it
  // correctly. Two reviews from one reviewer are thin as a pair, so they are
  // held out of the top three rather than shown side by side.
  {
    reviewer: "John Swanson",
    trainer: "Steve Sackmann",
    quote:
      "Steve Sackman is doing a great job of getting my fitness program upgraded and establsihed.",
  },
  {
    reviewer: "John Swanson",
    trainer: "Steve Sackmann",
    quote:
      "First Session with Steve Jackman was three thumbs up and six stars.",
  },
  // Approved in the build brief, but no review text has been captured for
  // her. `publishedReviews` drops this entry until a quote is pasted.
  { reviewer: "Judy Saslow", trainer: "Emma Ciechanowski", pending: true },
];

/**
 * Only the reviews whose verbatim text has actually been pasted from Setmore.
 *
 * §7 forbids inventing or compositing review copy, so a review still waiting
 * for its text cannot be shown with stand-in words — and a card announcing
 * that it is waiting reads, to a visitor, as an unfinished page. It is held
 * back entirely until the text lands. The approved attributions stay in the
 * data below so nobody has to reconstruct the list.
 */
export function publishedReviews(
  items: readonly Testimonial[],
): readonly (Testimonial & { quote: string })[] {
  return items.filter(
    (item): item is Testimonial & { quote: string } =>
      typeof item.quote === "string" && item.quote.length > 0,
  );
}

/**
 * Reviews shown on a trainer's own profile page.
 *
 * Only trainers with a published profile have an entry; the rest of the
 * approved reviews live in REVIEWS above, grouped by `trainer`, ready for
 * whichever profile is written next.
 *
 * Jen Akeroyd's Setmore review is the featured review on JR Romero's profile,
 * so it is not also a card there.
 */
/**
 * One review given the full treatment on a trainer's profile — a pull quote
 * beside the review in full, the same shape the hub gives its featured
 * testimonial.
 *
 * This exists because the review cards are a fixed three-across row, and a
 * review worth reading in full cannot live in one: Annie Todd's ran 824
 * characters against 148 in the card beside it and left that card empty. The
 * card row carries short proof, this carries the one that earns the space.
 *
 * `pull` is the review's own opening sentence and `body` is the rest, split
 * exactly where the client split it. Nothing is repeated between them and
 * nothing is dropped, so the whole review is on the page once.
 */
export const PROFILE_FEATURED: Record<
  string,
  {
    reviewer: string;
    attribution?: string;
    pull: string;
    body: readonly string[];
  }
> = {
  // The pull runs into her second sentence, which splits her opening paragraph
  // — a one-sentence pull left the column beside four paragraphs almost empty.
  // Her remaining breaks are her own, and the em dashes are unspaced as she
  // typed them. She is also the club's featured testimonial on the hub, under her
  // first name and from a longer piece written separately — same client, two
  // different accounts, on two different pages.
  "jr-romero": {
    reviewer: "Jen Akeroyd",
    pull: "I can't say enough good things about JR as a personal trainer. After a hamstring rupture and surgical repair, I wasn't sure what my recovery\u2014or future strength\u2014would look like.",
    body: [
      "JR has been instrumental in not only helping me recover safely, but in building strength and confidence beyond where I was before the injury.",
      "He brings a rare combination of deep knowledge, professionalism, and genuine respect for his clients. JR is patient, attentive, and highly intentional in how he programs and coaches. As someone who has been an athlete my entire life, I value being coached\u2014and that's exactly what this feels like. Every session has purpose, progression, and accountability.",
      "What's been most impressive is his expertise in muscle building and strength development. Thanks to his guidance, I've been able to rebuild and even improve my physique\u2014something I didn't think was possible at age 50, especially after such a significant injury.",
      "If you're looking for someone who truly understands how to help you recover, get stronger, and perform at your best, JR is exceptional.",
    ],
  },
  // Marlene wrote hers as one unbroken paragraph. The breaks below are
  // introduced for readability at this width; no words are changed, none are
  // dropped, and the order is hers. Her closing sentence has no full stop in
  // the original and does not get one here.
  "josiah-iwamizu": {
    reviewer: "Marlene G Hawk",
    pull: "Jo Iwamizu's coaching is excellent. I'm 70+yrs old and had been pretty much inactive for going on 6 years when I decided to get back in the gym.",
    body: [
      "Jo paid close attention to my physical fitness goals, my physical limitations, and my personal beliefs that affect my well-being holistically. He developed a workout program for me, arranged for me to have a body analysis done, explained the results, developed a food guide based on those results, and always helps me stay on track with all of it.",
      "I can trust that he wants me to succeed. He is knowledgeable in all areas of physical fitness that we have discussed. A top notch professional. I truly am grateful for him",
    ],
  },
  "becca-reeve": {
    reviewer: "Annie Todd",
    pull: "I came to Becca 6 months post partum and unable to hold my baby while standing for more than a few minutes due to back pain, which was devastating to me.",
    body: [
      "I started going to Becca for this reason, which quickly resolved, but I've gotten so much more out of our sessions than I bargained for. She is able to pinpoint small weaknesses and teach you how to strengthen them. Her workouts are unique and might look easy from the outside but are definitely challenging. She is so incredibly smart and finds ways to help you connect to your body and feel comfortable and confident in your body.",
      "I started out with 8 classes, and I'm hooked now with no end in sight :)",
      "She is THE person to see postpartum, or better yet while pregnant to help prepare your body and gain strength. She's also just an insanely kind and relatable human!",
    ],
  },
};

export const PROFILE_REVIEWS: Record<string, readonly Testimonial[]> = {
  "jess-caze": [
    {
      reviewer: "Jennifer Gervais",
      quote:
        "Jess Caze was great- listened carefully to what I wanted and worked within the parameters I set. She is clearly very knowledgable. She was focused, professional, and very helpful. Highly recommended.",
    },
  ],
  "mason-morgan": [
    {
      reviewer: "Shannon",
      quote:
        "Mason has been the greatest trainer to work with my mom and I. He works with our injuries and customize our workouts accordingly. Mason is excellent at encouraging and making workouts fun even! The best part about working with Mason is his ability to explain the body mechanics and importance of proper form. I highly recommend Mason as the best personal trainer!",
    },
    {
      reviewer: "Jennifer A",
      quote:
        "I have seen steady progress over the last 2 months that I have trained with Mason. He provides expert tips on the fine points of form. This is really important for preventing injuries. He is also good at giving variations to increase challenges as I improve. I have a long way to go, but he makes me confident that ongoing change is possible! Thanks, Mason!",
    },
    {
      reviewer: "LA Starcevich",
      quote:
        "I loved training with Mason. He gave me lots of new exercises to try and helped me add weight to the exercises and improve my form. I learned a lot in 8 sessions. Mason is a great guy and pleasant to work with. Highly recommend!",
    },
  ],
  // Marlene G Hawk is the featured review above, not a card as well.
  "josiah-iwamizu": [
    {
      reviewer: "Catherine Williams",
      quote:
        "I am delighted with my experience training with Josiah. When we started about four months ago, I couldn't use my right arm and right shoulder at all, due to injury. Now a short time later I am pain-free and I am lifting more than I was when I injured myself. Josiah is quite knowledgeable about the human body and has helped me so much.",
    },
    {
      reviewer: "Shawn Collins",
      quote:
        "Jo continues to be a great trainer for me. He checks in regularly to make sure old injuries aren't being aggravated, and tunes my workouts to build sustainable strength. I feel lucky to work with him.",
    },
  ],
  "conner-mcadams": [
    {
      reviewer: "Barb LeBoss",
      quote:
        "I have been working with Connor, and within a short time I see improvement. He works me hard, but it's so conscientious about how much to do, what to do and how to do it, making sure that nothing causes discomfort or pain. He's a great Personal Trainer.",
    },
    {
      reviewer: "Amy Leslie",
      quote:
        "Connor set me up with just the routine I needed post surgery. He's a great listener and changes things up to prevent boredom. Just a few sessions gave me the confidence to tackle a real workout on my own.",
    },
    {
      reviewer: "Dick Keis",
      quote:
        "I was not looking forward to staring this weight training program. But Connor changed my mind set. He was sensitive to what I was capable of and made me look forward to my next session.",
    },
  ],
  "emma-ciechanowski": [
    {
      reviewer: "Dallas Caples",
      quote:
        "I had my first session with Emma recently, and I have appreciated how we are working to build back and increase my strength sustainably after taking time off due to surgery. I feel challenged but not overwhelmed, and I look forward to continuing our work together.",
    },
    {
      reviewer: "Ann Brodie",
      quote:
        "Emma was very helpful in suggesting some changes in my technique on some machines and also suggesting others to do. She warned me about using some of the machines because of my having ostoporesis. She was very professional and pleasant to work with.",
    },
    {
      reviewer: "Vicki Joines",
      quote:
        "One of the best things I've done for myself. Signed up to work with a personal trainer at Timberhill. I'm getting so much stronger and feel amazing. Emma is so easy to work with and so encouraging. Love it!",
    },
  ],
  "devin-shelfer": [
    {
      reviewer: "Erica McKenzie",
      quote:
        "Devin has been wonderful to work with. Super knowledgeable, great at demonstrating moves and checking for correct form, and adjusting readily for any physical challenges. I am really happy i signed up and enjoy working with him!",
    },
    {
      reviewer: "Meredith Payne",
      quote:
        "Devin was remarkable. He made me feel comfortable and confident that I can do strength training successfully. He really took the time to understand my needs and give me a doable regime.",
    },
    {
      reviewer: "Erica",
      quote:
        "Devin is simply a great trainer. I've worked with him most of the year and I am stronger than ever, and every session has been fun and rewarding. Highly recommend!",
    },
  ],
  // Annie Todd is not here: she is the featured review above, and one
  // client should not appear twice on one page.
  "becca-reeve": [
    {
      reviewer: "Karen Barker",
      quote:
        "I've worked with Timberhill Trainer Rebeca Reeve for 8 months. I feel better, look better, and I'm getting stronger every week. Rebecca is great partner on the fitness journey. Rebecca is: Smart. Knowledgeable. Inspirational. Great with the fit, or not so fit. Hears you when you need to be heard. Tough when you need toughness. Fun. I give Rebecca 150 points on a scale of 100.",
    },
    {
      reviewer: "Karen Emery",
      quote:
        "I've been training with Becca for 4 1/2 months and her program has increased my range of motion, strength and has added 40 yards to my golf swing.",
    },
  ],
  "jr-romero": [
    {
      reviewer: "North",
      quote:
        "JR is a well educated and top notch strength and conditioning coach. He is iterating over a custom strength training plan for me that will fit into my endurance cycling workouts. He understands the difficulties and nuance of combining strength training and endurance training while providing enough recovery. He knows all about progressive overload, training stress scores, macro and micro periodization, block training, and other concepts that many coaches don't understand. I feel lucky to have such a good coach.",
    },
    {
      reviewer: "Walt Pebley",
      quote:
        "Today's training with JR, was exactly the same as every workout. He is the consummate professional, exhibiting knowledge around various issues I have physically to both provide confidence and challenge. I cannot express enough gratitude that he is at Timberhill.",
    },
  ],
};

/* ── consultation page ─────────────────────────────────────────────────── */

export const CONSULTATION_FACTS = [
  { big: "30 min", small: "Length of the appointment" },
  { big: "Free", small: "No charge, no commitment" },
  // §9: there are no forms anywhere in this build. Booking is Setmore.
  { big: "No forms", small: "Book straight into an open slot" },
  {
    big: REVIEW_STATS.average,
    small: `Average across ${REVIEW_STATS.count} client reviews`,
  },
] as const;

export const CONSULTATION_AGENDA = [
  {
    title: "What you want out of this",
    body: "The goal in your own words. Not a category — the actual thing you want to be able to do.",
  },
  {
    title: "Where you are starting",
    body: "Training history, injuries, anything a provider has told you, and how much time you realistically have in a week.",
  },
  {
    title: "What happens next",
    body: "Which trainer fits, what a first block would look like, and the options for getting started. Nothing has to be decided in the room.",
  },
] as const;

/**
 * What the consultation is NOT.
 *
 * These lines used to say no selling happens and no commitment is asked for.
 * That was not true — a trainer, a package and a start date are discussed, and
 * often agreed. Claiming otherwise set up the appointment to feel like a
 * bait-and-switch the moment it went well. What is genuinely true is that it
 * is a conversation, not training: nobody moves, nothing is programmed, and
 * nothing is measured.
 */
export const CONSULTATION_IS_NOT = [
  "A workout. You will not train, and you will not leave sweating.",
  "A workout plan. Nothing is written until a trainer has seen you move, and that is your first session.",
  "A fitness test. Nothing is measured, scored or timed.",
] as const;

export const CONSULTATION_PREP = [
  {
    title: "Bring the questions",
    body: "This is a conversation, not a session. Whatever has stopped you before, or confused you, or not worked — bring it. There is no wrong one.",
  },
  {
    title: "Bring your restrictions",
    body: "Anything a doctor or physical therapist has told you to avoid. It shapes the program from day one.",
  },
  {
    title: "Bring the honest schedule",
    body: "Not the schedule you wish you had. A plan built for two days a week that you keep beats four that you do not.",
  },
] as const;

/* ── analytics ─────────────────────────────────────────────────────────── */

/** §9. One CTA event, with the source section as a parameter. Without the
 *  parameter the placement map cannot be evaluated after launch. */
export type CtaSection =
  | "header"
  | "hero"
  | "how-it-works"
  | "team"
  | "options"
  | "final"
  | "sticky"
  | "footer"
  | "profile";
