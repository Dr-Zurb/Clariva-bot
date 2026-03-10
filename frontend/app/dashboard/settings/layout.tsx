"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { href: "/dashboard/settings/practice-setup", label: "Practice Setup" },
  { href: "/dashboard/settings/integrations", label: "Integrations" },
] as const;

/**
 * Settings layout: sub-tabs for Practice Setup and Integrations.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      <nav
        className="mb-6 flex gap-1 border-b border-gray-200"
        aria-label="Settings sections"
      >
        {settingsTabs.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
