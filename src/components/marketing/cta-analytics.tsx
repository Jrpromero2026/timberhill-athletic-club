"use client";

import { useEffect } from "react";

type Payload = {
  event: string;
  cta_section: string | null;
  page_route: string;
};

declare global {
  interface Window {
    dataLayer?: Payload[];
    gtag?: (
      command: "event",
      name: string,
      params: Record<string, unknown>,
    ) => void;
  }
}

/**
 * §9: the consultation CTA is ONE event with the source section as a
 * parameter — `hero` · `how-it-works` · `team` · `options` · `final` ·
 * `sticky`, plus `header` and `footer`. Without the parameter the placement
 * map cannot be evaluated after launch, which is the whole reason the brief
 * specifies five placements of one string.
 *
 * A single delegated listener rather than an onClick on every button: the
 * links stay plain anchors, so they still work with JavaScript disabled and
 * middle-click and open-in-new-tab behave normally.
 *
 * Mount once per page, inside the marketing group only — the application has
 * its own analytics concerns and this must not reach them.
 */
export function CtaAnalytics() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const origin = target.closest<HTMLElement>("[data-cta-section]");
      if (!origin) return;

      const payload: Payload = {
        event: "consultation_cta_click",
        cta_section: origin.dataset.ctaSection ?? null,
        page_route: window.location.pathname,
      };

      if (typeof window.gtag === "function") {
        window.gtag("event", payload.event, {
          cta_section: payload.cta_section,
          page_route: payload.page_route,
        });
      } else {
        window.dataLayer ??= [];
        window.dataLayer.push(payload);
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
