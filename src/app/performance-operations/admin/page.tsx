import type { Metadata } from "next";
import { LinkCards, type LinkCard } from "@/components/ui/link-cards";
import { AuditSettings } from "@/components/settings/audit-settings";
import { PageHeader } from "@/components/ui/page-header";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";

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

export default async function AdminPage() {
  // The director sees what feeds the hub and how it is set.
  const context = await getWorkspaceContext();
  if (context.mode === "live" && context.selection.kind === "organization") {
    const organizationId = context.selection.organizationId;
    const actor = await getActorContext();
    if (
      actor &&
      hasPermissionInOrganization(context.memberships, organizationId, "payroll:read")
    ) {
      return <AuditSettings actor={actor} organizationId={organizationId} />;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Data & settings" />
      <LinkCards cards={CARDS} />
    </div>
  );
}
