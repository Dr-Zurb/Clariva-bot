"use client";

/**
 * `<DoctorDashboardEventFeed>` — the doctor-facing surface for mutual
 * replay notifications (Plan 07 · Task 30 · Decision 4 + 10 LOCKED)
 * and Alerts v2 operational kinds (alr2-06).
 *
 * Renders the doctor's `doctor_dashboard_events` feed. The component owns:
 *
 *   - First-page fetch on mount, with a "Show acknowledged" toggle that
 *     swaps unread-only ↔ all events.
 *   - Cursor "Load more" when `nextCursor` is present (alerts-v1 · alr-02).
 *   - "Mark as read" per-row + "Mark all as read" (client-loop, ALR-D5),
 *     with optimistic UI and rollback on error.
 *   - Event-kind copy for replay + v2 kinds. Decision 4 mandate:
 *     informational, NOT alarming — no PHI beyond `patient_display_name`
 *     and a date label.
 *   - Severity sort/style (ALR2-D6): `action_needed` above `info` within
 *     the unread bucket; destructive tint + tag for action-needed.
 *   - Deep-links only (ALR2-D9) — navigation does not auto-acknowledge.
 *
 * Auth: the parent (server component) hands a Supabase access token
 * down via `token`. The component never reaches into Supabase directly —
 * the same pattern as `<ServiceReviewsInbox>`.
 *
 * Theme: surfaces use design tokens (`bg-card` / `text-foreground` /
 * `border-border` / destructive) so light + dark both render correctly
 * (alerts-v1 · ALR-D3).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acknowledgeDashboardEvent,
  getDashboardEvents,
  type DashboardEvent,
  type DashboardEventSeverity,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface DoctorDashboardEventFeedProps {
  token: string;
  /**
   * Optional cap on each page fetch. Defaults to 10 — small on purpose;
   * "Load more" pages via `nextCursor` when more exist.
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
  return formatDate(d, {
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
  return formatDate(d, { day: "2-digit", month: "short" });
}

function artifactLabel(
  artifactType: "audio" | "transcript" | "video"
): string {
  if (artifactType === "transcript") return "transcript";
  if (artifactType === "video") return "video";
  return "audio";
}

/** Exported for copy-pinning tests (alerts-v1 · alr-02 / alr2-06). */
export function describeEvent(event: DashboardEvent): string {
  switch (event.eventKind) {
    case "patient_replayed_recording": {
      const p = event.payload;
      const who = p.patient_display_name?.trim() || "A patient";
      const artifact = artifactLabel(p.artifact_type);
      const dateLabel = formatConsultDate(p.consult_date);
      const verb = p.action_kind === "downloaded" ? "downloaded" : "replayed";
      const tail =
        p.accessed_by_role === "support_staff"
          ? " (replayed by support staff on the patient's behalf)"
          : "";
      return `${who} ${verb} the ${artifact} of your consult on ${dateLabel}.${tail}`;
    }
    case "patient_replayed_video": {
      const p = event.payload;
      const who = p.patient_display_name?.trim() || "A patient";
      const dateLabel = formatConsultDate(p.consult_date);
      const tail =
        p.accessed_by_role === "support_staff"
          ? " (replayed by support staff on the patient's behalf)"
          : "";
      return `${who} replayed the video of your consult on ${dateLabel}.${tail}`;
    }
    case "patient_revoked_video_mid_session": {
      const p = event.payload;
      const who = p.patient_display_name?.trim() || "Your patient";
      const dateLabel = formatConsultDate(p.consult_started_at);
      return `${who} turned off video recording during your consult on ${dateLabel}.`;
    }
    case "booking_review_sla_breach": {
      const p = event.payload;
      const who = p.patient_display_name?.trim() || "A patient";
      return `A booking request for ${who} is past its review deadline.`;
    }
    case "appointment_no_show": {
      const p = event.payload;
      const who = p.patient_display_name?.trim() || "A patient";
      const dateLabel = formatConsultDate(p.appointment_date);
      return `${who} didn't show for their appointment on ${dateLabel}.`;
    }
    default: {
      // Forward-compat if a new kind arrives before the client union updates.
      const _exhaustive: never = event;
      void _exhaustive;
      return "New activity on a recent consult.";
    }
  }
}

