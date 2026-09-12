"use client";

import { useId, useState } from "react";
import type { FaqItem } from "@/lib/marketing/personal-training";

/**
 * FAQ accordion. One item open at a time, matching the approved design.
 *
 * `openInitially` starts the consultation page on its first question; the hub
 * passes nothing, because §11 requires all twelve collapsed on mobile.
 *
 * Headers are `<button>` inside `<h3>`: the heading keeps the document outline
 * navigable, the button carries `aria-expanded` and the ≥44px tap target §9
 * asks for. Answers are hidden with the `hidden` attribute rather than removed,
 * so the text is in the document for search and for find-in-page.
 */
export function Faq({
  items,
  openInitially,
  className = "faq",
}: {
  items: readonly FaqItem[];
  openInitially?: number;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(openInitially ?? null);
  const base = useId();

  return (
    <div className={className}>
      {items.map((item, index) => {
        const panelId = `${base}-faq-${index}`;
        const isOpen = open === index;
        return (
          <div className="faq-item" key={item.question}>
            <h3 style={{ margin: 0 }}>
              <button
                className="faq-q"
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                {item.question}
                <span className="faq-chev" aria-hidden="true">
                  {isOpen ? "–" : "+"}
                </span>
              </button>
            </h3>
            <div className="faq-a" id={panelId} hidden={!isOpen}>
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
