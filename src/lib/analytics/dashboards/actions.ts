"use server";

/**
 * Dashboard server actions. Dashboards are configuration only: widget
 * configs validate against the closed schema on every write; sharing and
 * ownership are enforced by database triggers + RLS underneath these
 * checks. Rendering never trusts stored config either — it re-validates
 * and re-resolves per viewer.
 */

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  writeAudit,
  actorCan,
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  type ActionState,
} from "@/lib/actions/shared";
import { validateWidgetConfig, WIDGET_TYPES } from "./widgets";

export async function createDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!actorCan(actor, organizationId, "dashboard:create")) return PERMISSION_DENIED;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the dashboard a name (max 120 characters)." };

  const { data: created, error } = await actor.supabase
    .from("analytics_dashboards")
    .insert({
      organization_id: organizationId,
      owner_id: actor.userId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      status: "active",
      shared_scope: "personal",
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error?.code === "23505") return { error: "You already have a dashboard with this name." };
    return { error: `Could not create the dashboard (${error?.message ?? "unknown"}).` };
  }
  await writeAudit(actor, {
    organizationId,
    entityType: "analytics_dashboard",
    entityId: created.id,
    action: "dashboard_created",
    metadata: { name },
  });
  revalidatePath("/performance-operations/analytics/dashboards");
  return { message: "Dashboard created.", data: { dashboardId: created.id } };
}

export async function renameDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Provide a name (max 120 characters)." };
  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("id, organization_id")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard) return { error: "Dashboard not found." };
  const { error } = await actor.supabase
    .from("analytics_dashboards")
    .update({ name, description: String(formData.get("description") ?? "").trim() || null })
    .eq("id", dashboardId);
  if (error) return { error: `Could not rename (${error.message.slice(0, 120)}).` };
  await writeAudit(actor, {
    organizationId: dashboard.organization_id,
    entityType: "analytics_dashboard",
    entityId: dashboardId,
    action: "dashboard_updated",
    metadata: { name },
  });
  revalidatePath(`/performance-operations/analytics/dashboards/${dashboardId}`);
  return { message: "Dashboard updated." };
}

export async function shareDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  if (!["personal", "department", "organization"].includes(scope)) {
    return { error: "Choose a sharing scope." };
  }
  if (scope === "department" && !departmentId) return { error: "Choose the department to share with." };
  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("id, organization_id, shared_scope")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard) return { error: "Dashboard not found." };
  const { error } = await actor.supabase
    .from("analytics_dashboards")
    .update({
      shared_scope: scope,
      department_id: scope === "department" ? departmentId : null,
    })
    .eq("id", dashboardId);
  if (error) {
    if (error.message.includes("dashboard_forbidden")) {
      await writeAudit(actor, {
        organizationId: dashboard.organization_id,
        entityType: "analytics_dashboard",
        entityId: dashboardId,
        action: "dashboard_share_denied",
        metadata: { requested_scope: scope },
      });
      return { error: "You do not have permission to share at that scope." };
    }
    return { error: `Could not update sharing (${error.message.slice(0, 120)}).` };
  }
  await writeAudit(actor, {
    organizationId: dashboard.organization_id,
    entityType: "analytics_dashboard",
    entityId: dashboardId,
    action: "dashboard_shared",
    metadata: { from_scope: dashboard.shared_scope, to_scope: scope },
  });
  revalidatePath(`/performance-operations/analytics/dashboards/${dashboardId}`);
  return { message: `Sharing set to ${scope}.` };
}

export async function archiveDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const restore = formData.get("restore") === "true";
  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("id, organization_id")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard) return { error: "Dashboard not found." };
  const { error } = await actor.supabase
    .from("analytics_dashboards")
    .update({ status: restore ? "active" : "archived" })
    .eq("id", dashboardId);
  if (error) return { error: `Could not update (${error.message.slice(0, 120)}).` };
  await writeAudit(actor, {
    organizationId: dashboard.organization_id,
    entityType: "analytics_dashboard",
    entityId: dashboardId,
    action: restore ? "dashboard_restored" : "dashboard_archived",
  });
  revalidatePath("/performance-operations/analytics/dashboards");
  return { message: restore ? "Dashboard restored." : "Dashboard archived (its history is preserved)." };
}

