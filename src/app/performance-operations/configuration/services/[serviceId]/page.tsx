import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { ServiceForm } from "@/components/services/service-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  endServiceDepartmentAssignment,
  removeServiceAlias,
  updateService,
} from "@/lib/actions/services";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { AddAliasForm, AddServiceDeptForm } from "./alias-form";

export const metadata: Metadata = { title: "Service" };

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Service" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Service" />;

  const { data: service } = await actor.supabase
    .from("services")
    .select("*, organizations ( name )")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service) notFound();

  const canManage = hasPermissionInOrganization(
    context.memberships,
    service.organization_id,
    "service:manage"
  );

  const [aliasesRes, deptAssignRes, categoriesRes, departmentsRes] =
    await Promise.all([
      actor.supabase
        .from("service_source_aliases")
        .select("id, source, alias")
        .eq("service_id", serviceId)
        .order("source"),
      actor.supabase
        .from("service_department_assignments")
        .select("id, effective_from, effective_to, departments ( name ), department_id")
        .eq("service_id", serviceId)
        .order("effective_from", { ascending: false }),
      actor.supabase
        .from("service_categories")
        .select("id, name")
        .eq("organization_id", service.organization_id)
        .eq("status", "active")
        .order("sort_order"),
      actor.supabase
        .from("departments")
        .select("id, name")
        .eq("organization_id", service.organization_id)
        .eq("status", "active")
        .order("name"),
    ]);

  interface DeptAssign {
    id: string;
    effective_from: string;
    effective_to: string | null;
    department_id: string;
    departments: { name: string } | null;
  }
  const aliases = aliasesRes.data ?? [];
  const deptAssignments = (deptAssignRes.data ?? []) as unknown as DeptAssign[];
  const activeDeptIds = new Set(
    deptAssignments.filter((a) => a.effective_to === null).map((a) => a.department_id)
  );

  const orgName =
    (service.organizations as unknown as { name: string } | null)?.name ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={service.display_name}
        description={`${orgName} · ${service.internal_name}`}
        actions={<StatusBadge status={service.status} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Source aliases" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Source aliases</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Import rows whose service text matches an alias map to this
              service. One alias maps to one service per source.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs uppercase text-ink-muted">
                    {alias.source}
                  </td>
                  <td className="px-4 py-2 text-ink">{alias.alias}</td>
                  <td className="px-4 py-2 text-right">
                    {canManage && (
                      <form action={removeServiceAlias} className="inline">
                        <input type="hidden" name="aliasId" value={alias.id} />
                        <button type="submit"
                          className="h-7 rounded-[--radius-control] border border-border px-2 text-xs text-negative hover:bg-negative-soft">
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {aliases.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-sm text-warning" colSpan={3}>
                    No aliases yet — imports cannot match this service until at
                    least one alias exists.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {canManage && (
            <div className="border-t border-border px-4 py-3">
              <AddAliasForm serviceId={service.id} />
            </div>
          )}
        </section>

        <section aria-label="Department assignments" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Department assignments</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {deptAssignments.map((assignment) => (
                <tr key={assignment.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">
                    {assignment.departments?.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                    {assignment.effective_from} → {assignment.effective_to ?? "present"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {assignment.effective_to === null && canManage && (
                      <form action={endServiceDepartmentAssignment} className="inline">
                        <input type="hidden" name="assignmentId" value={assignment.id} />
                        <button type="submit"
                          className="h-7 rounded-[--radius-control] border border-border px-2 text-xs text-negative hover:bg-negative-soft">
                          End
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {deptAssignments.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-sm text-ink-muted" colSpan={3}>
                    Not assigned to any department.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {canManage && (
            <div className="border-t border-border px-4 py-3">
              <AddServiceDeptForm
                serviceId={service.id}
                departments={(departmentsRes.data ?? []).filter(
                  (d) => !activeDeptIds.has(d.id)
                )}
              />
            </div>
          )}
        </section>
      </div>

      {canManage && (
        <section aria-label="Edit service" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Edit service</h2>
          <ServiceForm
            action={updateService}
            submitLabel="Save changes"
            serviceId={service.id}
            organizationLocked
            organizations={[{ id: service.organization_id, name: orgName }]}
            categoriesByOrg={{
              [service.organization_id]: categoriesRes.data ?? [],
            }}
            departmentsByOrg={{ [service.organization_id]: [] }}
            defaults={{
              organizationId: service.organization_id,
              categoryId: service.category_id,
              internalName: service.internal_name,
              displayName: service.display_name,
              description: service.description,
              defaultDurationMinutes: service.default_duration_minutes,
              status: service.status,
              effectiveFrom: service.effective_from,
              effectiveTo: service.effective_to ?? "",
              flags: {
                countsAsSession: service.counts_as_session,
                countsAsCoachingHours: service.counts_as_coaching_hours,
                payrollEligible: service.payroll_eligible,
                revenueEligible: service.revenue_eligible,
                isEvaluation: service.is_evaluation,
                isTeamTraining: service.is_team_training,
                isNutrition: service.is_nutrition,
                isGroupTraining: service.is_group_training,
              },
            }}
          />
        </section>
      )}
    </div>
  );
}
