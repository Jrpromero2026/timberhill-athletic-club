import type { Metadata } from "next";
import Link from "next/link";
import { PrimaryCta } from "@/components/marketing/primitives";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { CLUB } from "@/lib/marketing/personal-training";

/**
 * The 404 for the public routes.
 *
 * Without this, a mistyped trainer slug fell through to the application's own
 * not-found page, which told a prospective client "you do not have access to
 * it in the current workspace" and offered a button into the staff login. That
 * is a dead end dressed as a permissions error.
 *
 * `noindex` because a soft 404 that gets indexed is worse than the 404 itself;
 * `follow` so the links out of here still pass.
 */
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function MarketingNotFound() {
  return (
    <div className="pg">
      <SiteHeader current={null} />

      <main id="main">
        <section className="sec">
          <div className="wrap" style={{ maxWidth: 640 }}>
            <p className="crumbs" style={{ marginBottom: 18 }}>
              404
            </p>
            <h1 className="page-h1" style={{ marginBottom: 18 }}>
              That page has moved or never existed.
            </h1>
            <p className="lede" style={{ marginBottom: 30 }}>
              If you were looking for a trainer, the whole team is on one page.
              If you were partway through booking, the consultation is still
              thirty minutes and still free.
            </p>

            <div className="cta-row" style={{ marginBottom: 26 }}>
              <PrimaryCta section="final" />
            </div>

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: 10,
              }}
            >
              <li>
                <Link className="btn btn-ghost f-link" href="/personal-training">
                  Personal Training overview ›
                </Link>
              </li>
              <li>
                <Link
                  className="btn btn-ghost f-link"
                  href="/personal-training/trainers"
                >
                  Meet the training team ›
                </Link>
              </li>
              <li>
                <Link
                  className="btn btn-ghost f-link"
                  href="/personal-training/consultation"
                >
                  The free fitness consultation ›
                </Link>
              </li>
              <li>
                <a className="btn btn-ghost f-link" href={CLUB.phoneHref}>
                  Call {CLUB.phone} ›
                </a>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
