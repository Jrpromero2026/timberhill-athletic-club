import type { ReactNode } from "react";
import {
  PRIMARY_CTA,
  SETMORE,
  type CtaSection,
} from "@/lib/marketing/personal-training";

/**
 * Registration marks. The Industry design system draws them just outside the
 * box, which is why `.blueprint` is `position: relative` and the marks sit at
 * -6px — they are meant to overhang, and the layout accounts for it.
 */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

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
    "blueprint",
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
      <Corners />
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
 * A striped slot standing in for an outstanding photograph. Every slot is
 * sized and framed for the real file, so dropping an image in causes no
 * reflow. No stock imagery: §15.
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
  /** Adds the blueprint frame and marks, for standalone slots. */
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
    <div className={classes}>
      <span>{spec}</span>
      {framed ? <Corners /> : null}
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
