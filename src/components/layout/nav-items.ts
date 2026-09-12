export interface NavItem {
  href: string;
  label: string;
  /** Inline SVG path (24×24, stroke-based). */
  iconPath: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/performance-operations/director",
    label: "PT Director",
    iconPath: "M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7ZM10 21h4",
  },
  {
    href: "/performance-operations/overview",
    label: "Overview",
    iconPath: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  },
  {
    href: "/performance-operations/imports",
    label: "Imports",
    iconPath: "M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  },
  {
    href: "/performance-operations/data-health",
    label: "Data health",
    iconPath: "M3 12h4l2 5 4-14 2 9h6",
  },
  {
    href: "/performance-operations/appointments",
    label: "Appointments",
    iconPath: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  },
  {
    href: "/performance-operations/revenue",
    label: "Revenue",
    iconPath: "M3 17l6-6 4 4 8-8M21 7v6m0-6h-6",
  },
  {
    href: "/performance-operations/payroll",
    label: "Payroll",
    iconPath: "M12 8v8m3-6.5c0-1-1.3-1.5-3-1.5s-3 .5-3 1.5 1 1.5 3 2 3 1 3 2-1.3 1.5-3 1.5-3-.5-3-1.5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z",
  },
  {
    href: "/performance-operations/period-close",
    label: "Period close",
    iconPath: "M9 12l2 2 4-4m5 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    href: "/performance-operations/trainers",
    label: "Trainers",
    iconPath: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    href: "/performance-operations/clients",
    label: "Clients",
    iconPath: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  },
  {
    href: "/performance-operations/snapshots",
    label: "Club snapshots",
    iconPath: "M4 7h16M4 12h16M4 17h10M18 15v6m3-3h-6",
  },
  {
    href: "/performance-operations/integrations",
    label: "Automation",
    iconPath: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  },
  {
    href: "/performance-operations/analytics",
    label: "Analytics",
    iconPath: "M3 3v18h18M7 14l4-4 3 3 5-6",
  },
  {
    href: "/performance-operations/reports",
    label: "Reports",
    iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 15h6M9 11h2",
  },
  {
    href: "/performance-operations/configuration",
    label: "Configuration",
    iconPath: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  },
  {
    href: "/performance-operations/audit",
    label: "Audit",
    iconPath: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4",
  },
];
