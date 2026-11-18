import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Marketing" };

const CARDS: LinkCard[] = [
  {
    title: "Website content",
    description: "The personal training pages as visitors will see them.",
    href: "/personal-training",
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing" />
      <LinkCards cards={CARDS} />
      <p className="text-sm text-ink-muted">
        Next: campaigns, brand assets, social.
      </p>
    </div>
  );
}
