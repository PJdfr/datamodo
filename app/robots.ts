import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // private, per-user surfaces — nothing to index behind auth
      disallow: ["/dashboard", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
