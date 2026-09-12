import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getActorContext } from "@/lib/actions/shared";
import { humanize } from "@/lib/schemas/compensation";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Compensation plans" };

export default async function CompensationPage() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Compensation plans" />;

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const canRead = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "compensation:read")
  );
  if (!canRead) return <PermissionDenied title="Compensation plans" />;
  const canManage = orgIds.some((orgId) =>
    hasPermissionInOrganization(context.memberships, orgId, "compensation:manage")
  );

  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Compensation plans" />;

  const [plansRes, versionsRes] = await Promise.all([
    actor.supabase
      .from("compensation_plans")
      .select("id, name, description, status, organization_id, organizations ( name )")
      .in("organization_id", orgIds)
      .order("name"),
    actor.supabase
      .from("compensation_plan_versions")
      .select("plan_id, version_number, status, compensation_method")
      .in("organization_id", orgIds)
      .order("version_number", { ascending: false }),
  ]);

  interface PlanRow {
    id: string;
    name: string;
    description: string;
    status: string;
    organization_id: string;
    organizations: { name: string } | null;
  }
  const plans = (plansRes.data ?? []) as unknown as PlanRow[];
  const versions = versionsRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compensation plans"
        description="Versioned compensation configuration. Rates are stored as basis points, money as integer cents. No payroll is calculated in this phase."
        actions={
          canManage ? (
            <Link href="/performance-operations/configuration/compensation/new"
              className="inline-flex h-9 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
              New plan
            </Link>
          ) : undefined
        }
      />

      <div className="rounded-[--radius-card] border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
        <strong className="font-semibold">Examples (not records):</strong> a
        50% commission = 5000 basis points; a $45.00 session rate = 4500
        cents; a tiered plan might pay 5000 bp below $10,000.00 and 5500 bp
        above it. These illustrations create nothing — no trainer compensation
        is seeded until the business rules in docs/INPUTS_REQUIRED.md are
        confirmed.
      </div>

      {plans.length === 0 ? (
        <EmptyState
          title="No compensation plans yet"
          description="Create plans once compensation rules are confirmed (docs/INPUTS_REQUIRED.md #8). Unresolved questions — cliff vs marginal tiers, commission-eligible revenue, cancellation pay — are tracked in docs/DECISION_LOG.md."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Latest version</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const latest = versions.find((v) => v.plan_id === plan.id);
                return (
                  <tr key={plan.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-2.5">
                      <Link href={`/performance-operations/configuration/compensation/${plan.id}`}
                        className="font-medium text-ink hover:text-accent">
                        {plan.name}
                      </Link>
                      {plan.description && (
                        <p className="text-xs text-ink-muted">{plan.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{plan.organizations?.name}</td>
                    <td className="px-4 py-2.5">
                      {latest ? (
                        <span className="text-ink-secondary">
                          v{latest.version_number}{" "}
                          <StatusBadge status={latest.status} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {latest ? humanize(latest.compensation_method) : "—"}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={plan.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
