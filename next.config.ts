import type { NextConfig } from "next";

/**
 * The operations platform used to live at the domain root — `/overview`,
 * `/payroll`, `/reports` and so on — before the public website took the root
 * and the platform moved beneath `/performance-operations`.
 *
 * Staff bookmarks, links pasted into messages, and any notification email sent
 * before the move all still point at the old paths. These redirects keep those
 * working. `permanent: true` because the move is permanent: the old locations
 * are not coming back.
 *
 * `:path*` carries the remainder through, so `/payroll/abc/review` lands on
 * `/performance-operations/payroll/abc/review` rather than the section root.
 *
 * Not listed: `/login` and `/auth/*`, which never moved — the Supabase
 * dashboard holds redirect URLs pointing at them.
 */
const OPERATIONS_SEGMENTS = [
  "analytics",
  "appointments",
  "audit",
  "clients",
  "configuration",
  "data-health",
  "departments",
  "director",
  "imports",
  "integrations",
  "notifications",
  "overview",
  "payroll",
  "period-close",
  "reports",
  "revenue",
  "setup",
  "snapshots",
  "trainers",
];

const nextConfig: NextConfig = {
  async redirects() {
    return OPERATIONS_SEGMENTS.flatMap((segment) => [
      {
        source: `/${segment}`,
        destination: `/performance-operations/${segment}`,
        permanent: true,
      },
      {
        source: `/${segment}/:path*`,
        destination: `/performance-operations/${segment}/:path*`,
        permanent: true,
      },
    ]);
  },
};

export default nextConfig;
