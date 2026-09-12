import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { endTrainerCompensationAssignment } from "@/lib/actions/compensation";
import { getActorContext } from "@/lib/actions/shared";
import { humanize } from "@/lib/schemas/compensation";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { AssignCompensationForm, type VersionOption } from "./assign-form";

export const metadata: Metadata = { title: "Trainer compensation" };

export default async function TrainerCompensationPage({
  params,
}: {
  params: Promise<{ trainerId: string }>;
}) {
  const { trainerId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Trainer compensation" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Trainer compensation" />;

  const { data: trainer } = await actor.supabase
    .from("trainers")
    .select("id, display_name")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) notFound();

  const { data: orgAssignments } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("organization_id, organizations ( name )")
    .eq("trainer_id", trainerId)
    .is("effective_to", null);

  const trainerOrgIds = (orgAssignments ?? []).map((a) => a.organization_id);
  const canRead = trainerOrgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "compensation:read")
  );
  if (!canRead) return <PermissionDenied title="Trainer compensation" />;
  const canManage = trainerOrgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "compensation:manage")
  );

  const [assignmentsRes, versionsRes] = await Promise.all([
    actor.supabase
      .from("trainer_compensation_assignments")
      .select(
        "id, purpose, effective_from, effective_to, organization_id, organizations:organization_id ( name ), compensation_plan_versions ( version_number, compensation_method, compensation_plans ( name ) )"
      )
      .eq("trainer_id", trainerId)
      .order("effective_from", { ascending: false }),
    actor.supabase
      .from("compensation_plan_versions")
      .select("id, version_number, organization_id, compensation_plans ( name ), organizations:organization_id ( name )")
      .in("organization_id", trainerOrgIds.length ? trainerOrgIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "published")
      .order("version_number", { ascending: false }),
  ]);

  interface AssignmentRow {
    id: string;
    purpose: string;
    effective_from: string;
    effective_to: string | null;
    organization_id: string;
    organizations: { name: string } | null;
    compensation_plan_versions: {
      version_number: number;
      compensation_method: string;
      compensation_plans: { name: string } | null;
    } | null;
  }
  interface VersionRow {
    id: string;
    version_number: number;
    organization_id: string;
    compensation_plans: { name: string } | null;
    organizations: { name: string } | null;
  }

  const assignments = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
  const publishedVersions = (versionsRes.data ?? []) as unknown as VersionRow[];

  const versionOptions: VersionOption[] = publishedVersions
    .filter((v) =>
      hasPermissionInOrganization(context.memberships, v.organization_id, "compensation:manage")
    )
    .map((v) => ({
      id: v.id,
      label: `${v.organizations?.name ?? ""} — ${v.compensation_plans?.name ?? "Plan"} v${v.version_number}`,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Compensation — ${trainer.display_name}`}
        description="Effective-dated assignments to published plan versions. Overlaps per organization and purpose are rejected; history is never mutated."
        actions={
          <Link href={`/performance-operations/trainers/${trainer.id}`}
            className="inline-flex h-9 items-center rounded-[--radius-control] border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:border-border-strong">
            Back to trainer
          </Link>
        }
      />

      <section aria-label="Assignments" className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Assignments</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-medium">Plan version</th>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Purpose</th>
              <th className="px-4 py-2 font-medium">Effective</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink">
                  {assignment.compensation_plan_versions?.compensation_plans?.name}{" "}
                  v{assignment.compensation_plan_versions?.version_number}
                  <p className="text-xs text-ink-muted">
                    {humanize(assignment.compensation_plan_versions?.compensation_method ?? "")}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-ink-secondary">{assignment.organizations?.name}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{humanize(assignment.purpose)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                  {assignment.effective_from} → {assignment.effective_to ?? "present"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {assignment.effective_to === null &&
                    hasPermissionInOrganization(
                      context.memberships,
                      assignment.organization_id,
                      "compensation:manage"
                    ) && (
                      <form action={endTrainerCompensationAssignment} className="inline">
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
            {assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No compensation assignments yet. Payroll cannot run for this
                  trainer until one exists.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {canManage && (
        <section aria-label="New assignment" className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">New assignment</h2>
          <AssignCompensationForm trainerId={trainer.id} versionOptions={versionOptions} />
        </section>
      )}
    </div>
  );
}
