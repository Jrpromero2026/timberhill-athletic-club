import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import {
  endTrainerDepartmentAssignment,
  endTrainerOrganizationAssignment,
} from "@/lib/actions/trainers";
import { getActorContext } from "@/lib/actions/shared";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { AddDeptAssignmentForm, AddOrgAssignmentForm } from "./assignment-forms";
import { TrainerPerformanceSection } from "./performance-section";

export const metadata: Metadata = { title: "Trainer" };

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ trainerId: string }>;
}) {
  const { trainerId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Trainer" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Trainer" />;

  const { data: trainer } = await actor.supabase
    .from("trainers")
    .select("*")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) notFound();

  const [orgAssignRes, deptAssignRes, compAssignRes] = await Promise.all([
    actor.supabase
      .from("trainer_organization_assignments")
      .select("id, organization_id, title, effective_from, effective_to, organizations ( name )")
      .eq("trainer_id", trainerId)
      .order("effective_from", { ascending: false }),
    actor.supabase
      .from("trainer_department_assignments")
      .select("id, organization_id, effective_from, effective_to, departments ( name ), organizations:organization_id ( name )")
      .eq("trainer_id", trainerId)
      .order("effective_from", { ascending: false }),
    actor.supabase
      .from("trainer_compensation_assignments")
      .select("id, purpose, effective_from, effective_to")
      .eq("trainer_id", trainerId)
      .is("effective_to", null),
  ]);

  interface OrgAssign {
    id: string;
    organization_id: string;
    title: string;
    effective_from: string;
    effective_to: string | null;
    organizations: { name: string } | null;
  }
  interface DeptAssign {
    id: string;
    organization_id: string;
    effective_from: string;
    effective_to: string | null;
    departments: { name: string } | null;
  }

  const orgAssignments = (orgAssignRes.data ?? []) as unknown as OrgAssign[];
  const deptAssignments = (deptAssignRes.data ?? []) as unknown as DeptAssign[];
  const compAssignments = compAssignRes.data ?? [];

  const manageableOrgIds = context.options
    .filter((org) =>
      hasPermissionInOrganization(context.memberships, org.id, "trainer:manage")
    )
    .map((o) => o.id);
  const canManage = manageableOrgIds.length > 0;

  const unassignedOrgs = context.options.filter(
    (org) =>
      manageableOrgIds.includes(org.id) &&
      !orgAssignments.some((a) => a.organization_id === org.id && a.effective_to === null)
  );

  const { data: departments } = await actor.supabase
    .from("departments")
    .select("id, name, organization_id")
    .in("organization_id", manageableOrgIds.length ? manageableOrgIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "active")
    .order("name");
  const departmentsByOrg: Record<string, { id: string; name: string }[]> = {};
  for (const dept of departments ?? []) {
    if (
      deptAssignments.some(
        (a) => a.effective_to === null && a.departments?.name === dept.name && a.organization_id === dept.organization_id
      )
    ) {
      continue;
    }
    (departmentsByOrg[dept.organization_id] ??= []).push({ id: dept.id, name: dept.name });
  }
  const activeOrgOptions = context.options.filter(
    (org) =>
      manageableOrgIds.includes(org.id) &&
      orgAssignments.some((a) => a.organization_id === org.id && a.effective_to === null)
  );

  const identifiers = trainer.source_identifiers as Record<string, string>;
  const periods = await getPeriodContext(context);
  const performanceOrgId =
    context.selection.kind === "organization" ? context.selection.organizationId : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={trainer.display_name}
        description={`${trainer.first_name} ${trainer.last_name}`.trim()}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={trainer.status} />
            {canManage && (
              <>
                <Link
                  href={`/performance-operations/trainers/${trainer.id}/edit`}
                  className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:border-border-strong"
                >
                  Edit
                </Link>
                <Link
                  href={`/performance-operations/trainers/${trainer.id}/compensation`}
                  className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong"
                >
                  Compensation
                </Link>
              </>
            )}
          </div>
        }
      />

      {performanceOrgId && (
        <TrainerPerformanceSection
          actor={actor}
          organizationId={performanceOrgId}
          trainerId={trainer.id}
          period={periods}
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section aria-label="Identity" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">Identity</h2>
          <dl className="space-y-2 text-sm">
            {[
              ["Email", trainer.email ?? "—"],
              ["Phone", trainer.phone ?? "—"],
              ["Employment", trainer.employment_status.replace("_", " ")],
              ["Hire date", trainer.hire_date ?? "—"],
              ["Separation date", trainer.separation_date ?? "—"],
              ["Setmore ID", identifiers.setmore ?? "—"],
              ["Acuity ID", identifiers.acuity ?? "—"],
              ["Login", trainer.profile_id ? "Linked" : "No login access"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {trainer.notes && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-ink-secondary">
              {trainer.notes}
            </p>
          )}
          {compAssignments.length === 0 && (
            <p className="mt-3 rounded-[--radius-control] bg-warning-soft px-3 py-2 text-xs text-warning">
              No active compensation assignment. Payroll cannot be calculated
              for this trainer until one exists.
            </p>
          )}
        </section>

        <section aria-label="Organization assignments" className="xl:col-span-2 space-y-4">
          <div className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Organization assignments</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {orgAssignments.map((assignment) => (
                  <tr key={assignment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {assignment.organizations?.name}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{assignment.title}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {assignment.effective_from} → {assignment.effective_to ?? "present"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {assignment.effective_to === null &&
                        manageableOrgIds.includes(assignment.organization_id) && (
                          <form action={endTrainerOrganizationAssignment} className="inline">
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <button type="submit"
                              className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft">
                              End
                            </button>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
                {orgAssignments.length === 0 && (
                  <tr><td className="px-4 py-6 text-sm text-ink-muted">No assignments.</td></tr>
                )}
              </tbody>
            </table>
            {canManage && unassignedOrgs.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <AddOrgAssignmentForm trainerId={trainer.id} organizations={unassignedOrgs} />
              </div>
            )}
          </div>

          <div className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Department assignments</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {deptAssignments.map((assignment) => (
                  <tr key={assignment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {assignment.departments?.name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {assignment.effective_from} → {assignment.effective_to ?? "present"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {assignment.effective_to === null &&
                        manageableOrgIds.includes(assignment.organization_id) && (
                          <form action={endTrainerDepartmentAssignment} className="inline">
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <button type="submit"
                              className="h-8 rounded-[--radius-control] border border-border px-2.5 text-xs font-medium text-negative hover:bg-negative-soft">
                              End
                            </button>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
                {deptAssignments.length === 0 && (
                  <tr><td className="px-4 py-6 text-sm text-ink-muted">No department assignments.</td></tr>
                )}
              </tbody>
            </table>
            {canManage && (
              <div className="border-t border-border px-4 py-3">
                <AddDeptAssignmentForm
                  trainerId={trainer.id}
                  organizationOptions={activeOrgOptions}
                  departmentsByOrg={departmentsByOrg}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
