import { cookies } from "next/headers";
import { isOfflinePreviewEnabled, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessAllWorkspaces, type MembershipGrant } from "@/lib/authz/authz";
import type { RoleKey } from "@/lib/authz/permissions";
import {
  ALL_WORKSPACES,
  BOOTSTRAP_WORKSPACES,
  HUB_ORGANIZATION_SLUG,
  WORKSPACE_COOKIE,
} from "./constants";
import {
  pinToHubOrganization,
  resolveWorkspaceSelection,
  type WorkspaceSelection,
} from "./resolver";

export interface WorkspaceOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * How the app is running:
 *  - `live`         — Supabase configured; real auth and data. The ONLY mode
 *                     when production-style env vars are present.
 *  - `offline`      — Supabase NOT configured AND the explicit dev flag set.
 *  - `unconfigured` — Supabase NOT configured and no dev flag: setup required.
 */
export type AppMode = "live" | "offline" | "unconfigured";

export interface WorkspaceContext {
  mode: AppMode;
  /** Authenticated user id (null when signed out or non-live mode). */
  userId: string | null;
  /** Workspaces the current user may select. */
  options: WorkspaceOption[];
  canAccessAll: boolean;
  /** The validated, resolved selection (never trusts the raw cookie). */
  selection: WorkspaceSelection;
  selected: WorkspaceOption | null;
  memberships: MembershipGrant[];
  userName: string | null;
  userEmail: string | null;
}

interface MembershipQueryRow {
  organization_id: string;
  is_default: boolean;
  roles: { key: string } | null;
  organizations: WorkspaceOption | null;
}

/**
 * Resolve the workspace context for the current request.
 *
 * Access is loaded server-side (organization_memberships joined to roles);
 * the workspace cookie is only ever validated against that list. Department
 * grants are loaded for department-scoped roles so downstream authorization
 * can narrow correctly.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;

  if (!isSupabaseConfigured()) {
    return isOfflinePreviewEnabled()
      ? offlineContext(requested)
      : emptyContext("unconfigured");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return emptyContext("unconfigured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyContext("live");

  const { data: membershipRows, error } = await supabase
    .from("organization_memberships")
    .select(
      "organization_id, is_default, roles ( key ), organizations ( id, slug, name )"
    )
    .is("effective_to", null);

  if (error || !membershipRows) return emptyContext("live", user.id);

  const memberships: MembershipGrant[] = [];
  const options = new Map<string, WorkspaceOption>();
  let defaultOrganizationId: string | null = null;

  // PostgREST returns to-one embeds as objects; the generated types keep the
  // array-typed fallback for unnamed joins, hence the cast.
  for (const row of membershipRows as unknown as MembershipQueryRow[]) {
    const role = row.roles;
    const org = row.organizations;
    if (!role || !org) continue;
    memberships.push({
      organizationId: row.organization_id,
      roleKey: role.key as RoleKey,
      isDefault: row.is_default,
    });
    options.set(org.id, { id: org.id, slug: org.slug, name: org.name });
    if (row.is_default) defaultOrganizationId = row.organization_id;
  }

  // Department grants for department-scoped roles.
  if (memberships.some((m) => m.roleKey === "department_manager")) {
    const { data: deptRows } = await supabase
      .from("department_memberships")
      .select("organization_id, department_id")
      .is("effective_to", null);
    for (const membership of memberships) {
      if (membership.roleKey !== "department_manager") continue;
      membership.departmentIds = (deptRows ?? [])
        .filter((d) => d.organization_id === membership.organizationId)
        .map((d) => d.department_id);
    }
  }

  let canAccessAll = canAccessAllWorkspaces(memberships);

  // Platform admins may select any active organization.
  if (canAccessAll) {
    const { data: allOrgs } = await supabase
      .from("organizations")
      .select("id, slug, name")
      .eq("status", "active")
      .order("name");
    for (const org of allOrgs ?? []) {
      options.set(org.id, { id: org.id, slug: org.slug, name: org.name });
    }
  }

  // This hub is Timberhill's alone: offer only that organization, and no
  // cross-organization view. Memberships are left as loaded, so permissions
  // inside Timberhill are unchanged.
  const hub = pinToHubOrganization([...options.values()], HUB_ORGANIZATION_SLUG);
  const optionList = hub.options;
  if (hub.pinned) canAccessAll = false;
  const selection = resolveWorkspaceSelection(requested, {
    organizationIds: optionList.map((o) => o.id),
    defaultOrganizationId,
    canAccessAll,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    mode: "live",
    userId: user.id,
    options: optionList,
    canAccessAll,
    selection,
    selected:
      selection.kind === "organization"
        ? optionList.find((o) => o.id === selection.organizationId) ?? null
        : null,
    memberships,
    userName:
      profile?.full_name ||
      ((user.user_metadata?.full_name as string | undefined) ?? null),
    userEmail: profile?.email ?? user.email ?? null,
  };
}

function emptyContext(mode: AppMode, userId: string | null = null): WorkspaceContext {
  return {
    mode,
    userId,
    options: [],
    canAccessAll: false,
    selection: { kind: "none" },
    selected: null,
    memberships: [],
    userName: null,
    userEmail: null,
  };
}

/**
 * Offline preview context (explicit dev flag only): bootstrap workspaces
 * mirroring the seed. Never active when Supabase is configured.
 */
function offlineContext(requested: string | null): WorkspaceContext {
  const hub = pinToHubOrganization(
    BOOTSTRAP_WORKSPACES.map((w) => ({ id: w.id, slug: w.slug, name: w.name })),
    HUB_ORGANIZATION_SLUG
  );
  const options = hub.options;
  const canAccessAll = !hub.pinned;
  const selection = resolveWorkspaceSelection(requested, {
    organizationIds: options.map((o) => o.id),
    defaultOrganizationId: options[0]?.id ?? null,
    canAccessAll,
  });
  return {
    mode: "offline",
    userId: null,
    options,
    canAccessAll,
    selection,
    selected:
      selection.kind === "organization"
        ? options.find((o) => o.id === selection.organizationId) ?? null
        : null,
    memberships: [],
    userName: null,
    userEmail: null,
  };
}

export { ALL_WORKSPACES, WORKSPACE_COOKIE };
