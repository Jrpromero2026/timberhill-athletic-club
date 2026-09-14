import { permanentRedirect } from "next/navigation";

/**
 * The front door.
 *
 * This deployment serves two audiences, and the public one owns the root:
 * anyone arriving at the domain without being told otherwise is a visitor
 * looking for the club, not a staff member looking for payroll. Sending them
 * to `/performance-operations/overview` meant the first thing the public saw was an internal
 * application asking to be configured.
 *
 * Staff reach the operations platform at `/performance-operations/overview`, which is where `/login`
 * delivers them after signing in, and where their bookmarks point.
 *
 * PERMANENT, not temporary. A 307 tells a crawler the arrangement may change,
 * so it keeps the root in the index and passes nothing through to the target.
 * This arrangement is not going to change: the root of this deployment belongs
 * to Personal Training.
 */
export default function RootPage() {
  permanentRedirect("/personal-training");
}
