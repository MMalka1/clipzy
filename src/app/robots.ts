import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/support";

/** robots.txt: служебные и личные страницы поисковикам не нужны. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/support/inbox", "/admin", "/profile", "/reset-password", "/login", "/pay/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
