import { redirect } from "next/navigation";

/**
 * The staff entrance.
 *
 * The public site owns `/`, so this is the named door into the operations
 * platform: `…/performance-operations` lands on the Executive Operations
 * Center the same way `/` lands on the club's Personal Training hub.
 *
 * It is a redirect rather than a path prefix on purpose. The platform's routes
 * live at `/overview`, `/payroll`, `/reports` and so on, and those paths are
 * not only in links — they are written into `notifications.link_path` in the
 * database. Re-homing them under this segment would strand every notification
 * already stored. Until that is worth a migration, this gives the address
 * without moving the furniture.
 *
 * Not public: the proxy sends a signed-out visitor to /login and returns them
 * here afterwards, which lands them on the platform.
 */
export default function PerformanceOperationsEntry() {
  redirect("/overview");
}