/**
 * Owning-surface href for Alerts v2 kinds (ALR2-D9). Replay kinds have
 * no deep-link. Navigation only — does not acknowledge the event.
 */
export function eventDeepLink(event: DashboardEvent): string | null {
  switch (event.eventKind) {
    case "booking_review_sla_breach":
      return "/dashboard/booking-review";
    case "appointment_no_show": {
      const id = event.payload.appointment_id?.trim();
      return id ? `/dashboard/appointments/${id}` : null;
    }
    default:
      return null;
  }
}

/** Exported for severity-sort tests (alr2-06). */
export function eventSeverity(event: DashboardEvent): DashboardEventSeverity {
  if (event.eventKind === "booking_review_sla_breach") return "action_needed";
  if (
    "severity" in event.payload &&
    event.payload.severity === "action_needed"
  ) {
    return "action_needed";
  }
  return "info";
}

function isRowUnread(row: EventRowState): boolean {
  const ackAt = row.optimisticAcknowledgedAt ?? row.event.acknowledgedAt;
  return ackAt === null || ackAt === undefined;
}

/** Unread first; within each bucket, action_needed above info; then newer first. */
function compareFeedRows(a: EventRowState, b: EventRowState): number {
  const aUnread = isRowUnread(a) ? 0 : 1;
  const bUnread = isRowUnread(b) ? 0 : 1;
  if (aUnread !== bUnread) return aUnread - bUnread;

  const aSev = eventSeverity(a.event) === "action_needed" ? 0 : 1;
  const bSev = eventSeverity(b.event) === "action_needed" ? 0 : 1;
  if (aSev !== bSev) return aSev - bSev;

  return (
    new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime()
  );
}

