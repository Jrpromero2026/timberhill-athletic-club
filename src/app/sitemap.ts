import type { MetadataRoute } from "next";
import {
  canonicalUrl,
  CONTENT_REVIEWED,
  TRAINERS,
} from "@/lib/marketing/personal-training";

/**
 * The public sitemap.
 *
 * Only the marketing routes appear. `/performance-operations/*` is the staff
 * application — it requires a session, it has no public value, and listing it
 * would invite a crawler to spend its budget on a wall of redirects to /login.
 *
 * URLs are built through `canonicalUrl`, so a sitemap entry can never disagree
 * with the `<link rel="canonical">` on the page it points at. That pairing is
 * the whole job of a sitemap; two spellings of one URL is worse than no
 * sitemap at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(CONTENT_REVIEWED);

  const profiles = TRAINERS.filter((trainer) => trainer.profile).map(
    (trainer) => ({
      url: canonicalUrl(`/personal-training/trainers/${trainer.slug}`),
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    }),
  );

  return [
    {
      url: canonicalUrl("/personal-training"),
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: canonicalUrl("/personal-training/consultation"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: canonicalUrl("/personal-training/trainers"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...profiles,
  ];
}
