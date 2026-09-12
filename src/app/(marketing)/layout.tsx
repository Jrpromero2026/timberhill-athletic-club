import type { Metadata } from "next";
import { Inter, League_Spartan } from "next/font/google";
import { CLUB } from "@/lib/marketing/personal-training";
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
 * `metadataBase` lets the pages declare their canonical as a path; the brief's
 * canonical host is timberhillac.com regardless of where this is deployed,
 * because the WordPress hub is the published home for these routes.
 */
export const metadata: Metadata = {
  metadataBase: new URL(CLUB.origin),
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
