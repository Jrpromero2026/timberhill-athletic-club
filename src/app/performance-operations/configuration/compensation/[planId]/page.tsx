import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AddRuleForm,
  AddTierForm,
  NewVersionButton,
  PublishVersionButton,
} from "@/components/compensation/version-editors";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { deleteRule, deleteTier } from "@/lib/actions/compensation";
import { getActorContext } from "@/lib/actions/shared";
import { formatBasisPoints, formatCents } from "@/lib/money/money";
import { humanize } from "@/lib/schemas/compensation";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Compensation plan" };

export default async function CompensationPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return <PermissionDenied title="Compensation plan" />;
  const actor = await getActorContext();
  if (!actor) return <PermissionDenied title="Compensation plan" />;

  const { data: plan } = await actor.supabase
    .from("compensation_plans")
    .select("*, organizations ( name )")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) notFound();

  const canManage = hasPermissionInOrganization(
    context.memberships,
    plan.organization_id,
    "compensation:manage"
  );

  const [versionsRes, tiersRes, rulesRes, assignmentCountRes] = await Promise.all([
    actor.supabase
      .from("compensation_plan_versions")
      .select("*")
      .eq("plan_id", planId)
      .order("version_number", { ascending: false }),
    actor.supabase
      .from("commission_tiers")
      .select("*")
      .eq("organization_id", plan.organization_id)
      .order("sequence"),
    actor.supabase
      .from("compensation_rules")
      .select("*")
      .eq("organization_id", plan.organization_id),
    actor.supabase
      .from("trainer_compensation_assignments")
      .select("id, plan_version_id", { count: "exact" })
      .eq("organization_id", plan.organization_id),
  ]);

  const versions = versionsRes.data ?? [];
  const allTiers = tiersRes.data ?? [];
  const allRules = rulesRes.data ?? [];
  const assignments = assignmentCountRes.data ?? [];

  const orgName =
    (plan.organizations as unknown as { name: string } | null)?.name ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.name}
        description={`${orgName}${plan.description ? ` · ${plan.description}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={plan.status} />
            {canManage && <NewVersionButton planId={plan.id} />}
          </div>
        }
      />

      {versions.map((version) => {
        const tiers = allTiers.filter((t) => t.plan_version_id === version.id);
        const rules = allRules.filter((r) => r.plan_version_id === version.id);
        const versionAssignments = assignments.filter(
          (a) => a.plan_version_id === version.id
        ).length;
        const editable = canManage && version.status === "draft";

        return (
          <section
            key={version.id}
            aria-label={`Version ${version.version_number}`}
            className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">
                Version {version.version_number}
              </h2>
              <StatusBadge status={version.status} />
              <span className="text-xs text-ink-secondary">
                {humanize(version.compensation_method)} · tiers:{" "}
                {humanize(version.tier_behavior)}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                {version.effective_from} → {version.effective_to ?? "open"}
              </span>
              {versionAssignments > 0 && (
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
                  {versionAssignments} trainer assignment{versionAssignments === 1 ? "" : "s"}
                </span>
              )}
              <div className="ml-auto">
                {editable && <PublishVersionButton versionId={version.id} />}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Rules
                </h3>
                {rules.length === 0 ? (
                  <p className="text-sm text-ink-muted">No rules.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 text-ink">{humanize(rule.rule_type)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-ink">
                            {rule.amount_cents !== null
                              ? formatCents(rule.amount_cents)
                              : formatBasisPoints(rule.rate_basis_points ?? 0)}
                          </td>
                          <td className="py-1.5 text-right">
                            {editable && (
                              <form action={deleteRule} className="inline">
                                <input type="hidden" name="ruleId" value={rule.id} />
                                <button type="submit"
                                  className="h-7 rounded-[--radius-control] border border-border px-2 text-xs text-negative hover:bg-negative-soft">
                                  Remove
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {editable && (
                  <div className="mt-3 border-t border-border pt-3">
                    <AddRuleForm versionId={version.id} />
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Commission tiers
                </h3>
                {tiers.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    {version.tier_behavior === "not_applicable"
                      ? "Tiers not applicable for this version."
                      : "No tiers configured yet."}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                        <th className="py-1 pr-2 font-medium">Seq</th>
                        <th className="py-1 pr-2 font-medium">Eligible revenue</th>
                        <th className="py-1 pr-2 text-right font-medium">Rate</th>
                        <th className="py-1 font-medium sr-only">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier) => (
                        <tr key={tier.id} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 font-mono text-xs text-ink-muted">{tier.sequence}</td>
                          <td className="py-1.5 pr-2 font-mono text-ink">
                            {formatCents(tier.min_revenue_cents)} –{" "}
                            {tier.max_revenue_cents !== null
                              ? formatCents(tier.max_revenue_cents)
                              : "∞"}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono text-ink">
                            {formatBasisPoints(tier.rate_basis_points)}
                          </td>
                          <td className="py-1.5 text-right">
                            {editable && (
                              <form action={deleteTier} className="inline">
                                <input type="hidden" name="tierId" value={tier.id} />
                                <button type="submit"
                                  className="h-7 rounded-[--radius-control] border border-border px-2 text-xs text-negative hover:bg-negative-soft">
                                  Remove
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {editable && version.tier_behavior !== "not_applicable" && (
                  <div className="mt-3 border-t border-border pt-3">
                    <AddTierForm
                      versionId={version.id}
                      nextSequence={(tiers.at(-1)?.sequence ?? 0) + 1}
                    />
                  </div>
                )}
              </div>
            </div>

            {version.status !== "draft" && (
              <p className="border-t border-border px-4 py-2.5 text-xs text-ink-muted">
                This version is {version.status} and its substance is frozen.
                To change rates, create a new draft version — historical
                payroll will keep referencing this one.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
