import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Services" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "service:read")
  );
  if (!canRead) return <PermissionDenied title="Services" />;
  const canManage = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "service:manage")
  );

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Services" />;

  const [servicesRes, aliasCountRes] = await Promise.all([
    actor.supabase
      .from("services")
      .select(
        "id, internal_name, display_name, default_duration_minutes, status, effective_from, effective_to, organization_id, organizations ( name ), service_categories ( name )"
      )
      .in("organization_id", orgIds)
      .order("display_name"),
    actor.supabase
      .from("service_source_aliases")
      .select("service_id")
      .in("organization_id", orgIds),
  ]);

  interface ServiceListRow {
    id: string;
    internal_name: string;
    display_name: string;
    default_duration_minutes: number;
    status: string;
    effective_from: string;
    effective_to: string | null;
    organization_id: string;
    organizations: { name: string } | null;
    service_categories: { name: string } | null;
  }

  const services = (servicesRes.data ?? []) as unknown as ServiceListRow[];
  const aliasCounts = new Map<string, number>();
  for (const alias of aliasCountRes.data ?? []) {
    aliasCounts.set(alias.service_id, (aliasCounts.get(alias.service_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="Normalized appointment and revenue categories. Future Setmore/Acuity imports match rows to services through their source aliases."
        actions={
          canManage ? (
            <Link
              href="/performance-operations/configuration/services/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Add service
            </Link>
          ) : undefined
        }
      />
      {services.length === 0 ? (
        <EmptyState
          title="No services configured yet"
          description="Create services from the real service list (docs/INPUTS_REQUIRED.md #7). Each service needs source aliases before imports can match appointments to it."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Aliases</th>
                <th className="px-4 py-2 font-medium">Effective</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-2.5">
                    <Link href={`/performance-operations/configuration/services/${service.id}`} className="font-medium text-ink hover:text-accent">
                      {service.display_name}
                    </Link>
                    <p className="font-mono text-xs text-ink-muted">{service.internal_name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{service.organizations?.name}</td>
                  <td className="px-4 py-2.5 text-ink-secondary">{service.service_categories?.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                    {service.default_duration_minutes} min
                  </td>
                  <td className="px-4 py-2.5">
                    {aliasCounts.get(service.id) ? (
                      <span className="text-ink-secondary">{aliasCounts.get(service.id)}</span>
                    ) : (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                        None
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                    {service.effective_from} → {service.effective_to ?? "present"}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={service.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
