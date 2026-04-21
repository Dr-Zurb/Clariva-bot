"use client";

/**
 * `<DashboardEventsBell>` — a tiny header bell that shows the number of
 * unread `doctor_dashboard_events` for the signed-in doctor (Plan 07 ·
 * Task 30 · Decision 4 + 10 LOCKED).
 *
 * Behavior:
 *   - Fetches `/api/v1/dashboard/events?unread=true&limit=10` on mount
 *     and renders a count badge on top of a bell glyph.
 *   - Polls every 60s when the tab is visible (dashboard is a workday
 *     surface — short polling is fine; we don't burn battery in the
 *     background).
 *   - The bell is a `<Link>` to `/dashboard` (the feed itself lives on
 *     the dashboard page) — clicking the bell scrolls the feed into view
 *     via the URL hash.
 *
 * Failure mode: if the fetch throws, the bell renders with no badge
 * (the API failure is a logger.error on the server; we don't push a UI
 * error from the header — the dashboard page will surface it more
 * prominently when the doctor lands).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardEvents } from "@/lib/api";

const POLL_INTERVAL_MS = 60_000;

export interface DashboardEventsBellProps {
  /** Supabase access token. Bell is a no-op if empty. */
  token: string;
}

export function DashboardEventsBell({
  token,
}: DashboardEventsBellProps): JSX.Element | null {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchCount = async (): Promise<void> => {
      try {
        const res = await getDashboardEvents(token, {
          unreadOnly: true,
          // We only care about the count cap for the badge; "10+" is
          // sufficient signal for the doctor that there's a lot to read.
          limit: 11,
        });
        if (cancelled) return;
        setUnreadCount(res.data.events.length);
      } catch {
        // Quiet — see file header. The dashboard page surfaces errors.
      }
    };

    void fetchCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchCount();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

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
      href="/dashboard#notifications"
      aria-label={
        unreadCount && unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
          : "Notifications"
      }
      className="relative inline-flex items-center justify-center rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
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
