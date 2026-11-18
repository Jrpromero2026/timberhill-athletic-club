import Link from "next/link";

export interface LinkCard {
  title: string;
  description: string;
  /** Where the card goes. Omit for something that has no page in the hub yet. */
  href?: string;
  /** Short status shown on the card, e.g. "Not in the hub yet". */
  status?: string;
}

/** A grid of section cards: a landing page for an area of the hub. */
export function LinkCards({ cards }: { cards: readonly LinkCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const body = (
          <>
            <span className="bar mb-3" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">{card.title}</h2>
              {card.status && (
                <span className="shrink-0 eyebrow bg-surface-sunken px-2 py-1 !text-[10px] !tracking-[0.14em] text-ink-secondary">
                  {card.status}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-ink-secondary">
              {card.description}
            </p>
          </>
        );
        const box =
          "block h-full border border-border bg-surface p-6";
        return (
          <li key={card.title}>
            {card.href ? (
              <Link
                href={card.href}
                className={`${box} transition-colors hover:border-ink`}
              >
                {body}
              </Link>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
