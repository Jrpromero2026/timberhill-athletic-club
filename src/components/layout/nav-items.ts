export interface NavItem {
  href: string;
  label: string;
  /** Inline SVG path (24×24, stroke-based). */
  iconPath: string;
  /** Other routes that keep this item highlighted (pages it leads to). */
  activeFor?: readonly string[];
}

export interface NavGroup {
  /** Section heading; null for the ungrouped item at the top. */
  title: string | null;
  items: NavItem[];
}

/**
 * Pages reached from "Data & settings" rather than from the sidebar. They
 * keep that item highlighted so the sidebar still says where you are.
 */
export const ADMIN_ROUTES = [
  "/performance-operations/imports",
  "/performance-operations/data-health",
  "/performance-operations/appointments",
  "/performance-operations/integrations",
  "/performance-operations/configuration",
  "/performance-operations/audit",
] as const;

/**
 * The sidebar, grouped by the five areas of the hub plan: Payroll, Trainers,
 * Projects & upgrades, Marketing, Reports. Everything that only feeds those
 * areas (imports, sync, settings, audit log) sits behind one Admin item.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      {
        href: "/performance-operations/overview",
        label: "Home",
        iconPath:
          "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
      },
    ],
  },
  {
    title: "Payroll",
    items: [
      {
        href: "/performance-operations/payroll",
        label: "Payroll",
        iconPath:
          "M12 8v8m3-6.5c0-1-1.3-1.5-3-1.5s-3 .5-3 1.5 1 1.5 3 2 3 1 3 2-1.3 1.5-3 1.5-3-.5-3-1.5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z",
      },
      {
        href: "/performance-operations/package-audit",
        label: "Package audit",
        iconPath:
          "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4",
      },
      {
        href: "/performance-operations/period-close",
        label: "Month-end close",
        iconPath: "M9 12l2 2 4-4m5 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      },
    ],
  },
  {
    title: "Trainers",
    items: [
      {
        href: "/performance-operations/trainers",
        label: "Trainers",
        iconPath:
          "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
      },
      {
        href: "/performance-operations/clients",
        label: "Clients",
        iconPath:
          "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
      },
      {
        href: "/performance-operations/sops",
        label: "SOPs",
        iconPath: "M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h7",
      },
    ],
  },
  {
    title: "Projects & upgrades",
    items: [
      {
        href: "/performance-operations/projects",
        label: "Projects",
        iconPath: "M4 7h6l2 2h8v10H4V7Zm0 0V5h5l1 2",
      },
    ],
  },
  {
    title: "Marketing",
    items: [
      {
        href: "/performance-operations/marketing",
        label: "Marketing",
        iconPath: "M4 10v4h3l6 4V6l-6 4H4Zm13-1a4 4 0 0 1 0 6",
      },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        href: "/performance-operations/reports",
        label: "Reports",
        iconPath:
          "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 15h6M9 11h2",
      },
      {
        href: "/performance-operations/analytics",
        label: "Analytics",
        iconPath: "M3 3v18h18M7 14l4-4 3 3 5-6",
      },
      {
        href: "/performance-operations/snapshots",
        label: "Club snapshots",
        iconPath: "M4 7h16M4 12h16M4 17h10M18 15v6m3-3h-6",
      },
      {
        href: "/performance-operations/director",
        label: "Director view",
        iconPath:
          "M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7ZM10 21h4",
      },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        href: "/performance-operations/admin",
        label: "Data & settings",
        iconPath:
          "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-2.1.7-.5 1.2 1 2-1.7 1.7-2-1-1.2.5L12.8 20h-1.6l-.7-2.1-1.2-.5-2 1-1.7-1.7 1-2-.5-1.2L4 12.8v-1.6l2.1-.7.5-1.2-1-2 1.7-1.7 2 1 1.2-.5L11.2 4h1.6l.7 2.1 1.2.5 2-1 1.7 1.7-1 2 .5 1.2 2.1.7v.8Z",
        activeFor: ADMIN_ROUTES,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** True when `pathname` is the item's page, a page under it, or one it leads to. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.activeFor ?? [])].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
