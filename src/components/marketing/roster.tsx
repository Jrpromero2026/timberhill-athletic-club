"use client";

import Link from "next/link";
import { useState } from "react";
import { AssetSlot } from "@/components/marketing/primitives";
import {
  SPECIALTIES,
  type Specialty,
  type Trainer,
} from "@/lib/marketing/personal-training";

const HEADSHOT_SPEC = "headshot — identify from Trainer Pictures folder";

/**
 * The trainers index, filterable by specialty.
 *
 * §6: the vocabulary is a closed list of fourteen, and `Specialty` is derived
 * from it, so a trainer cannot carry a specialty the filter does not offer —
 * the mismatch that would silently empty the grid fails typecheck instead.
 *
 * Filtering re-renders the list rather than hiding DOM nodes, but every
 * trainer is server-rendered on first load, so the full roster is in the
 * crawlable document and works with JavaScript disabled.
 *
 * `Full profile ›` appears only where a Phase 3 profile exists — today that is
 * JR Romero alone. Seven dead links would be worse than seven cards without
 * one.
 */
export function Roster({ trainers }: { trainers: readonly Trainer[] }) {
  const [filter, setFilter] = useState<Specialty | null>(null);

  const shown = filter
    ? trainers.filter((trainer) =>
        (trainer.specialties as readonly string[]).includes(filter),
      )
    : trainers;

  const countLine = filter
    ? `${shown.length} ${shown.length === 1 ? "trainer" : "trainers"} · ${filter}`
    : `${trainers.length} trainers`;

  return (
    <>
      <section className="filterbar" aria-label="Filter trainers by specialty">
        <div className="wrap">
          <div className="filter-label" id="filter-label">
            Filter by specialty
          </div>
          <div className="chips" role="group" aria-labelledby="filter-label">
            <button
              className="chip"
              type="button"
              aria-pressed={filter === null}
              onClick={() => setFilter(null)}
            >
              All trainers
            </button>
            {SPECIALTIES.map((specialty) => (
              <button
                className="chip"
                type="button"
                key={specialty}
                aria-pressed={filter === specialty}
                onClick={() => setFilter(specialty)}
              >
                {specialty}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="roster-head">
            <div className="roster-count" aria-live="polite">
              {countLine}
            </div>
          </div>

          {shown.length > 0 ? (
            <div className="g3">
              {shown.map((trainer) => (
                <article
                  className="blueprint trainer-card"
                  key={trainer.slug}
                >
                  <AssetSlot spec={HEADSHOT_SPEC} shape="portrait" />
                  <div className="trainer-body">
                    <div className="roster-head-row">
                      <h2 className="t-name">{trainer.name}</h2>
                      {/* §6: a badge when true, NOTHING when false — never a
                          "full" state. */}
                      {trainer.acceptingClients ? (
                        <span
                          className="tag tag-accent"
                          style={{
                            fontSize: "9.5px",
                            letterSpacing: ".08em",
                            flex: "none",
                          }}
                        >
                          ACCEPTING
                        </span>
                      ) : null}
                    </div>
                    <div className="t-cred">{trainer.credentials}</div>
                    <div className="taglist">
                      {trainer.specialties.map((specialty) => (
                        <span
                          className="tag tag-outline tag-sm"
                          key={specialty}
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                    <p className="t-best">{trainer.worksBestWith}</p>
                    {trainer.profile ? (
                      <Link
                        className="btn btn-ghost f-link"
                        href={`/personal-training/trainers/${trainer.slug}`}
                      >
                        Full profile ›
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="blueprint empty-card">
              <div className="empty-title">
                No trainer currently lists {filter}
              </div>
              <div className="empty-body">
                Clear the filter to see the whole team, or book a consultation
                and we will match you ourselves — that is what it is for.
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
