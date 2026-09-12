"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { PRIMARY_CTA, SETMORE } from "@/lib/marketing/personal-training";

/**
 * Mobile sticky CTA (§2, §9, section 13).
 *
 * Two rules, and the second is the one that is easy to get wrong:
 *
 *   - it appears only after the hero has left the viewport, and
 *   - it hides again whenever ANY in-page primary CTA is on screen, so a
 *     visitor never sees two primary CTAs at once.
 *
 * Both are driven by IntersectionObserver over `[data-primary-cta]`, which
 * `PrimaryCta` sets on every instance. Where the observer is unavailable the
 * bar is shown unconditionally: the safer failure is a reachable CTA.
 *
 * Visibility is read through `useSyncExternalStore` rather than an effect that
 * calls `setState`. The observer IS external state, and subscribing to it this
 * way avoids the cascading render an effect would cause and gives the server a
 * definite snapshot — hidden — so the markup is stable before hydration.
 *
 * CSS keeps the bar off desktop entirely, so this only matters below 760px.
 */
function useStickyVisibility(heroSelector: string, barRef: React.RefObject<HTMLDivElement | null>) {
  const visible = useRef(false);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!("IntersectionObserver" in window)) {
        visible.current = true;
        onStoreChange();
        return () => {};
      }

      const hero = document.querySelector(heroSelector);
      const ctas = Array.from(
        document.querySelectorAll<HTMLElement>("[data-primary-cta]"),
      ).filter((cta) => !barRef.current?.contains(cta));

      // With no hero on the page — the trainer profile has none — treat it as
      // already gone. The in-page CTA near the top still suppresses the bar.
      let heroVisible = Boolean(hero);
      const onScreen = new Set<Element>();

      const sync = () => {
        const next = !heroVisible && onScreen.size === 0;
        if (next === visible.current) return;
        visible.current = next;
        onStoreChange();
      };

      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === hero) {
            heroVisible = entry.isIntersecting;
          } else if (entry.isIntersecting) {
            onScreen.add(entry.target);
          } else {
            onScreen.delete(entry.target);
          }
        }
        sync();
      });

      if (hero) observer.observe(hero);
      for (const cta of ctas) observer.observe(cta);
      sync();

      return () => observer.disconnect();
    },
    [heroSelector, barRef],
  );

  return useSyncExternalStore(
    subscribe,
    () => visible.current,
    () => false,
  );
}

export function StickyCta({
  heroSelector = "[data-hero]",
}: {
  heroSelector?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const on = useStickyVisibility(heroSelector, bar);

  return (
    <div ref={bar} className={`sticky-cta only-n${on ? " is-on" : ""}`}>
      <a
        className="btn btn-primary"
        href={SETMORE.consultation}
        data-cta-section="sticky"
      >
        {PRIMARY_CTA}
      </a>
    </div>
  );
}
