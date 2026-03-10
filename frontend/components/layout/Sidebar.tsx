"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const topLevelNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/patients", label: "Patients" },
] as const;

const practiceSetupBase = "/dashboard/settings/practice-setup";
const practiceSetupSubNav = [
  { href: `${practiceSetupBase}/practice-info`, label: "Practice Info" },
  { href: `${practiceSetupBase}/booking-rules`, label: "Booking Rules" },
  { href: `${practiceSetupBase}/bot-messages`, label: "Bot Messages" },
  { href: `${practiceSetupBase}/availability`, label: "Availability" },
] as const;

interface SidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
}

/**
 * Dashboard sidebar. Settings is collapsible; Practice Setup is expandable with sub-items.
 * @see e-task-7; FRONTEND_STANDARDS (semantic nav, aria-label)
 */
export function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isInSettings = pathname.startsWith("/dashboard/settings");
  const isInPracticeSetup = pathname.startsWith(practiceSetupBase);

  const [settingsExpanded, setSettingsExpanded] = useState(isInSettings);
  const [practiceSetupExpanded, setPracticeSetupExpanded] = useState(isInPracticeSetup);

  useEffect(() => {
    if (isInSettings) setSettingsExpanded(true);
  }, [isInSettings]);

  useEffect(() => {
    if (isInPracticeSetup) setPracticeSetupExpanded(true);
  }, [isInPracticeSetup]);

  const toggleSettings = () => setSettingsExpanded((p) => !p);
  const togglePracticeSetup = () => setPracticeSetupExpanded((p) => !p);

  return (
    <>
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
          {topLevelNav.map(({ href, label }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href) && !pathname.startsWith("/dashboard/settings");
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

          {/* Settings (collapsible) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={toggleSettings}
              aria-expanded={settingsExpanded}
              aria-controls="settings-subnav"
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
                isInSettings
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <span className="uppercase tracking-wider text-gray-600">Settings</span>
              <span
                className={cn(
                  "text-gray-500 transition-transform",
                  settingsExpanded && "rotate-180"
                )}
                aria-hidden
              >
                ▼
              </span>
            </button>
            <div
              id="settings-subnav"
              className={cn("overflow-hidden transition-all", settingsExpanded ? "max-h-96" : "max-h-0")}
            >
              {/* Practice Setup (expandable) */}
              <div className="mt-1">
                <div className="flex items-center justify-between gap-1 rounded-md px-3 py-2 pl-5">
                  <Link
                    href={practiceSetupBase}
                    onClick={onClose}
                    aria-current={pathname === practiceSetupBase ? "page" : undefined}
                    className={cn(
                      "flex-1 text-sm font-medium transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white rounded px-1 -mx-1",
                      (pathname === practiceSetupBase || isInPracticeSetup)
                        ? "text-blue-700"
                        : "text-gray-700 hover:text-gray-900"
                    )}
                  >
                    Practice Setup
                  </Link>
                  <button
                    type="button"
                    onClick={togglePracticeSetup}
                    aria-expanded={practiceSetupExpanded}
                    aria-controls="practice-setup-subnav"
                    aria-label={practiceSetupExpanded ? "Collapse Practice Setup" : "Expand Practice Setup"}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span
                      className={cn(
                        "inline-block transition-transform",
                        practiceSetupExpanded && "rotate-90"
                      )}
                      aria-hidden
                    >
                      ▶
                    </span>
                  </button>
                </div>
                <div
                  id="practice-setup-subnav"
                  className={cn("overflow-hidden transition-all", practiceSetupExpanded ? "max-h-96" : "max-h-0")}
                >
                  {practiceSetupSubNav.map(({ href, label }) => {
                    const isActive = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={onClose}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "mt-0.5 flex rounded-md px-3 py-2 pl-8 text-sm font-medium transition-colors",
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
                </div>
              </div>

              {/* Integrations */}
              <Link
                href="/dashboard/settings/integrations"
                onClick={onClose}
                aria-current={pathname === "/dashboard/settings/integrations" ? "page" : undefined}
                className={cn(
                  "mt-1 flex rounded-md px-3 py-2 pl-5 text-sm font-medium transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
                  pathname === "/dashboard/settings/integrations"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                Integrations
              </Link>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}
