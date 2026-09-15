"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StaffLink } from "@/components/marketing/staff-link";
import { CLUB, SETMORE } from "@/lib/marketing/personal-training";

type Route = "hub" | "trainers" | "consultation" | null;

/**
 * Written without trailing slashes: `next.config.ts` leaves `trailingSlash` at
 * its default, so these are the application's canonical paths. The brief's
 * trailing-slash URLs are the published WordPress shape and appear in the
 * canonical and schema tags, which are absolute timberhillac.com URLs.
 */
const PT_CHILDREN = [
  { label: "Overview", href: "/personal-training", key: "hub" },
  { label: "Our Trainers", href: "/personal-training/trainers", key: "trainers" },
  {
    label: "Free Consultation",
    href: "/personal-training/consultation",
    key: "consultation",
  },
] as const;

/**
 * Club navigation, with Personal Training promoted to position 2 — immediately
 * after About and before Amenities (§10).
 *
 * The PT parent is a REAL LINK in its own right, not only an expander. That is
 * the most common failure when a Divi dropdown is promoted, and §9 calls for
 * verifying it on iOS Safari and Android Chrome. The caret is a separate
 * button, so tapping the label navigates and tapping the caret discloses.
 *
 * Hover and click must not fight each other: hovering opens the submenu, and
 * clicking the caret *pins* it open so it survives the pointer leaving. A
 * naive port where click simply toggles reads as "nothing happened", because
 * the hover has already opened it by the time the click lands.
 *
 * The sibling links point at the wider club site, which this application does
 * not serve; they resolve on timberhillac.com.
 */
export function SiteHeader({ current }: { current: Route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const pinned = useRef(false);
  const host = useRef<HTMLLIElement>(null);

  const canHover =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover)").matches;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      pinned.current = false;
      setDropOpen(false);
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="site-header">
      <div className="wrap header-bar">
        <a className="brand" href={`${CLUB.origin}/`}>
          <span className="brand-mark">TIMBERHILL</span>
          <span className="brand-sub">ATHLETIC CLUB</span>
        </a>

        <nav className="nav-main only-w" aria-label="Main">
          <ul>
            <li>
              <a className="nav-link" href={`${CLUB.origin}/about/`}>
                About
              </a>
            </li>
            <li
              ref={host}
              className="nav-has-drop nav-parent nav-parent--current"
              onMouseEnter={canHover ? () => setDropOpen(true) : undefined}
              onMouseLeave={
                canHover
                  ? () => {
                      if (!pinned.current) setDropOpen(false);
                    }
                  : undefined
              }
              onBlur={(event) => {
                if (!host.current?.contains(event.relatedTarget as Node)) {
                  pinned.current = false;
                  setDropOpen(false);
                }
              }}
            >
              <Link className="nav-link" href="/personal-training">
                Personal Training
              </Link>
              <button
                className="nav-disclose"
                type="button"
                aria-expanded={dropOpen}
                aria-controls="pt-drop"
                onClick={() => {
                  pinned.current = !pinned.current;
                  setDropOpen(pinned.current);
                }}
              >
                <span className="nav-caret" aria-hidden="true">
                  ▾
                </span>
                <span className="visually-hidden">
                  Show Personal Training pages
                </span>
              </button>
              <ul className="nav-drop" id="pt-drop" hidden={!dropOpen}>
                {PT_CHILDREN.map((child) => (
                  <li key={child.key}>
                    <Link
                      href={child.href}
                      aria-current={current === child.key ? "page" : undefined}
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
            <li className="nav-parent">
              <a className="nav-link" href={`${CLUB.origin}/amenities/`}>
                Amenities
              </a>
              <span className="nav-caret" aria-hidden="true">
                ▾
              </span>
            </li>
            <li className="nav-parent">
              <a className="nav-link" href={`${CLUB.origin}/family/`}>
                Family
              </a>
              <span className="nav-caret" aria-hidden="true">
                ▾
              </span>
            </li>
            {["Join", "Schedules", "Members", "Contact"].map((label) => (
              <li key={label}>
                <a
                  className="nav-link"
                  href={`${CLUB.origin}/${label.toLowerCase()}/`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* §10: a small solid Royal Blue button on every page. The label is
            FREE CONSULTATION — "Free Consult" is on the banned-variants list,
            so the type is tightened to fit 375px instead of abbreviated. */}
        <a
          className="btn btn-primary header-cta only-w"
          href={SETMORE.consultation}
          data-cta-section="header"
        >
          FREE CONSULTATION
        </a>

        <div className="only-n nav-mobile">
          <a
            className="btn btn-primary"
            href={SETMORE.consultation}
            data-cta-section="header"
          >
            FREE CONSULTATION
          </a>
          <button
            className="hamburger"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <span className="visually-hidden">Menu</span>
          </button>
        </div>
      </div>

      <nav
        className="mobile-menu only-n"
        id="mobile-menu"
        aria-label="Main"
        hidden={!menuOpen}
      >
        <ul>
          <li>
            <a href={`${CLUB.origin}/about/`}>About</a>
          </li>
          <li>
            <Link href="/personal-training">Personal Training</Link>
          </li>
          {PT_CHILDREN.map((child) => (
            <li className="sub" key={child.key}>
              <Link
                href={child.href}
                aria-current={current === child.key ? "page" : undefined}
              >
                {child.label}
              </Link>
            </li>
          ))}
          {["Amenities", "Family", "Join", "Schedules", "Members", "Contact"].map(
            (label) => (
              <li key={label}>
                <a href={`${CLUB.origin}/${label.toLowerCase()}/`}>{label}</a>
              </li>
            ),
          )}
          <li className="mobile-staff">
            <StaffLink />
          </li>
        </ul>
      </nav>

      <div className="subnav">
        <div className="wrap">
          <span className="subnav-label">Personal Training ›</span>
          {PT_CHILDREN.map((child) => (
            <Link
              key={child.key}
              href={child.href}
              aria-current={current === child.key ? "page" : undefined}
            >
              {child.label}
            </Link>
          ))}
          <StaffLink />
        </div>
      </div>
    </header>
  );
}
