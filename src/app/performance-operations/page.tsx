import { redirect } from "next/navigation";

/**
 * `/performance-operations` — the platform's own root.
 *
 * Sits inside this segment's layout, so the session is resolved and an
 * unauthenticated visitor is redirected to /login before this runs. Signed-in
 * staff land on the Executive Operations Center.
 */
export default function PerformanceOperationsRoot() {
  redirect("/performance-operations/overview");
}
