import Link from "next/link";

/**
 * The staff entry point into Performance Operations, in the public site
 * chrome on every marketing page.
 *
 * This was previously drawn only for a visitor carrying a session cookie, so
 * that the club's public navigation did not advertise an internal payroll and
 * KPI tool to a prospective member. The PT Director's call is that it is
 * permanent and visible to everyone, which is the decision recorded here.
 *
 * What that means in practice, so nobody has to re-derive it:
 *
 *   - It is a LINK, not access. `src/proxy.ts` is what protects the
 *     application, and it sends an anonymous visitor to /login. Nothing about
 *     this link changes who can read anything.
 *   - It is now in the prerendered HTML of four public, cacheable pages, so it
 *     is crawlable. `robots.ts` disallows the destination and the link carries
 *     `rel="nofollow"`, which together keep it out of the index — a login page
 *     listed under the club's name is noise in a result, not a risk.
 */
export function StaffLink({ className = "" }: { className?: string }) {
  return (
    <Link
      className={`staff-link ${className}`.trim()}
      href="/performance-operations"
      rel="nofollow"
    >
      Performance Operations
      <span aria-hidden="true"> →</span>
    </Link>
  );
}
