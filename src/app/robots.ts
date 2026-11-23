import type { MetadataRoute } from "next";

/**
 * Crawl rules.
 *
 * This deployment is a private hub. Every route needs a session
 * (`src/proxy.ts`), so there is nothing here for a crawler: no sitemap, and
 * one rule that turns every crawler away. `next.config.ts` sends the matching
 * `X-Robots-Tag` header for anything that ignores this file.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
