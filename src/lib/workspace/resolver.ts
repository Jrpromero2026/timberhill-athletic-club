import { ALL_WORKSPACES } from "./constants";

/**
 * Pure workspace-resolution logic (unit-tested; no I/O).
 *
 * The requested value (from the cookie or a switch request) is untrusted.
 * Resolution validates it against the user's server-loaded access and falls
 * back safely — never into an organization the user cannot access.
 */

export interface WorkspaceAccess {
  /** Organization IDs the user may access, in preference order. */
  organizationIds: readonly string[];
  /** The user's default organization, if one is marked. */
  defaultOrganizationId?: string | null;
  /** Whether the user holds the cross-organization permission. */
  canAccessAll: boolean;
}

export type WorkspaceSelection =
  | { kind: "all" }
  | { kind: "organization"; organizationId: string }
  | { kind: "none" };

/**
 * Resolve a requested workspace against validated access.
 *
 * Rules:
 *  - "all" resolves to All Workspaces only when the user is authorized;
 *    otherwise it falls back like an invalid value.
 *  - A concrete organization ID resolves only if the user can access it.
 *  - Missing/invalid/lost selections fall back to the default organization,
 *    then the first accessible organization, then "none".
 */
export function resolveWorkspaceSelection(
  requested: string | null | undefined,
  access: WorkspaceAccess
): WorkspaceSelection {
  if (requested === ALL_WORKSPACES && access.canAccessAll) {
    return { kind: "all" };
  }

  if (
    requested &&
    requested !== ALL_WORKSPACES &&
    access.organizationIds.includes(requested)
  ) {
    return { kind: "organization", organizationId: requested };
  }

  if (
    access.defaultOrganizationId &&
    access.organizationIds.includes(access.defaultOrganizationId)
  ) {
    return { kind: "organization", organizationId: access.defaultOrganizationId };
  }

  if (access.organizationIds.length > 0) {
    return { kind: "organization", organizationId: access.organizationIds[0] };
  }

  if (access.canAccessAll) {
    return { kind: "all" };
  }

  return { kind: "none" };
}

/** Serialize a selection back to its cookie value. */
export function selectionToCookieValue(selection: WorkspaceSelection): string | null {
  switch (selection.kind) {
    case "all":
      return ALL_WORKSPACES;
    case "organization":
      return selection.organizationId;
    case "none":
      return null;
  }
}

/**
 * Narrow the selectable workspaces to the hub's own organization.
 *
 * Returns only that organization when the user can access it. When they
 * cannot, the list is returned unchanged, so nobody is ever moved into an
 * organization they have no access to and nobody is locked out.
 */
export function pinToHubOrganization<T extends { slug: string }>(
  options: readonly T[],
  hubSlug: string
): { options: T[]; pinned: boolean } {
  const hub = options.find((option) => option.slug === hubSlug);
  return hub
    ? { options: [hub], pinned: true }
    : { options: [...options], pinned: false };
}
