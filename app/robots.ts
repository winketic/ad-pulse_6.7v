import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/register", "/login"],
        disallow: ["/dashboard/", "/admin/", "/api/", "/onboarding/"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
