import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Projects" };

const CARDS: LinkCard[] = [
  {
    title: "Website",
    description: "The personal training website preview.",
    href: "/personal-training",
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Projects" />
      <LinkCards cards={CARDS} />
      <p className="text-sm text-ink-muted">
        Next: Setmore rebrand, apparel, Corporate Membership 2.0.
      </p>
    </div>
  );
}
