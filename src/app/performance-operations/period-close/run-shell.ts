import { getActorContext, type ActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext, type WorkspaceContext } from "@/lib/workspace/server";
import type { Tables } from "@/lib/supabase/types";

export interface CloseRunShell {
  actor: ActorContext;
  context: WorkspaceContext;
  run: Tables<"period_close_runs">;
  period: Tables<"reporting_periods"> | null;
  organizationName: string;
  can: (permission: Parameters<typeof hasPermissionInOrganization>[2]) => boolean;
}

/** Shared gate + load for every close-run page. Null → denied/not found. */
export async function loadCloseRunShell(
  closeRunId: string,
): Promise<CloseRunShell | null> {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") return null;
  const actor = await getActorContext();
  if (!actor) return null;
  const { data: run } = await actor.supabase
    .from("period_close_runs")
    .select("*")
    .eq("id", closeRunId)
    .maybeSingle();
  if (!run) return null;
  const can = (permission: Parameters<typeof hasPermissionInOrganization>[2]) =>
    hasPermissionInOrganization(context.memberships, run.organization_id, permission);
  if (!can("period_close:read")) return null;
  const [{ data: period }, { data: organization }] = await Promise.all([
    actor.supabase
      .from("reporting_periods")
      .select("*")
      .eq("id", run.reporting_period_id)
      .maybeSingle(),
    actor.supabase
      .from("organizations")
      .select("name")
      .eq("id", run.organization_id)
      .maybeSingle(),
  ]);
  return {
    actor,
    context,
    run,
    period: period ?? null,
    organizationName: organization?.name ?? "",
    can,
  };
}

export const CLOSE_BADGE: Record<string, string> = {
  close_review: "closed",
  ready_to_close: "open",
  closing: "open",
  closed: "active",
  superseded: "inactive",
  voided: "inactive",
};
