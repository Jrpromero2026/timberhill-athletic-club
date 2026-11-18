import Link from "next/link";

export interface LinkCard {
  title: string;
  description: string;
  href: string;
}

/** A grid of links: the landing page for an area of the hub. */
export function LinkCards({ cards }: { cards: readonly LinkCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li key={card.title}>
          <Link
            href={card.href}
            className="block h-full border border-border bg-surface p-6 transition-colors hover:border-ink"
          >
            <span className="bar mb-3" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">{card.title}</h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              {card.description}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
