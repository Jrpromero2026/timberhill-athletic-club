import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "SOPs" };

const NOT_YET = "Not in the hub yet";

const CARDS: LinkCard[] = [
  {
    title: "Trainer SOPs",
    description: "The written procedures trainers work from.",
    status: NOT_YET,
  },
  {
    title: "Split levels and reviews",
    description:
      "Each trainer's split, the SOP 2.1 brackets, and review dates.",
    status: NOT_YET,
  },
  {
    title: "Goals",
    description: "Monthly and quarterly targets per trainer.",
    status: NOT_YET,
  },
  {
    title: "Client balances",
    description: "Sessions left on every client package, by trainer.",
    href: "/performance-operations/package-audit",
  },
];

export default function SopsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="SOPs"
        description="Procedures, split levels, and goals for the training team."
      />
      <LinkCards cards={CARDS} />
    </div>
  );
}
