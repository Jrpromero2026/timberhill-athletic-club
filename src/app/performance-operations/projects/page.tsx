import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Projects" };

const NOT_YET = "Not in the hub yet";

const CARDS: LinkCard[] = [
  {
    title: "Website",
    description: "The personal training website preview, behind this login.",
    href: "/personal-training",
    status: "Preview",
  },
  {
    title: "Setmore rebrand",
    description: "New service names and rates for January 1.",
    status: NOT_YET,
  },
  {
    title: "Apparel",
    description: "Trainer and member apparel.",
    status: NOT_YET,
  },
  {
    title: "Corporate Membership 2.0",
    description: "Employer partnerships and Corporate Personal Coaching.",
    status: NOT_YET,
  },
];

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Upgrades and enhancements in progress for the department."
      />
      <LinkCards cards={CARDS} />
    </div>
  );
}
