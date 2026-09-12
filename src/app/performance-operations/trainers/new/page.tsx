import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { TrainerForm } from "@/components/trainers/trainer-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { createTrainer } from "@/lib/actions/trainers";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Add trainer" };

export default async function NewTrainerPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Add trainer" />;

  const manageableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "trainer:manage")
  );
  if (manageableOrgs.length === 0) return <PermissionDenied title="Add trainer" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Add trainer" />;

  const { data: departments } = await actor.supabase
    .from("departments")
    .select("id, name, organization_id")
    .in("organization_id", manageableOrgs.map((o) => o.id))
    .eq("status", "active")
    .order("name");

  const departmentsByOrg: Record<string, { id: string; name: string }[]> = {};
  for (const dept of departments ?? []) {
    (departmentsByOrg[dept.organization_id] ??= []).push({
      id: dept.id,
      name: dept.name,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add trainer"
        description="Creates the trainer identity plus an effective-dated assignment in the selected organization. Duplicates are detected by email and scheduling-system IDs."
      />
      <TrainerForm
        action={createTrainer}
        submitLabel="Create trainer"
        organizations={manageableOrgs}
        departmentsByOrg={departmentsByOrg}
      />
    </div>
  );
}
