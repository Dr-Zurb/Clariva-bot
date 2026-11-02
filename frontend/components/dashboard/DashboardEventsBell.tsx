"use client";

/**
 * Header bell. The unread number comes from the shared dashboard counts
 * query (GET /api/v1/dashboard/counts), the same 30s poll as the sidebar
 * badges. The bell links to /dashboard/alerts.
 *
 * A failed fetch leaves the badge off. The dashboard page surfaces errors.
 */

import Link from "next/link";
import { Bell } from "lucide-react";
import { useDashboardCounts } from "@/hooks/useDashboardCounts";

export interface DashboardEventsBellProps {
  /** Supabase access token. Bell is a no-op if empty. */
  token: string;
}

export function DashboardEventsBell({
  token,
}: DashboardEventsBellProps): JSX.Element | null {
  const { counts } = useDashboardCounts(token);
  const unreadCount = counts?.dashboardEventsUnread ?? null;

  if (!token) return null;

  const badge =
    unreadCount === null
      ? null
      : unreadCount === 0
        ? null
        : unreadCount > 10
          ? "10+"
          : String(unreadCount);

  return (
    <Link
      href="/dashboard/alerts"
      aria-label={
        unreadCount && unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
          : "Notifications"
      }
      className="relative inline-flex items-center justify-center rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {badge !== null && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export default DashboardEventsBell;
