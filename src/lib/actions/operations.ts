"use server";

import { revalidatePath } from "next/cache";
import {
  getActorContext,
  actorCan,
  NOT_SIGNED_IN,
  type ActionState,
  type ActorContext,
} from "@/lib/actions/shared";
import type { Json } from "@/lib/supabase/types";

/* ----------------------------------------------------------- search ---- */

export interface SearchResultItem {
  group:
    | "People"
    | "Organizations"
    | "Departments"
    | "Services"
    | "Imports"
    | "Payroll"
    | "Clients";
  label: string;
  sublabel: string;
  href: string;
}

/**
 * Global search — ONE permission-aware implementation shared by the
 * command palette and global search. Every query runs on the actor's own
 * RLS-scoped client; permission checks additionally gate each entity type
 * so results never reveal restricted areas.
 */
export async function searchApp(
  organizationId: string,
  query: string,
): Promise<{ results: SearchResultItem[] }> {
  const actor = await getActorContext();
  const q = query.trim();
  if (!actor || q.length < 2) return { results: [] };
  const like = `%${q.replaceAll(/[%_]/g, "")}%`;
  const results: SearchResultItem[] = [];
  const can = (p: Parameters<typeof actorCan>[2]) =>
    actorCan(actor, organizationId, p);

  const jobs: Promise<void>[] = [];

  if (can("trainer:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("trainer_organization_assignments")
          .select("trainers!inner ( id, display_name, status )")
          .eq("organization_id", organizationId)
          .is("effective_to", null)
          .ilike("trainers.display_name", like)
          .limit(5);
        for (const row of data ?? []) {
          const t = row.trainers as unknown as { id: string; display_name: string; status: string };
          results.push({
            group: "People",
            label: t.display_name,
            sublabel: `Trainer · ${t.status}`,
            href: `/performance-operations/trainers/${t.id}`,
          });
        }
      })(),
    );
  }
  if (can("client:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("clients")
          .select("id, display_name, status, client_organization_assignments!inner ( organization_id )")
          .eq("client_organization_assignments.organization_id", organizationId)
          .ilike("display_name", like)
          .limit(5);
        for (const c of data ?? []) {
          results.push({
            group: "Clients",
            label: c.display_name,
            sublabel: `Client · ${c.status}`,
            href: `/performance-operations/clients`,
          });
        }
      })(),
    );
  }
  if (can("department:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("departments")
          .select("id, name, status")
          .eq("organization_id", organizationId)
          .ilike("name", like)
          .limit(5);
        for (const d of data ?? []) {
          results.push({
            group: "Departments",
            label: d.name,
            sublabel: `Department · ${d.status}`,
            href: `/performance-operations/departments/${d.id}`,
          });
        }
      })(),
    );
  }
  if (can("service:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("services")
          .select("id, display_name, status")
          .eq("organization_id", organizationId)
          .ilike("display_name", like)
          .limit(5);
        for (const s of data ?? []) {
          results.push({
            group: "Services",
            label: s.display_name,
            sublabel: `Service · ${s.status}`,
            href: `/performance-operations/configuration/services/${s.id}`,
          });
        }
      })(),
    );
  }
  if (can("import:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("import_batches")
          .select("id, original_filename, status")
          .eq("organization_id", organizationId)
          .ilike("original_filename", like)
          .order("uploaded_at", { ascending: false })
          .limit(5);
        for (const b of data ?? []) {
          results.push({
            group: "Imports",
            label: b.original_filename,
            sublabel: `Import · ${b.status.replaceAll("_", " ")}`,
            href: `/performance-operations/imports/${b.id}`,
          });
        }
      })(),
    );
  }
  if (can("payroll:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("payroll_runs")
          .select("id, name, status")
          .eq("organization_id", organizationId)
          .ilike("name", like)
          .order("created_at", { ascending: false })
          .limit(5);
        for (const r of data ?? []) {
          results.push({
            group: "Payroll",
            label: r.name,
            sublabel: `Payroll run · ${r.status.replaceAll("_", " ")}`,
            href: `/performance-operations/payroll/${r.id}`,
          });
        }
      })(),
    );
  }
  if (can("org:read_all") || can("org:read")) {
    jobs.push(
      (async () => {
        const { data } = await actor.supabase
          .from("organizations")
          .select("id, name, slug")
          .ilike("name", like)
          .limit(3);
        for (const o of data ?? []) {
          results.push({
            group: "Organizations",
            label: o.name,
            sublabel: "Organization",
            href: "/performance-operations/overview",
          });
        }
      })(),
    );
  }

  await Promise.all(jobs);
  return { results: results.slice(0, 30) };
}

