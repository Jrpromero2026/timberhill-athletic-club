import type { Metadata } from "next";
import { Inter, League_Spartan } from "next/font/google";
import { CLUB, OG_IMAGE, SITE_ORIGIN } from "@/lib/marketing/personal-training";
import "./marketing.css";

/**
 * Public marketing shell.
 *
 * This route group sits OUTSIDE `performance-operations/`, which is where
 * authentication is enforced — that segment's layout resolves the workspace
 * context and redirects to `/login`. Nothing in this group touches that
 * layout, so these pages are public by construction, and they read no Supabase
 * data, take no session and render no forms.
 *
 * The root layout still wraps this one, so `globals.css` and the Geist font
 * variables are present on the document. `marketing.css` scopes its own tokens
 * and rules under `.tac-site`, and the wrapper below restates the typography
 * it needs — see the header of that file for why that scoping is load-bearing.
 */

const heading = League_Spartan({
  subsets: ["latin"],
  variable: "--font-pt-heading",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-pt-body",
  display: "swap",
});

/**
 * The root layout sets a `%s · Performance Operations` title template, which is
 * wrong for public pages. This template replaces it, and it is shaped so each
 * page supplies only its own half and the brief's exact titles come out whole
 * (§8) — e.g. "Personal Training in Corvallis, OR | Timberhill Athletic Club".
 *
 * `metadataBase` lets the pages declare their canonical as a path. It resolves
 * against SITE_ORIGIN — the host that actually serves these routes — not
 * against the club's WordPress origin. Those were conflated before, so every
 * page here canonicalised itself away to a host that does not serve it, which
 * is a request to be dropped from the index. Pointing a custom domain at this
 * deployment is one environment variable; see SITE_ORIGIN.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  // Explicit rather than inherited: these are the only public pages in the
  // deployment, and `max-image-preview:large` is what lets a share card show
  // at full width in a result.
  // Declared once for the whole group; pages override the text, not the card.
  // Without this every shared link previewed as a blank rectangle.
  openGraph: {
    siteName: CLUB.name,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `Personal Training at ${CLUB.name} in Corvallis, Oregon`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  title: {
    template: `%s | ${CLUB.name}`,
    default: `Personal Training | ${CLUB.name}`,
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`tac-site ${heading.variable} ${body.variable}`}>
      {children}
    </div>
  );
}
