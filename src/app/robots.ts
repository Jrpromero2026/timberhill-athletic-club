import type { MetadataRoute } from "next";
import { canonicalUrl, SITE_ORIGIN } from "@/lib/marketing/personal-training";

/**
 * Crawl rules.
 *
 * The public surface of this deployment is `/personal-training` and everything
 * beneath it. Everything else is the staff application or the auth flow: it
 * answers /login to an anonymous request, so a crawler that walks it learns
 * nothing and burns budget. `src/proxy.ts` enforces the same boundary — this
 * file is the polite version of it.
 *
 * The AI crawlers are listed explicitly rather than left to the wildcard. They
 * are welcome on the marketing pages: these routes exist to be quoted back to
 * somebody asking where to train in Corvallis, which is exactly what those
 * crawlers are for.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/performance-operations/",
    "/login",
    "/auth/",
    "/api/",
    "/accept-invite",
    "/reset-password",
    "/forgot-password",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Named so a future tightening of the wildcard does not silently lock
      // the answer engines out of the pages written for them.
      {
        userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended"],
        allow: "/personal-training",
        disallow,
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: canonicalUrl("/").replace(/\/$/, ""),
  };
}
