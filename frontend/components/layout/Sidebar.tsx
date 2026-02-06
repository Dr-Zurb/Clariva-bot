"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/patients", label: "Patients" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

interface SidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
}

/**
 * Dashboard sidebar navigation. Uses aria-current="page" for active route.
 * Mobile: overlay drawer; desktop: static sidebar.
 * @see e-task-3; FRONTEND_STANDARDS (semantic nav, aria-label)
 */
export function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay - close on click outside */}
      {isMobileOpen && (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Close menu"
        />
      )}
      <aside
        className={cn(
          "z-50 flex flex-col border-r border-gray-200 bg-white",
          "md:relative md:w-56 md:flex-shrink-0",
          "fixed inset-y-0 left-0 w-56 transform transition-transform duration-200 ease-in-out md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <nav className="flex flex-col gap-1 p-4" aria-label="Main navigation">
          {navItems.map(({ href, label }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
