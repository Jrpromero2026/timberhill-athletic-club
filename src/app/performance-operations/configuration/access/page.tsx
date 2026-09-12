import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { getActorContext } from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Roles & Permissions" };

/**
 * Read-only view of the role/permission catalog as it exists in the
 * database (the catalog itself is platform-managed; grants are seeded).
 */
export default async function AccessPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Roles & Permissions" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Roles & Permissions" />;

  const [rolesRes, permissionsRes, grantsRes] = await Promise.all([
    actor.supabase
      .from("roles")
      .select("id, key, name, description, department_scoped")
      .order("name"),
    actor.supabase.from("permissions").select("id, key, description").order("key"),
    actor.supabase.from("role_permissions").select("role_id, permission_id"),
  ]);

  const roles = rolesRes.data ?? [];
  const permissions = permissionsRes.data ?? [];
  const grants = new Set(
    (grantsRes.data ?? []).map((g) => `${g.role_id}:${g.permission_id}`)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="The platform's deny-by-default authorization catalog. Roles are granted per organization through memberships; nothing not listed here is permitted."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{role.name}</h2>
              {role.department_scoped && (
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
                  Department-scoped
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-secondary">{role.description}</p>
            <p className="mt-2 font-mono text-[11px] text-ink-muted">{role.key}</p>
          </div>
        ))}
      </div>

      <section
        aria-label="Permission matrix"
        className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Permission matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-2 py-2 text-center font-medium">
                    {role.name.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-1.5">
                    <span className="font-mono text-xs text-ink">{permission.key}</span>
                  </td>
                  {roles.map((role) => (
                    <td key={role.id} className="px-2 py-1.5 text-center">
                      {grants.has(`${role.id}:${permission.id}`) ? (
                        <span className="text-positive" aria-label="granted">
                          ●
                        </span>
                      ) : (
                        <span className="text-border-strong" aria-label="denied">
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
