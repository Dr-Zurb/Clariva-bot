"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const SEGMENTS: Record<string, string> = {
  settings: "Settings",
  account: "Account",
  "practice-setup": "Practice setup",
  "practice-info": "Practice info",
  "services-catalog": "Pricing",
  "booking-rules": "Booking rules",
  "bot-messages": "Messaging",
  availability: "Availability",
  "opd-mode": "OPD mode",
  "patient-flow": "Patient flow",
  integrations: "Integrations",
};

/**
 * Breadcrumb for settings area. e.g. Settings / Practice setup / Practice info
 * Back control links one level up (parent crumb).
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

  const parent = items[items.length - 2]!;

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Link
        href={parent.href}
        aria-label={`Back to ${parent.label}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>/</span>}
          {i === items.length - 1 ? (
            <span aria-current="page" className="font-medium text-foreground">
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
