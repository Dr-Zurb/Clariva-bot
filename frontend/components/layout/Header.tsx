"use client";

import { LogoutButton } from "@/components/LogoutButton";
import { cn } from "@/lib/utils";

interface HeaderProps {
  userEmail?: string | null;
  onMenuToggle?: () => void;
}

/**
 * Dashboard header: user display, logout, mobile menu toggle.
 * @see e-task-3; FRONTEND_COMPLIANCE (email for identity only)
 */
export function Header({ userEmail, onMenuToggle }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className={cn(
            "rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            "md:hidden"
          )}
          aria-label="Open menu"
        />
        <span className="text-sm font-medium text-gray-700">
          {userEmail ? (
            <>Logged in as {userEmail}</>
          ) : (
            <span className="text-gray-500">Dashboard</span>
          )}
        </span>
      </div>
      <LogoutButton />
    </header>
  );
}
