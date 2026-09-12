/**
 * Static command registry for the command palette: pages and actions with
 * the permission each requires. Filtering is pure and unit-tested; entity
 * results come from the server search (search.ts) — one implementation for
 * both the palette and global search.
 */

import type { Permission } from "@/lib/authz/permissions";

export interface CommandEntry {
  id: string;
  group: "Pages" | "Actions";
  label: string;
  href: string;
  keywords: string;
  /** Permission required in the selected organization; null = any signed-in user. */
  permission: Permission | null;
}

export const COMMANDS: CommandEntry[] = [
  // Pages
  { id: "page-overview", group: "Pages", label: "Overview", href: "/performance-operations/overview", keywords: "home dashboard executive", permission: null },
  { id: "page-imports", group: "Pages", label: "Imports", href: "/performance-operations/imports", keywords: "batches csv upload", permission: "import:read" },
  { id: "page-appointments", group: "Pages", label: "Appointments", href: "/performance-operations/appointments", keywords: "ledger sessions", permission: "appointment:read" },
  { id: "page-payroll", group: "Pages", label: "Payroll", href: "/performance-operations/payroll", keywords: "runs compensation pay", permission: "payroll:read" },
  { id: "page-payroll-time", group: "Pages", label: "Time entries", href: "/performance-operations/payroll/time", keywords: "manual hours admin time", permission: "payroll:manage_time" },
  { id: "page-payroll-adjustments", group: "Pages", label: "Adjustments", href: "/performance-operations/payroll/adjustments", keywords: "bonus deduction", permission: "payroll:manage_adjustments" },
  { id: "page-trainers", group: "Pages", label: "Trainers", href: "/performance-operations/trainers", keywords: "coaches staff", permission: "trainer:read" },
  { id: "page-clients", group: "Pages", label: "Clients", href: "/performance-operations/clients", keywords: "customers members", permission: "client:read" },
  { id: "page-reports", group: "Pages", label: "Reports", href: "/performance-operations/reports", keywords: "metrics intelligence analytics", permission: null },
  { id: "page-configuration", group: "Pages", label: "Configuration", href: "/performance-operations/configuration", keywords: "settings setup", permission: "org:read" },
  { id: "page-config-services", group: "Pages", label: "Services", href: "/performance-operations/configuration/services", keywords: "offerings aliases", permission: "service:read" },
  { id: "page-config-periods", group: "Pages", label: "Reporting periods", href: "/performance-operations/configuration/reporting-periods", keywords: "months windows", permission: "period:read" },
  { id: "page-config-compensation", group: "Pages", label: "Compensation plans", href: "/performance-operations/configuration/compensation", keywords: "pay plans rates tiers", permission: "compensation:read" },
  { id: "page-config-users", group: "Pages", label: "Users & access", href: "/performance-operations/configuration/users", keywords: "members invitations roles", permission: "member:read" },
  { id: "page-audit", group: "Pages", label: "Audit log", href: "/performance-operations/audit", keywords: "history events activity", permission: "audit:read" },
  { id: "page-notifications", group: "Pages", label: "Notifications", href: "/performance-operations/notifications", keywords: "inbox alerts unread", permission: null },
  { id: "page-period-close", group: "Pages", label: "Period close", href: "/performance-operations/period-close", keywords: "close month end finalize manifest", permission: "period_close:read" },
  { id: "action-start-close", group: "Actions", label: "Start period close", href: "/performance-operations/period-close/new", keywords: "close period new finalize", permission: "period_close:create" },
  { id: "page-automation", group: "Pages", label: "Automation", href: "/performance-operations/integrations", keywords: "integrations sync jobs workers deliveries", permission: "integration:read" },
  { id: "page-integration-config", group: "Pages", label: "Integration connections", href: "/performance-operations/configuration/integrations", keywords: "providers setmore acuity credentials sync", permission: "integration:read" },
  { id: "page-job-queue", group: "Pages", label: "Background jobs", href: "/performance-operations/integrations/jobs", keywords: "queue retry dead letter worker", permission: "job:read" },
  { id: "page-deliveries", group: "Pages", label: "Report deliveries", href: "/performance-operations/integrations/deliveries", keywords: "email delivery channel recipients", permission: "report_delivery:read" },
  { id: "action-new-connection", group: "Actions", label: "New integration connection", href: "/performance-operations/configuration/integrations/new", keywords: "connect provider api", permission: "integration:create" },
  // Actions
  { id: "action-upload-import", group: "Actions", label: "Upload import file", href: "/performance-operations/imports/new", keywords: "new csv setmore", permission: "import:upload" },
  { id: "action-create-payroll", group: "Actions", label: "Create payroll run", href: "/performance-operations/payroll/new", keywords: "new run prepare", permission: "payroll:create" },
  { id: "action-create-trainer", group: "Actions", label: "Add trainer", href: "/performance-operations/trainers/new", keywords: "new coach hire", permission: "trainer:manage" },
  { id: "action-create-service", group: "Actions", label: "Add service", href: "/performance-operations/configuration/services/new", keywords: "new offering", permission: "service:manage" },
  { id: "action-create-period", group: "Actions", label: "Create reporting period", href: "/performance-operations/configuration/reporting-periods/new", keywords: "new month window", permission: "period:manage" },
  { id: "action-create-plan", group: "Actions", label: "Create compensation plan", href: "/performance-operations/configuration/compensation/new", keywords: "new pay plan", permission: "compensation:manage" },
  { id: "action-log-time", group: "Actions", label: "Log time entry", href: "/performance-operations/payroll/time", keywords: "hours manual admin", permission: "payroll:manage_time" },
];

/** Pure permission + query filter (used client-side with granted perms). */
export function filterCommands(
  entries: readonly CommandEntry[],
  grantedPermissions: readonly string[],
  query: string,
): CommandEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (entry.permission && !grantedPermissions.includes(entry.permission)) {
      return false;
    }
    if (q === "") return true;
    return (
      entry.label.toLowerCase().includes(q) || entry.keywords.includes(q)
    );
  });
}
