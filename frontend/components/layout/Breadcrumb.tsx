"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SEGMENTS: Record<string, string> = {
  settings: "Settings",
  "practice-setup": "Practice Setup",
  "practice-info": "Practice Info",
  "booking-rules": "Booking Rules",
  "bot-messages": "Bot Messages",
  availability: "Availability",
  integrations: "Integrations",
};

/**
 * Breadcrumb for settings area. e.g. Settings > Practice Setup > Practice Info
 */
export function Breadcrumb() {
  const pathname = usePathname();
  if (!pathname.startsWith("/dashboard/settings")) return null;

  const parts = pathname.replace("/dashboard/", "").split("/");
  const items: { href: string; label: string }[] = [];
  let href = "/dashboard";

  for (let i = 0; i < parts.length; i++) {
    href += `/${parts[i]}`;
    const label = SEGMENTS[parts[i]] ?? parts[i];
    items.push({ href, label });
  }

  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm text-gray-600">
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>/</span>}
          {i === items.length - 1 ? (
            <span aria-current="page" className="font-medium text-gray-900">
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className="hover:text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            >
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
