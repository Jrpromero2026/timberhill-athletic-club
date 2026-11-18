import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "SOPs" };

const CARDS: LinkCard[] = [
  {
    title: "Client balances",
    description: "Sessions left on each client package.",
    href: "/performance-operations/package-audit",
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="SOPs" />
      <LinkCards cards={CARDS} />
      <p className="text-sm text-ink-muted">
        Next: trainer SOPs, split levels and reviews, goals.
      </p>
    </div>
  );
}
