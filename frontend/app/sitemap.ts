import type { MetadataRoute } from "next";

const PATHS = [
  "/",
  "/pricing",
  "/demo",
  "/clinics",
  "/privacy",
  "/terms",
  "/data-deletion",
] as const;

function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  return PATHS.map((path) => ({
    url: `${origin}${path === "/" ? "/" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" || path === "/clinics" ? 0.9 : 0.6,
  }));
}
