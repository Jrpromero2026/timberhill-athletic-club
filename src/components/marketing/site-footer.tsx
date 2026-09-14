import Link from "next/link";
import { CLUB, REVIEW_STATS, SETMORE } from "@/lib/marketing/personal-training";

/**
 * Club footer. The fourth column — Personal Training Overview · Meet the
 * Training Team · Book a Free Consultation · Read Our Reviews — is the one
 * §10 asks to be added.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="g4 footer-grid">
          <div>
            <div className="f-brand">TIMBERHILL</div>
            <div className="f-brand-sub">ATHLETIC CLUB</div>
            <div className="f-addr">
              {CLUB.street}
              <br />
              {CLUB.city}, Oregon {CLUB.postalCode}
              <br />
              <a href={CLUB.phoneHref}>{CLUB.phone}</a>
            </div>
          </div>

          <div>
            <div className="f-label">Club</div>
            <div className="f-links">
              <a href={`${CLUB.origin}/about/`}>About Timberhill</a>
              <a href={`${CLUB.origin}/amenities/`}>Amenities</a>
              <a href={`${CLUB.origin}/schedules/`}>Schedules</a>
              <a href={`${CLUB.origin}/join/`}>Join</a>
            </div>
          </div>

          <div>
            <div className="f-label">Personal Training</div>
            <div className="f-links">
              <Link href="/personal-training">Personal Training Overview</Link>
              <Link href="/personal-training/trainers">
                Meet the Training Team
              </Link>
              <a
                className="is-strong"
                href={SETMORE.consultation}
                data-cta-section="footer"
              >
                Book a Free Consultation
              </a>
              <a
                href={SETMORE.reviews}
                target="_blank"
                rel="noopener"
              >
                Read Our Reviews
              </a>
            </div>
          </div>

          <div>
            <div className="f-label">Hours</div>
            {/* Website hours. Setmore advertises Mon–Fri 5 AM–9 PM; §14 flags
                that discrepancy as unreconciled. */}
            <div className="f-addr">
              {CLUB.hours[0]}
              <br />
              {CLUB.hours[1]}
            </div>
            <div className="f-addr" style={{ marginTop: 14 }}>
              <a href={`mailto:${CLUB.email}`}>{CLUB.email}</a>
            </div>
          </div>
        </div>

        <div className="footer-base">
          <span>
            Established {CLUB.founded} · {CLUB.squareFeet} sq ft · {CLUB.city},
            Oregon
          </span>
          <span>
            facebook.com/TimberhillAthleticClub · instagram.com/timberhill_ac
          </span>
          {/* The permanent staff entry point. Deliberately here and not in the
              club navigation: a payroll tool does not belong beside "Join" on
              a page selling personal training. Once signed in, the header
              carries a real tab — see staff-link.tsx. */}
          <Link className="f-staff" href="/performance-operations">
            Staff sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** Used beside the review cards; kept here so the count has one source. */
export const REVIEW_LINK_LABEL = `Read all ${REVIEW_STATS.count} reviews ›`;