/* --------------------------------------------------- notifications ---- */

async function updateNotification(
  actor: ActorContext,
  id: string,
  patch: Partial<{
    read_at: string | null;
    pinned_at: string | null;
    archived_at: string | null;
  }>,
): Promise<ActionState> {
  const { error } = await actor.supabase
    .from("notifications")
    .update(patch)
    .eq("id", id)
    .eq("recipient_id", actor.userId);
  if (error) return { error: "Could not update the notification." };
  revalidatePath("/performance-operations/notifications");
  revalidatePath("/performance-operations/overview");
  return { message: "Updated." };
}

export async function markNotificationRead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const unread = formData.get("unread") === "true";
  return updateNotification(actor, String(formData.get("id") ?? ""), {
    read_at: unread ? null : new Date().toISOString(),
  });
}

export async function markAllNotificationsRead(): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const { error } = await actor.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", actor.userId)
    .is("read_at", null)
    .is("archived_at", null);
  if (error) return { error: "Could not mark notifications read." };
  revalidatePath("/performance-operations/notifications");
  revalidatePath("/performance-operations/overview");
  return { message: "All notifications marked read." };
}

export async function toggleNotificationPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const pinned = formData.get("pinned") === "true";
  return updateNotification(actor, String(formData.get("id") ?? ""), {
    pinned_at: pinned ? null : new Date().toISOString(),
  });
}

export async function archiveNotification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  return updateNotification(actor, String(formData.get("id") ?? ""), {
    archived_at: new Date().toISOString(),
    read_at: new Date().toISOString(),
  });
}

/* ----------------------------------------------------- saved views ---- */

export async function saveView(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const name = String(formData.get("name") ?? "").trim();
  const page = String(formData.get("page") ?? "").trim();
  const kind = String(formData.get("kind") ?? "filter");
  const configRaw = String(formData.get("config") ?? "{}");
  if (name.length < 2 || name.length > 60) {
    return { error: "Name must be 2–60 characters." };
  }
  if (!["report", "filter"].includes(kind) || page.length === 0) {
    return { error: "Invalid view." };
  }
  let config: Json;
  try {
    config = JSON.parse(configRaw) as Json;
  } catch {
    return { error: "Invalid view configuration." };
  }
  const { error } = await actor.supabase.from("saved_views").upsert(
    {
      owner_id: actor.userId,
      kind,
      page,
      name,
      config,
    },
    { onConflict: "owner_id,page,name" },
  );
  if (error) return { error: "Could not save the view." };
  revalidatePath(`/${page}`);
  return { message: `Saved “${name}”.` };
}

export async function renameSavedView(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Name must be 2–60 characters." };
  }
  const { error } = await actor.supabase
    .from("saved_views")
    .update({ name })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("owner_id", actor.userId);
  if (error) {
    return {
      error: error.code === "23505" ? "You already have a view with that name." : "Could not rename the view.",
    };
  }
  revalidatePath("/performance-operations/reports");
  return { message: "View renamed." };
}

export async function toggleSavedViewPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const pinned = formData.get("pinned") === "true";
  const { error } = await actor.supabase
    .from("saved_views")
    .update({ pinned: !pinned })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("owner_id", actor.userId);
  if (error) return { error: "Could not update the view." };
  revalidatePath("/performance-operations/reports");
  return { message: pinned ? "Unpinned." : "Pinned." };
}

export async function deleteSavedView(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  const { error } = await actor.supabase
    .from("saved_views")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("owner_id", actor.userId);
  if (error) return { error: "Could not delete the view." };
  revalidatePath("/performance-operations/reports");
  return { message: "View deleted." };
}

/* --------------------------------------------------- export events ---- */

export async function recordReportExport(
  organizationId: string,
  exportType: string,
  metadata: Record<string, string | number>,
): Promise<void> {
  const actor = await getActorContext();
  if (!actor) return;
  if (!actorCan(actor, organizationId, "report:read")) return;
  await actor.supabase.from("export_events").insert({
    organization_id: organizationId,
    export_type: exportType,
    source_page: "reports",
    format: "csv",
    engine_version: "intel-v1",
    metadata: metadata as Json,
    generated_by: actor.userId,
  });
}

