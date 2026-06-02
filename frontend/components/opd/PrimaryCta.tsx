"use client";

import Link from "next/link";

interface PrimaryCtaProps {
  consultationToken: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  opdMode: "slot" | "queue";
  /** Queue: show secondary wait hint */
  showWaitHint?: boolean;
}

function joinHref(consultationToken: string): string {
  const q = new URLSearchParams({ token: consultationToken });
  return `/consult/join?${q.toString()}`;
}

/**
 * Primary action: join video visit (same token as session snapshot).
 */
export default function PrimaryCta({
  consultationToken,
  status,
  opdMode,
  showWaitHint,
}: PrimaryCtaProps) {
  const canJoin = status === "pending" || status === "confirmed";

  if (status === "completed") {
    return (
      <p className="text-sm text-gray-600" role="status">
        This visit is completed. Thank you for using Clariva Care.
      </p>
    );
  }

  if (status === "cancelled") {
    return (
      <p className="text-sm text-gray-600" role="status">
        This appointment was cancelled.
      </p>
    );
  }

  if (status === "no_show") {
    return (
      <p className="text-sm text-gray-600" role="status">
        This visit was marked as missed / no-show. Please contact the clinic to
        reschedule or discuss options.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showWaitHint && opdMode === "queue" ? (
        <p className="text-sm text-gray-600">
          Stay on this page — we&apos;ll refresh your place in line and ETA.
        </p>
      ) : null}
      {canJoin ? (
        <Link
          href={joinHref(consultationToken)}
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
        >
          Join video visit
        </Link>
      ) : null}
    </div>
  );
}