export async function duplicateDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const { data: source } = await actor.supabase
    .from("analytics_dashboards")
    .select("*")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!source) return { error: "Dashboard not found." };
  if (!actorCan(actor, source.organization_id, "dashboard:create")) return PERMISSION_DENIED;

  const { data: copy, error } = await actor.supabase
    .from("analytics_dashboards")
    .insert({
      organization_id: source.organization_id,
      owner_id: actor.userId,
      name: `${source.name} (copy)`.slice(0, 120),
      description: source.description,
      status: "active",
      shared_scope: "personal", // copies never inherit sharing
      config: source.config,
    })
    .select("id")
    .single();
  if (error || !copy) {
    if (error?.code === "23505") return { error: "You already have a copy with this name — rename it first." };
    return { error: `Could not duplicate (${error?.message ?? "unknown"}).` };
  }

  const { data: widgets } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("widget_type, position, width, height, metric_id, goal_id, benchmark_id, config")
    .eq("dashboard_id", dashboardId)
    .order("position");
  if (widgets && widgets.length > 0) {
    await actor.supabase.from("analytics_dashboard_widgets").insert(
      widgets.map((w) => ({
        dashboard_id: copy.id,
        organization_id: source.organization_id,
        widget_type: w.widget_type,
        position: w.position,
        width: w.width,
        height: w.height,
        metric_id: w.metric_id,
        goal_id: w.goal_id,
        benchmark_id: w.benchmark_id,
        config: w.config,
      })),
    );
  }
  await writeAudit(actor, {
    organizationId: source.organization_id,
    entityType: "analytics_dashboard",
    entityId: copy.id,
    action: "dashboard_duplicated",
    metadata: { source_dashboard_id: dashboardId },
  });
  revalidatePath("/performance-operations/analytics/dashboards");
  return { message: "Dashboard duplicated as a personal copy.", data: { dashboardId: copy.id } };
}

/** Which posted form fields belong in each widget type's config. */
const CONFIG_FIELDS: Record<string, string[]> = {
  metric: ["metricId"],
  comparison: ["metricId", "comparison"],
  trend: ["metricId", "chart"],
  breakdown_table: ["metricId", "groupBy", "comparison"],
  breakdown_chart: ["metricId", "groupBy", "chart"],
  goal_progress: ["goalId"],
  benchmark_comparison: ["benchmarkId"],
  scorecard: ["scorecardKey"],
  cohort_table: [],
  cohort_heatmap: [],
  readiness: [],
  executive_summary: [],
  operational_alert: [],
  text_note: ["text"],
  report_link: ["label", "path"],
};

export async function addWidgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const widgetType = String(formData.get("widgetType") ?? "");
  if (!WIDGET_TYPES.includes(widgetType as (typeof WIDGET_TYPES)[number])) {
    return { error: "Unknown widget type." };
  }
  // Assemble the config from the CLOSED per-type field list — nothing a
  // form posts outside it ever reaches the stored config.
  const config: Record<string, string> = {};
  for (const field of CONFIG_FIELDS[widgetType] ?? []) {
    const value = formData.get(field);
    if (typeof value === "string" && value.trim() !== "") config[field] = value;
  }
  const validation = validateWidgetConfig(widgetType, config);
  if (!validation.ok) return { error: `Invalid widget configuration: ${validation.error}` };

  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("id, organization_id")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard) return { error: "Dashboard not found." };

  const { count } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("id", { count: "exact", head: true })
    .eq("dashboard_id", dashboardId);

  const { error } = await actor.supabase.from("analytics_dashboard_widgets").insert({
    dashboard_id: dashboardId,
    organization_id: dashboard.organization_id,
    widget_type: widgetType,
    position: count ?? 0,
    metric_id: config.metricId ?? null,
    goal_id: config.goalId ?? null,
    benchmark_id: config.benchmarkId ?? null,
    config: config as never,
  });
  if (error) return { error: `Could not add the widget (${error.message.slice(0, 120)}).` };
  revalidatePath(`/performance-operations/analytics/dashboards/${dashboardId}`);
  return { message: "Widget added." };
}

