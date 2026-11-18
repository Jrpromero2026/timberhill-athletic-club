import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Marketing" };

const NOT_YET = "Not in the hub yet";

const CARDS: LinkCard[] = [
  {
    title: "Website content",
    description: "The personal training pages, as visitors will see them.",
    href: "/personal-training",
    status: "Preview",
  },
  {
    title: "Campaigns",
    description: "Promotions and their results.",
    status: NOT_YET,
  },
  {
    title: "Brand assets",
    description: "Logos, colours, fonts, and templates.",
    status: NOT_YET,
  },
  {
    title: "Social",
    description: "Planned and published posts.",
    status: NOT_YET,
  },
];

export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Campaigns, brand assets, social, and website content."
      />
      <LinkCards cards={CARDS} />
    </div>
  );
}
