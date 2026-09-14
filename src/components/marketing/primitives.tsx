import type { ReactNode } from "react";
import {
  PRIMARY_CTA,
  SETMORE,
  type CtaSection,
} from "@/lib/marketing/personal-training";

/**
 * The primary CTA. One string, one destination, six placements (§2).
 *
 * `data-cta-section` is what the analytics handler reads, and
 * `data-primary-cta` is what the sticky bar watches so it can suppress itself
 * while an in-page primary is on screen. Both are set here rather than at each
 * call site so no placement can forget them.
 */
export function PrimaryCta({
  section,
  size = "md",
  tone = "brand",
  className = "",
}: {
  section: CtaSection;
  size?: "md" | "lg";
  /** `brand` is Royal Blue on light; `invert` is white, for navy grounds. */
  tone?: "brand" | "invert";
  className?: string;
}) {
  const classes = [
    "btn",
    tone === "invert" ? "btn-invert" : "btn-primary",
    size === "lg" ? "btn-cta-lg" : "btn-cta",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      className={classes}
      href={SETMORE.consultation}
      data-primary-cta=""
      data-cta-section={section}
    >
      {PRIMARY_CTA}
    </a>
  );
}

/** Five stars, with the rating available to assistive technology as text. */
export function Stars({ className = "" }: { className?: string }) {
  return (
    <div className={`stars ${className}`.trim()}>
      <span aria-hidden="true">★★★★★</span>
      <span className="visually-hidden">Rated 5 out of 5</span>
    </div>
  );
}

/**
 * A brand panel standing in for an outstanding photograph.
 *
 * §15: a page on solid brand navy with no photograph is more credible than a
 * page built on stock models in a gym that is not this one — and more credible
 * than a striped mock with the file spec printed across it. The spec still
 * travels with the panel, on `data-asset`, so whoever drops the real file in
 * can read what it has to be. Every panel is sized and framed for that file,
 * so the swap causes no reflow.
 */
export function AssetSlot({
  spec,
  shape,
  className = "",
  framed = false,
}: {
  spec: string;
  shape: "portrait" | "landscape";
  className?: string;
  /** Adds the hairline frame, for panels that stand alone. */
  framed?: boolean;
}) {
  const classes = [
    framed ? "blueprint" : "",
    "slot",
    shape === "portrait" ? "slot--portrait" : "slot--landscape",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} data-asset={spec} aria-hidden="true">
      <span className="slot-mark">TAC</span>
    </div>
  );
}

/** Numbered section head. The ordinal is decorative — the heading carries the
 *  meaning — so it is hidden from assistive technology. */
export function SectionHead({
  number,
  title,
  id,
  tight = false,
  children,
}: {
  number: string;
  title: string;
  id: string;
  tight?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <div className={`sec-head${tight ? " sec-head--tight" : ""}`}>
        <span className="sec-num" aria-hidden="true">
          {number}
        </span>
        <h2 className="sec-title" id={id}>
          {title}
        </h2>
      </div>
      {children}
    </>
  );
}

/** JSON-LD. The payload comes from repository constants, never user input. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
