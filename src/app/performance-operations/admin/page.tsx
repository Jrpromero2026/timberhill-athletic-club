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
    description: "The session-by-session ledger behind every number.",
    href: "/performance-operations/appointments",
  },
  {
    title: "Automation",
    description: "Scheduled syncs, background jobs, and report deliveries.",
    href: "/performance-operations/integrations",
  },
  {
    title: "Configuration",
    description: "Services, reporting periods, pay plans, users and access.",
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
      <PageHeader
        title="Data & settings"
        description="The plumbing behind Payroll, Trainers and Reports. You only need these when setting something up or tracking down a number."
      />
      <LinkCards cards={CARDS} />
    </div>
  );
}