export function DoctorDashboardEventFeed({
  token,
  pageSize = 10,
}: DoctorDashboardEventFeedProps): JSX.Element {
  const [state, setState] = useState<FeedState>({ kind: "loading" });
  const [unreadOnly, setUnreadOnly] = useState<boolean>(true);
  const [rowState, setRowState] = useState<Record<string, EventRowState>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>();
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllError, setMarkAllError] = useState<string | undefined>();

  const loadFeed = useCallback(
    async (opts: { unreadOnly: boolean }): Promise<void> => {
      setState({ kind: "loading" });
      setLoadMoreError(undefined);
      setMarkAllError(undefined);
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

  const handleLoadMore = useCallback(async (): Promise<void> => {
    if (state.kind !== "ready" || !state.nextCursor || loadingMore) return;
    const cursor = state.nextCursor;
    setLoadingMore(true);
    setLoadMoreError(undefined);
    try {
      const res = await getDashboardEvents(token, {
        unreadOnly,
        limit: pageSize,
        cursor,
      });
      setRowState((prev) => {
        const next = { ...prev };
        for (const ev of res.data.events) {
          if (!next[ev.id]) next[ev.id] = { event: ev };
        }
        return next;
      });
      setState((prev) => {
        if (prev.kind !== "ready") return prev;
        return {
          kind: "ready",
          events: [...prev.events, ...res.data.events],
          ...(res.data.nextCursor ? { nextCursor: res.data.nextCursor } : {}),
        };
      });
    } catch (err) {
      setLoadMoreError(
        err instanceof Error ? err.message : "Could not load more notifications."
      );
    } finally {
      setLoadingMore(false);
    }
  }, [state, loadingMore, token, unreadOnly, pageSize]);

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
        return isRowUnread(row);
      })
      .slice()
      .sort(compareFeedRows);
  }, [state, rowState, unreadOnly]);

  const unreadVisibleCount = useMemo(
    () => visibleEvents.filter(isRowUnread).length,
    [visibleEvents]
  );

  const handleMarkAllRead = useCallback(async (): Promise<void> => {
    if (markingAll || unreadVisibleCount === 0) return;
    const unreadIds = visibleEvents
      .filter(isRowUnread)
      .map((row) => row.event.id);
    if (unreadIds.length === 0) return;

    setMarkingAll(true);
    setMarkAllError(undefined);
    const optimisticAt = new Date().toISOString();

    setRowState((prev) => {
      const next = { ...prev };
      for (const eventId of unreadIds) {
        const current = next[eventId];
        if (!current) continue;
        next[eventId] = {
          ...current,
          optimisticAcknowledgedAt: optimisticAt,
          acking: true,
          ackError: undefined,
        };
      }
      return next;
    });

    let failureCount = 0;
    for (const eventId of unreadIds) {
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
        failureCount += 1;
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
    }

    if (failureCount > 0) {
      setMarkAllError(
        failureCount === unreadIds.length
          ? "Could not mark notifications as read."
          : `Couldn't mark ${failureCount} of ${unreadIds.length} as read.`
      );
    }
    setMarkingAll(false);
  }, [markingAll, unreadVisibleCount, visibleEvents, token]);

  return (
    <Card aria-labelledby="doctor-dashboard-feed-heading">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border px-4 py-3">
        <CardTitle
          id="doctor-dashboard-feed-heading"
          className="text-base font-semibold text-foreground"
        >
          Notifications
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          {unreadVisibleCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll}
              className="text-sm font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markingAll ? "Marking…" : "Mark all as read"}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={!unreadOnly}
              onChange={(e) => setUnreadOnly(!e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Show acknowledged
          </label>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {state.kind === "loading" && (
          <div className="px-4 py-6 text-sm text-muted-foreground" aria-live="polite">
            Loading notifications…
          </div>
        )}

        {state.kind === "error" && (
          <div
            role="alert"
            className="border-t border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {state.message}
            <button
              type="button"
              onClick={() => void loadFeed({ unreadOnly })}
              className="ml-3 font-medium underline hover:text-destructive"
            >
              Retry
            </button>
          </div>
        )}

        {markAllError && (
          <div
            role="alert"
            className="border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {markAllError}
          </div>
        )}

        {state.kind === "ready" && visibleEvents.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {unreadOnly
              ? "You're all caught up. No unread notifications."
              : "No notifications yet."}
          </div>
        )}

        {state.kind === "ready" && visibleEvents.length > 0 && (
          <ul className="divide-y divide-border">
            {visibleEvents.map((row) => {
              const unread = isRowUnread(row);
              const severity = eventSeverity(row.event);
              const actionNeeded = severity === "action_needed";
              const href = eventDeepLink(row.event);
              const copy = describeEvent(row.event);
              const rowTint = unread
                ? actionNeeded
                  ? "bg-destructive/5"
                  : "bg-primary/5"
                : "";
              const dotTint = unread
                ? actionNeeded
                  ? "bg-destructive"
                  : "bg-primary"
                : "bg-transparent";
              return (
                <li
                  key={row.event.id}
                  className={`flex items-start gap-3 px-4 py-3 ${rowTint}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${dotTint}`}
                  />
                  <div className="flex-1">
                    {actionNeeded && (
                      <span className="mb-1 inline-block rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                        Action needed
                      </span>
                    )}
                    {href ? (
                      <Link
                        href={href}
                        className="block text-sm text-foreground underline-offset-2 hover:underline"
                      >
                        {copy}
                      </Link>
                    ) : (
                      <p className="text-sm text-foreground">{copy}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(row.event.createdAt)}
                    </p>
                    {row.ackError && (
                      <p
                        role="alert"
                        className="mt-1 text-xs text-destructive"
                      >
                        {row.ackError}
                      </p>
                    )}
                  </div>
                  {unread && (
                    <button
                      type="button"
                      onClick={() => void handleAcknowledge(row.event.id)}
                      disabled={row.acking || markingAll}
                      className="rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {row.acking ? "Marking…" : "Mark as read"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {state.kind === "ready" && state.nextCursor && (
          <div className="border-t border-border px-4 py-3">
            {loadMoreError && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {loadMoreError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="text-sm font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DoctorDashboardEventFeed;
