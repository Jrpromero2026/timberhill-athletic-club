/** Cookie that persists the selected workspace across navigation/refresh. */
export const WORKSPACE_COOKIE = "po-workspace";

/** Sentinel cookie value for the cross-organization "All Workspaces" view. */
export const ALL_WORKSPACES = "all";

/**
 * Offline bootstrap workspaces, used ONLY when Supabase is not configured
 * (or no user is signed in) so the shell remains navigable in development.
 * These mirror supabase/seed.sql; the database is the source of truth and
 * these are never used once real data is available.
 */
export const BOOTSTRAP_WORKSPACES = [
  {
    id: "bootstrap-timberhill-athletic-club",
    slug: "timberhill-athletic-club",
    name: "Timberhill Athletic Club",
    departments: ["Personal Training", "PACK Training", "Nutrition Coaching"],
  },
  {
    id: "bootstrap-g3-sports-fitness",
    slug: "g3-sports-fitness",
    name: "G3 Sports & Fitness",
    departments: [
      "Athlete Performance",
      "Adult Human Performance",
      "Tactical Performance",
      "Team Performance",
      "Performance Evaluations",
      "G3 Volleyball",
    ],
  },
] as const;

/**
 * The hub serves one organization. The database can hold others, but nothing
 * outside this organization is offered, selectable, or aggregated here.
 */
export const HUB_ORGANIZATION_SLUG = "timberhill-athletic-club";
