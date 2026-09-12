import { redirect } from "next/navigation";

/**
 * The front door.
 *
 * This deployment serves two audiences, and the public one owns the root:
 * anyone arriving at the domain without being told otherwise is a visitor
 * looking for the club, not a staff member looking for payroll. Sending them
 * to `/overview` meant the first thing the public saw was an internal
 * application asking to be configured.
 *
 * Staff reach the operations platform at `/overview`, which is where `/login`
 * delivers them after signing in, and where their bookmarks point.
 */
export default function RootPage() {
  redirect("/personal-training");
}
