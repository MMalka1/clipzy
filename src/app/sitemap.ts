import type { MetadataRoute } from "next";
import { SEO_SLUGS, SEO_UPDATED } from "@/lib/seo-pages";
import { SITE_URL } from "@/lib/support";

/** sitemap.xml: главная, редактор, поддержка, документы и SEO-страницы. */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    ...SEO_SLUGS.map((slug) => ({
      url: url(`/${slug}`),
      lastModified: SEO_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: url("/app"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/support"), changeFrequency: "yearly", priority: 0.3 },
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
