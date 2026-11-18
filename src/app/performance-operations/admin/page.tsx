import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Data & settings" };

const CARDS: LinkCard[] = [
  {
    title: "Imports",
    description: "Upload and review Setmore and GMS files.",
    href: "/performance-operations/imports",
  },
  {
    title: "Data health",
    description: "What is missing, unmatched, or out of date.",
    href: "/performance-operations/data-health",
  },
  {
    title: "Appointments",
    description: "Every imported session.",
    href: "/performance-operations/appointments",
  },
  {
    title: "Automation",
    description: "Scheduled syncs, background jobs, and report deliveries.",
    href: "/performance-operations/integrations",
  },
  {
    title: "Configuration",
    description: "Services, periods, pay plans and access.",
    href: "/performance-operations/configuration",
  },
  {
    title: "Audit log",
    description: "Who changed what, and when.",
    href: "/performance-operations/audit",
  },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Data & settings" />
      <LinkCards cards={CARDS} />
    </div>
  );
}
