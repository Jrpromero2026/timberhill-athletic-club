"use server";

import { revalidatePath } from "next/cache";
import {
  NOT_SIGNED_IN,
  PERMISSION_DENIED,
  actorIsPlatformAdmin,
  getActorContext,
  type ActionState,
} from "@/lib/actions/shared";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { HUB_SECTIONS, SECTION_PATH, parseNewItem, type HubSection } from "./items";

/** The organization the signed-in user is working in; never taken from the form. */
async function hubOrganizationId(): Promise<string | null> {
  const context = await getWorkspaceContext();
  return context.mode === "live" && context.selection.kind === "organization"
    ? context.selection.organizationId
    : null;
}

/** Add a link or note to a section. Administrators only; RLS enforces it again. */
export async function addHubItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await getActorContext();
  if (!actor) return NOT_SIGNED_IN;
  if (!actorIsPlatformAdmin(actor)) return PERMISSION_DENIED;
  const organizationId = await hubOrganizationId();
  if (!organizationId) return PERMISSION_DENIED;

  const parsed = parseNewItem(form);
  if ("error" in parsed) return { error: parsed.error };

  // hub_items is not in the generated Database types yet.
  const { error } = await actor.supabase.from("hub_items" as never).insert({
    organization_id: organizationId,
    ...parsed,
    source: "Added in the hub",
    item_date: new Date().toISOString().slice(0, 10),
    sort: 500,
  } as never);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This section already has an item with that title."
          : "Could not save. Try again.",
    };
  }
  revalidatePath(SECTION_PATH[parsed.section]);
  return { message: "Added." };
}

/** Remove one item. Administrators only; RLS enforces it again. */
export async function removeHubItem(form: FormData): Promise<void> {
  const actor = await getActorContext();
  if (!actor || !actorIsPlatformAdmin(actor)) return;
  const organizationId = await hubOrganizationId();
  const id = form.get("id");
  const section = form.get("section") as HubSection;
  if (!organizationId || typeof id !== "string" || !HUB_SECTIONS.includes(section)) return;

  await actor.supabase
    .from("hub_items" as never)
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("section", section);
  revalidatePath(SECTION_PATH[section]);
}
