import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { ServiceForm } from "@/components/services/service-form";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { createService } from "@/lib/actions/services";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Add service" };

export default async function NewServicePage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Add service" />;

  const manageableOrgs = context.options.filter((org) =>
    hasPermissionInOrganization(context.memberships, org.id, "service:manage")
  );
  if (manageableOrgs.length === 0) return <PermissionDenied title="Add service" />;

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Add service" />;

  const orgIds = manageableOrgs.map((o) => o.id);
  const [categoriesRes, departmentsRes] = await Promise.all([
    actor.supabase
      .from("service_categories")
      .select("id, name, organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active")
      .order("sort_order"),
    actor.supabase
      .from("departments")
      .select("id, name, organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active")
      .order("name"),
  ]);

  const categoriesByOrg: Record<string, { id: string; name: string }[]> = {};
  for (const cat of categoriesRes.data ?? []) {
    (categoriesByOrg[cat.organization_id] ??= []).push({ id: cat.id, name: cat.name });
  }
  const departmentsByOrg: Record<string, { id: string; name: string }[]> = {};
  for (const dept of departmentsRes.data ?? []) {
    (departmentsByOrg[dept.organization_id] ??= []).push({ id: dept.id, name: dept.name });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add service"
        description="Define the internal service; add its Setmore/Acuity aliases afterward from the service page."
      />
      <ServiceForm
        action={createService}
        submitLabel="Create service"
        organizations={manageableOrgs}
        categoriesByOrg={categoriesByOrg}
        departmentsByOrg={departmentsByOrg}
      />
    </div>
  );
}
