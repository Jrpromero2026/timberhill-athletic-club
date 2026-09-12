import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import {
  getConfigStats,
  readinessChecklist,
} from "@/lib/data/config-stats";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Configuration" };

export default async function ConfigurationPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Configuration" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Configuration" />;

  const orgs =
    context.selection.kind === "organization"
      ? context.options.filter(
          (o) =>
            context.selection.kind === "organization" &&
            o.id === context.selection.organizationId
        )
      : context.options;

  const stats = await getConfigStats(actor, orgs);
  const totals = stats.reduce(
    (acc, s) => ({
      members: acc.members + s.members,
      invitations: acc.invitations + s.pendingInvitations,
      trainers: acc.trainers + s.activeTrainers,
      services: acc.services + s.activeServices,
      periods: acc.periods + s.reportingPeriods,
      plans: acc.plans + s.compensationPlans,
      departments: acc.departments + s.departments,
    }),
    { members: 0, invitations: 0, trainers: 0, services: 0, periods: 0, plans: 0, departments: 0 }
  );

  const anyOrgId = orgs[0]?.id ?? "";
  const sections = [
    {
      title: "Organizations",
      count: `${orgs.length}`,
      status: "Seeded",
      href: null,
      note: "Organizations are managed by platform admins; both initial organizations exist.",
    },
    {
      title: "Departments",
      count: `${totals.departments}`,
      status: totals.departments > 0 ? "Configured" : "Missing",
      href: null,
      note: "All nine seeded departments are active.",
    },
    {
      title: "Users & Access",
      count: `${totals.members} members · ${totals.invitations} pending invites`,
      status: totals.members > 0 ? "Active" : "Needs setup",
      href: "/performance-operations/configuration/users",
      note: "Invite users, manage roles, memberships, and department scoping.",
    },
    {
      title: "Trainers",
      count: `${totals.trainers} active`,
      status: totals.trainers > 0 ? "In progress" : "Awaiting roster",
      href: "/performance-operations/trainers",
      note: "Trainer roster with effective-dated organization and department assignments.",
    },
    {
      title: "Services",
      count: `${totals.services} active`,
      status: totals.services > 0 ? "In progress" : "Awaiting service list",
      href: "/performance-operations/configuration/services",
      note: "Normalized services and their Setmore/Acuity aliases for import matching.",
    },
    {
      title: "Reporting Periods",
      count: `${totals.periods}`,
      status: totals.periods > 0 ? "Configured" : "Awaiting schedule rules",
      href: "/performance-operations/configuration/reporting-periods",
      note: "Monthly reporting and payroll windows; powers the header period selector.",
    },
    {
      title: "Compensation Plans",
      count: `${totals.plans}`,
      status: totals.plans > 0 ? "In progress" : "Awaiting comp rules",
      href: "/performance-operations/configuration/compensation",
      note: "Versioned plans, tiers in basis points, effective-dated trainer assignments.",
    },
    {
      title: "Audit Log",
      count: "Live",
      status: "Recording",
      href: "/performance-operations/audit",
      note: "Append-only trail of every governed configuration change.",
    },
    {
      title: "Environment",
      count: isSupabaseConfigured() ? "Connected" : "Not configured",
      status: isSupabaseConfigured() ? "performance-operations-dev" : "Setup required",
      href: null,
      note: "Dedicated Supabase development project; migrations and seed applied.",
    },
  ];

  const canManageAny = orgs.some((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "org:manage")
  );
  void canManageAny;
  void anyOrgId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        description="Business configuration hub. Complete each organization's checklist before the Import Center and payroll phases can operate on real data."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div key={section.title}
            className="flex flex-col rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                {section.status}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-lg font-semibold text-ink">{section.count}</p>
            <p className="mt-1 flex-1 text-xs text-ink-secondary">{section.note}</p>
            {section.href && (
              <Link href={section.href}
                className="mt-3 text-sm font-medium text-accent hover:text-accent-strong">
                Manage →
              </Link>
            )}
          </div>
        ))}
      </div>

      <section aria-label="Setup readiness" className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Setup readiness by organization</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {stats.map((orgStats) => {
            const checklist = readinessChecklist(orgStats);
            const doneCount = checklist.filter((c) => c.done).length;
            const ready = doneCount === checklist.length;
            return (
              <div key={orgStats.organizationId}
                className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-ink">{orgStats.organizationName}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    ready ? "bg-positive-soft text-positive" : "bg-warning-soft text-warning"
                  }`}>
                    {ready
                      ? "Payroll-ready configuration"
                      : `Not payroll-ready · ${doneCount}/${checklist.length}`}
                  </span>
                </div>
                <ul className="px-4 py-3 space-y-1.5">
                  {checklist.map((item) => (
                    <li key={item.label} className="flex items-center gap-2.5 text-sm">
                      {item.done ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-positive-soft text-[10px] font-bold text-positive">✓</span>
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-border-strong" />
                      )}
                      <span className={item.done ? "text-ink" : "text-ink-muted"}>
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="ml-auto font-mono text-xs text-ink-muted">{item.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
