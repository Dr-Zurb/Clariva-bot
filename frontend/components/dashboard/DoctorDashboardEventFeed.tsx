"use client";

/**
 * `<DoctorDashboardEventFeed>` — the doctor-facing surface for mutual
 * replay notifications (Plan 07 · Task 30 · Decision 4 + 10 LOCKED).
 *
 * Renders the doctor's `doctor_dashboard_events` feed (today: only
 * `patient_replayed_recording`). The component owns:
 *
 *   - First-page fetch on mount, with a "Show acknowledged too" toggle
 *     that swaps unread-only ↔ all events.
 *   - "Mark as read" per-row, with optimistic UI: we flip the row to
 *     acknowledged before the POST returns and roll back on error.
 *   - Event-kind copy (today only "Your patient replayed the audio of
 *     your consult on …"). Decision 4 mandate: this surface is
 *     informational, NOT alarming. Copy mirrors the patient-facing DM
 *     contract — no PHI beyond `patient_display_name` and the consult
 *     date label, both already on the audit trail.
 *
 * Cursor pagination is a follow-up (we render the first page only in
 * v1; the API supports cursor + limit so the "Load more" button lands
 * cheaply when traffic warrants it).
 *
 * Auth: the parent (server component) hands a Supabase access token
 * down via `token`. The component never reaches into Supabase directly —
 * the same pattern as `<ServiceReviewsInbox>`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acknowledgeDashboardEvent,
  getDashboardEvents,
  type DashboardEvent,
} from "@/lib/api";

export interface DoctorDashboardEventFeedProps {
  token: string;
  /**
   * Optional cap on the first-page fetch. Defaults to 10 — small on
   * purpose; the dashboard is not the primary landing surface for long
   * scrollback. Cursor pagination is a v1.1 follow-up.
   */
  pageSize?: number;
}

type FeedState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; events: DashboardEvent[]; nextCursor?: string };

interface EventRowState {
  event: DashboardEvent;
  /** Optimistic `acknowledgedAt`; falls back to server value on error. */
  optimisticAcknowledgedAt?: string | null;
  acking?: boolean;
  ackError?: string;
}

function formatConsultDate(iso: string | null): string {
  if (!iso) return "an earlier consult";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an earlier consult";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function describeEvent(event: DashboardEvent): string {
  if (event.eventKind === "patient_replayed_recording") {
    const p = event.payload;
    const who = p.patient_display_name?.trim() || "A patient";
    const artifact = p.artifact_type === "transcript" ? "transcript" : "audio";
    const dateLabel = formatConsultDate(p.consult_date);
    const tail =
      p.accessed_by_role === "support_staff"
        ? " (replayed by support staff on the patient's behalf)"
        : "";
    return `${who} replayed the ${artifact} of your consult on ${dateLabel}.${tail}`;
  }
  return "New activity on a recent consult.";
}

export function DoctorDashboardEventFeed({
  token,
  pageSize = 10,
}: DoctorDashboardEventFeedProps): JSX.Element {
  const [state, setState] = useState<FeedState>({ kind: "loading" });
  const [unreadOnly, setUnreadOnly] = useState<boolean>(true);
  const [rowState, setRowState] = useState<Record<string, EventRowState>>({});

  const loadFeed = useCallback(
    async (opts: { unreadOnly: boolean }): Promise<void> => {
      setState({ kind: "loading" });
      try {
        const res = await getDashboardEvents(token, {
          unreadOnly: opts.unreadOnly,
          limit: pageSize,
        });
        const next: Record<string, EventRowState> = {};
        for (const ev of res.data.events) {
          next[ev.id] = { event: ev };
        }
        setRowState(next);
        setState({
          kind: "ready",
          events: res.data.events,
          ...(res.data.nextCursor ? { nextCursor: res.data.nextCursor } : {}),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load notifications.";
        setState({ kind: "error", message });
      }
    },
    [token, pageSize]
  );

  useEffect(() => {
    void loadFeed({ unreadOnly });
  }, [loadFeed, unreadOnly]);

  const handleAcknowledge = useCallback(
    async (eventId: string): Promise<void> => {
      const optimisticAt = new Date().toISOString();
      setRowState((prev) => {
        const current = prev[eventId];
        if (!current) return prev;
        return {
          ...prev,
          [eventId]: {
            ...current,
            optimisticAcknowledgedAt: optimisticAt,
            acking: true,
            ackError: undefined,
          },
        };
      });
      try {
        await acknowledgeDashboardEvent(token, eventId);
        setRowState((prev) => {
          const current = prev[eventId];
          if (!current) return prev;
          return {
            ...prev,
            [eventId]: {
              event: { ...current.event, acknowledgedAt: optimisticAt },
              acking: false,
            },
          };
        });
      } catch (err) {
        setRowState((prev) => {
          const current = prev[eventId];
          if (!current) return prev;
          return {
            ...prev,
            [eventId]: {
              event: current.event,
              acking: false,
              ackError:
                err instanceof Error ? err.message : "Could not mark as read.",
            },
          };
        });
      }
    },
    [token]
  );

  const visibleEvents = useMemo<EventRowState[]>(() => {
    if (state.kind !== "ready") return [];
    return state.events
      .map((ev) => rowState[ev.id] ?? { event: ev })
      .filter((row) => {
        if (!unreadOnly) return true;
        const ackAt =
          row.optimisticAcknowledgedAt ?? row.event.acknowledgedAt;
        return ackAt === null || ackAt === undefined;
      });
  }, [state, rowState, unreadOnly]);

  return (
    <section
      aria-labelledby="doctor-dashboard-feed-heading"
      className="rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2
          id="doctor-dashboard-feed-heading"
          className="text-base font-semibold text-gray-900"
        >
          Notifications
        </h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={!unreadOnly}
            onChange={(e) => setUnreadOnly(!e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Show acknowledged
        </label>
      </header>

      {state.kind === "loading" && (
        <div className="px-4 py-6 text-sm text-gray-500" aria-live="polite">
          Loading notifications…
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
          <button
            type="button"
            onClick={() => void loadFeed({ unreadOnly })}
            className="ml-3 font-medium underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && visibleEvents.length === 0 && (
        <div className="px-4 py-6 text-sm text-gray-500">
          {unreadOnly
            ? "You're all caught up. No unread notifications."
            : "No notifications yet."}
        </div>
      )}

      {state.kind === "ready" && visibleEvents.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {visibleEvents.map((row) => {
            const ackAt =
              row.optimisticAcknowledgedAt ?? row.event.acknowledgedAt;
            const isUnread = ackAt === null || ackAt === undefined;
            return (
              <li
                key={row.event.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  isUnread ? "bg-blue-50/40" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                    isUnread ? "bg-blue-500" : "bg-transparent"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    {describeEvent(row.event)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatRelativeTime(row.event.createdAt)}
                  </p>
                  {row.ackError && (
                    <p
                      role="alert"
                      className="mt-1 text-xs text-red-700"
                    >
                      {row.ackError}
                    </p>
                  )}
                </div>
                {isUnread && (
                  <button
                    type="button"
                    onClick={() => void handleAcknowledge(row.event.id)}
                    disabled={row.acking}
                    className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {row.acking ? "Marking…" : "Mark as read"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default DoctorDashboardEventFeed;
