import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { TrainerForm } from "@/components/trainers/trainer-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { updateTrainer } from "@/lib/actions/trainers";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Edit trainer" };

export default async function EditTrainerPage({
  params,
}: {
  params: Promise<{ trainerId: string }>;
}) {
  const { trainerId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Edit trainer" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Edit trainer" />;

  const { data: trainer } = await actor.supabase
    .from("trainers")
    .select("*")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) notFound();

  const { data: assignments } = await actor.supabase
    .from("trainer_organization_assignments")
    .select("organization_id")
    .eq("trainer_id", trainerId);
  const canManage = (assignments ?? []).some((a) =>
    hasPermissionInOrganization(context.memberships, a.organization_id, "trainer:manage")
  );
  if (!canManage) return <PermissionDenied title="Edit trainer" />;

  const identifiers = trainer.source_identifiers as Record<string, string>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${trainer.display_name}`}
        description="Material changes are audited. Deactivate rather than delete — trainers with history are never removed."
      />
      <TrainerForm
        action={updateTrainer}
        submitLabel="Save changes"
        trainerId={trainer.id}
        defaults={{
          firstName: trainer.first_name,
          lastName: trainer.last_name,
          displayName: trainer.display_name,
          email: trainer.email ?? "",
          phone: trainer.phone ?? "",
          employmentStatus: trainer.employment_status as
            | "active"
            | "on_leave"
            | "separated",
          hireDate: trainer.hire_date ?? "",
          separationDate: trainer.separation_date ?? "",
          notes: trainer.notes,
          setmoreId: identifiers.setmore ?? "",
          acuityId: identifiers.acuity ?? "",
        }}
      />
    </div>
  );
}