export async function removeWidgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const widgetId = String(formData.get("widgetId") ?? "");
  const { data: widget } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("id, dashboard_id")
    .eq("id", widgetId)
    .maybeSingle();
  if (!widget) return { error: "Widget not found." };
  const { error } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .delete()
    .eq("id", widgetId);
  if (error) return { error: `Could not remove the widget (${error.message.slice(0, 120)}).` };
  revalidatePath(`/performance-operations/analytics/dashboards/${widget.dashboard_id}`);
  return { message: "Widget removed." };
}

export async function moveWidgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const widgetId = String(formData.get("widgetId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Invalid move." };
  const { data: widget } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("id, dashboard_id, position")
    .eq("id", widgetId)
    .maybeSingle();
  if (!widget) return { error: "Widget not found." };
  const { data: siblings } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("id, position")
    .eq("dashboard_id", widget.dashboard_id)
    .order("position");
  const ordered = siblings ?? [];
  const index = ordered.findIndex((w) => w.id === widgetId);
  const swapWith = direction === "up" ? ordered[index - 1] : ordered[index + 1];
  if (!swapWith) return { message: "Nothing to swap with." };
  await actor.supabase
    .from("analytics_dashboard_widgets")
    .update({ position: swapWith.position })
    .eq("id", widget.id);
  await actor.supabase
    .from("analytics_dashboard_widgets")
    .update({ position: widget.position })
    .eq("id", swapWith.id);
  revalidatePath(`/performance-operations/analytics/dashboards/${widget.dashboard_id}`);
  return { message: "Widget moved." };
}

export async function resizeWidgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const widgetId = String(formData.get("widgetId") ?? "");
  const width = Number(formData.get("width"));
  if (![1, 2, 3, 4].includes(width)) return { error: "Width must be 1–4 columns." };
  const { data: widget } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .select("id, dashboard_id")
    .eq("id", widgetId)
    .maybeSingle();
  if (!widget) return { error: "Widget not found." };
  const { error } = await actor.supabase
    .from("analytics_dashboard_widgets")
    .update({ width })
    .eq("id", widgetId);
  if (error) return { error: `Could not resize (${error.message.slice(0, 120)}).` };
  revalidatePath(`/performance-operations/analytics/dashboards/${widget.dashboard_id}`);
  return { message: "Widget resized." };
}

export async function setDefaultDashboardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const scope = String(formData.get("scope") ?? "personal");
  if (scope !== "personal" && scope !== "organization") return { error: "Invalid default scope." };
  const { data: dashboard } = await actor.supabase
    .from("analytics_dashboards")
    .select("id, organization_id")
    .eq("id", dashboardId)
    .maybeSingle();
  if (!dashboard) return { error: "Dashboard not found." };
  if (scope === "organization" && !actorCan(actor, dashboard.organization_id, "dashboard:set_default")) {
    return PERMISSION_DENIED;
  }
  // Upsert-by-delete: the partial unique indexes guarantee one default.
  let clear = actor.supabase
    .from("analytics_dashboard_defaults")
    .delete()
    .eq("organization_id", dashboard.organization_id)
    .eq("scope", scope);
  if (scope === "personal") clear = clear.eq("profile_id", actor.userId);
  await clear;
  const { error } = await actor.supabase.from("analytics_dashboard_defaults").insert({
    organization_id: dashboard.organization_id,
    scope,
    profile_id: scope === "personal" ? actor.userId : null,
    dashboard_id: dashboardId,
    set_by: actor.userId,
  });
  if (error) return { error: `Could not set the default (${error.message.slice(0, 120)}).` };
  await writeAudit(actor, {
    organizationId: dashboard.organization_id,
    entityType: "analytics_dashboard",
    entityId: dashboardId,
    action: "dashboard_default_set",
    metadata: { scope },
  });
  revalidatePath("/performance-operations/analytics/dashboards");
  return { message: scope === "personal" ? "Set as your default dashboard." : "Set as the organization default." };
}
