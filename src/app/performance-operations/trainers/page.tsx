import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { TrainerTable, type TrainerListRow } from "@/components/trainers/trainer-table";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Trainers" };

export default async function TrainersPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return (
      <div className="space-y-6">
        <PageHeader title="Trainers" description="Trainer registry with per-organization roles and effective-dated assignments." />
        <EmptyState
          title="Trainers require a live environment"
          description="Connect and sign in to the dedicated Supabase project to manage the trainer roster."
        />
      </div>
    );
  }

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "trainer:read")
  );
  if (!canRead) return <PermissionDenied title="Trainers" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Trainers" />;

  const canManage = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "trainer:manage")
  );

  const [orgAssignRes, deptAssignRes] = await Promise.all([
    actor.supabase
      .from("trainer_organization_assignments")
      .select("trainer_id, organization_id, effective_to, organizations ( name ), trainers ( id, display_name, email, employment_status, status, hire_date )")
      .in("organization_id", orgIds)
      .is("effective_to", null),
    actor.supabase
      .from("trainer_department_assignments")
      .select("trainer_id, departments ( name )")
      .in("organization_id", orgIds)
      .is("effective_to", null),
  ]);

  interface OrgAssignRow {
    trainer_id: string;
    organizations: { name: string } | null;
    trainers: {
      id: string;
      display_name: string;
      email: string | null;
      employment_status: string;
      status: string;
      hire_date: string | null;
    } | null;
  }
  interface DeptAssignRow {
    trainer_id: string;
    departments: { name: string } | null;
  }

  const orgAssignments = (orgAssignRes.data ?? []) as unknown as OrgAssignRow[];
  const deptAssignments = (deptAssignRes.data ?? []) as unknown as DeptAssignRow[];

  const byTrainer = new Map<string, TrainerListRow>();
  for (const assignment of orgAssignments) {
    const trainer = assignment.trainers;
    if (!trainer) continue;
    const row =
      byTrainer.get(trainer.id) ??
      ({
        id: trainer.id,
        displayName: trainer.display_name,
        email: trainer.email ?? "",
        employmentStatus: trainer.employment_status,
        status: trainer.status,
        organizations: [],
        departments: [],
        hireDate: trainer.hire_date,
      } satisfies TrainerListRow);
    if (assignment.organizations?.name && !row.organizations.includes(assignment.organizations.name)) {
      row.organizations.push(assignment.organizations.name);
    }
    byTrainer.set(trainer.id, row);
  }
  for (const assignment of deptAssignments) {
    const row = byTrainer.get(assignment.trainer_id);
    const name = assignment.departments?.name;
    if (row && name && !row.departments.includes(name)) {
      row.departments.push(name);
    }
  }
  const rows = [...byTrainer.values()];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trainers"
        description="Trainer registry scoped to the selected workspace. Assignments are effective-dated; history is preserved."
        actions={
          canManage ? (
            <Link
              href="/performance-operations/trainers/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Add trainer
            </Link>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No trainers in this workspace yet"
          description={
            canManage
              ? "Add your first trainer, or provide the trainer roster listed in docs/INPUTS_REQUIRED.md to load the real team."
              : "No trainers are visible for your access level in this workspace."
          }
        />
      ) : (
        <TrainerTable rows={rows} />
      )}
    </div>
  );
}
