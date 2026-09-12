"use client";

import { useState } from "react";
import { AssetSlot, Corners } from "@/components/marketing/primitives";
import type { Trainer } from "@/lib/marketing/personal-training";

const HEADSHOT_SPEC = "headshot — identify from Trainer Pictures folder";

/**
 * Section 06, Meet the Team. Cards start collapsed and one philosophy is open
 * at a time.
 *
 * §6: a card answers one question — would this person understand me? So the
 * card carries credentials, specialties and works-best-with, and the
 * philosophy is capped at two or three sentences behind a disclosure. Full
 * biographies live on the Phase 3 profile page, not here.
 */
export function TeamGrid({ trainers }: { trainers: readonly Trainer[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="g3">
      {trainers.map((trainer) => {
        const isOpen = open === trainer.slug;
        const panelId = `phil-${trainer.slug}`;
        return (
          <article className="blueprint trainer-card" key={trainer.slug}>
            <Corners />
            <AssetSlot spec={HEADSHOT_SPEC} shape="portrait" />
            <div className="trainer-body">
              <div>
                <h3 className="t-name">{trainer.name}</h3>
                <div className="t-cred">{trainer.credentials}</div>
              </div>
              <div className="taglist">
                {trainer.specialties.map((specialty) => (
                  <span className="tag tag-outline tag-sm" key={specialty}>
                    {specialty}
                  </span>
                ))}
              </div>
              <p className="t-best">{trainer.worksBestWith}</p>
              <p className="t-phil" id={panelId} hidden={!isOpen}>
                {trainer.philosophy}
              </p>
              <button
                className="btn btn-ghost t-toggle"
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : trainer.slug)}
              >
                <span>{isOpen ? "LESS" : "TRAINING PHILOSOPHY"}</span>
                <span aria-hidden="true">{isOpen ? "–" : "+"}</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
