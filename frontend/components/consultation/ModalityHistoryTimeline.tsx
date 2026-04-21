"use client";

/**
 * `<ModalityHistoryTimeline>` — post-consult modality timeline on the
 * appointment detail page (Plan 09 · Task 55 · Decision 11 LOCKED).
 *
 * Renders the chronological arc of a consult: synthetic "Started as X"
 * anchor → zero-to-two transition entries (pulled from
 * `GET /modality-change/history`) → synthetic "Consult ended" or
 * "Consult in progress" anchor. Both parties (doctor + patient) see
 * every transition, initiator, billing action, reason, and amount.
 *
 * Designed to sit below the recording artifacts on the appointment
 * detail page (per plan line 348). Mounting is deferred to the
 * appointment detail host component (PR-time probe); this file
 * exports the pure presentation + data-fetching surface.
 *
 * Empty-state doctrine:
 *   Callers that want to hide the widget when no transitions
 *   occurred should guard the mount themselves (the plan's
 *   recommended guard is
 *   `initialModality !== currentModality || upgradeCount > 0 ||
 *    downgradeCount > 0`). This component always renders the anchor
 *   frame when it has data; rendering an empty timeline is a valid
 *   state for a debugging probe.
 *
 * Refund-status display:
 *   - Settled (`razorpayRefundId != null`)            → green "Processed" badge.
 *   - Pending (`razorpayRefundId == null` + not perm) → amber "Pending" badge.
 *   - Permanent failure (Task 49 sentinel)            → red "Support contacted" badge.
 *
 * Accessibility:
 *   - Timeline wrapped in `<ol>` (semantic ordered list).
 *   - Icons have `aria-hidden="true"`.
 *   - Timestamps in `<time>` with ISO `dateTime` attribute.
 *   - Refund-status badges carry `aria-label` text beyond colour.
 *   - Currency formatted via `Intl.NumberFormat('en-IN', 'INR')`.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  ModalityHistoryResponse,
  ModalityHistoryTimelineEntry,
  Modality,
} from "@/types/modality-change";
import { fetchModalityHistory } from "@/lib/api/modality-change";
import { formatInrPaise } from "@/lib/modality-pricing-display";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModalityHistoryTimelineProps {
  sessionId: string;
  /**
   * JWT used against `GET /modality-change/history`. Doctor: Supabase
   * session JWT; patient: Supabase session JWT (the history endpoint
   * uses full-session auth, not the scoped replay token — patients see
   * their own consults via their own session).
   */
  token: string;
  /** Drives per-perspective copy (`You requested…` vs `Patient requested…`). */
  viewerRole: "patient" | "doctor";
  /** Display name for the doctor seat. Fallback: "Doctor". */
  doctorName: string;
  /** Display name for the patient seat. Fallback: "Patient". */
  patientName: string;
  /**
   * Tight single-line-per-entry mode for embedded contexts (appointment
   * list popovers, dashboard feeds). v1 doesn't surface a caller; the
   * prop is wired for v1.1.
   */
  compact?: boolean;
  /** Optional outer className for layout integration. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Internal phase state
// ---------------------------------------------------------------------------

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; status?: number }
  | { kind: "loaded"; data: ModalityHistoryResponse };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModalityHistoryTimeline(
  props: ModalityHistoryTimelineProps,
): JSX.Element {
  const {
    sessionId,
    token,
    viewerRole,
    doctorName,
    patientName,
    compact = false,
    className,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async (): Promise<void> => {
    setPhase({ kind: "loading" });
    try {
      const data = await fetchModalityHistory(token, sessionId);
      setPhase({ kind: "loaded", data });
    } catch (err) {
      const e = err as Error & { status?: number };
      setPhase({
        kind: "error",
        message: e.message || "Couldn't load modality history",
        status: e.status,
      });
    }
  }, [sessionId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase.kind === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Loading modality timeline"
        className={classes("space-y-2", className)}
      >
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </section>
    );
  }

  if (phase.kind === "error") {
    return (
      <section
        role="alert"
        className={classes(
          "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800",
          className,
        )}
      >
        <p className="font-medium">Couldn&apos;t load modality history.</p>
        {phase.status === 403 ? (
          <p className="mt-1 text-xs">You don&apos;t have access to this consult&apos;s history.</p>
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex items-center rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Retry
          </button>
        )}
      </section>
    );
  }

  const { session, entries } = phase.data;

  // Display names — fall back gracefully.
  const names = {
    doctor: doctorName.trim() || "Doctor",
    patient: patientName.trim() || "Patient",
  } as const;

  return (
    <section
      aria-label="Modality timeline"
      className={classes("space-y-1", className)}
    >
      <ol className="relative space-y-1">
        <TimelineAnchor
          kind="start"
          timestamp={session.startedAt}
          text={`Started as ${titleCaseModality(session.initialModality)}`}
          compact={compact}
        />
        {entries.map((entry) => (
          <TimelineRow
            key={entry.id}
            entry={entry}
            viewerRole={viewerRole}
            names={names}
            compact={compact}
          />
        ))}
        <TimelineAnchor
          kind="end"
          timestamp={session.endedAt ?? null}
          text={session.endedAt ? "Consult ended" : "Consult in progress"}
          compact={compact}
        />
      </ol>
    </section>
  );
}

// ===========================================================================
// Anchor rows (synthetic start + end)
// ===========================================================================

interface TimelineAnchorProps {
  kind: "start" | "end";
  /** ISO timestamp; `null` renders a dash for in-progress consults. */
  timestamp: string | null;
  text: string;
  compact: boolean;
}

function TimelineAnchor(props: TimelineAnchorProps): JSX.Element {
  const { kind, timestamp, text, compact } = props;
  const icon = kind === "start" ? "●" : "⏹";
  return (
    <li
      className={
        compact
          ? "flex items-center gap-2 text-sm text-gray-700"
          : "flex items-start gap-3 border-t border-gray-100 py-2 first:border-t-0"
      }
      data-anchor={kind}
    >
      <Timestamp iso={timestamp} compact={compact} />
      <span className="flex items-center gap-2 text-gray-700">
        <span aria-hidden="true" className="text-gray-400">
          {icon}
        </span>
        <span className="font-medium">{text}</span>
      </span>
    </li>
  );
}

// ===========================================================================
// Transition row
// ===========================================================================

interface TimelineRowProps {
  entry: ModalityHistoryTimelineEntry;
  viewerRole: "patient" | "doctor";
  names: { doctor: string; patient: string };
  compact: boolean;
}

function TimelineRow(props: TimelineRowProps): JSX.Element {
  const { entry, viewerRole, names, compact } = props;
  const direction = classifyDirection(entry.fromModality, entry.toModality);
  const icon = direction === "upgrade" ? "▲" : "▼";
  const iconColor =
    direction === "upgrade" ? "text-emerald-600" : "text-amber-600";

  const body = renderEntryCopy(entry, viewerRole, names);
  const refund = renderRefundBadge(entry);

  return (
    <li
      className={
        compact
          ? "flex items-center gap-2 text-sm text-gray-800"
          : "flex items-start gap-3 border-t border-gray-100 py-2"
      }
      data-entry-id={entry.id}
      data-direction={direction}
      data-billing={entry.billingAction}
    >
      <Timestamp iso={entry.occurredAt} compact={compact} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-gray-800">
          <span aria-hidden="true" className={iconColor}>
            {icon}
          </span>
          <span className="font-medium">{body.headline}</span>
          {refund ? refund : null}
        </p>
        {!compact && body.detail ? (
          <p className="mt-0.5 text-sm text-gray-600">{body.detail}</p>
        ) : null}
        {!compact && entry.reason ? (
          <p className="mt-0.5 text-sm italic text-gray-500">
            <span className="not-italic text-gray-400">Reason: </span>
            {entry.reason}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ===========================================================================
// Copy renderer — variant per (initiatedBy × billingAction × viewerRole).
// Kept local to the component (per Task 55 §"Copy reuse" decision; the
// chat copy in `system-message-copy.ts` is neutral 3rd-person and not
// directly reusable for this denser timeline form).
// ===========================================================================

interface RenderedCopy {
  headline: string;
  /** Secondary explanatory line (rendered beneath the headline in non-compact mode). */
  detail?: string;
}

function renderEntryCopy(
  entry: ModalityHistoryTimelineEntry,
  viewerRole: "patient" | "doctor",
  names: { doctor: string; patient: string },
): RenderedCopy {
  const direction = classifyDirection(entry.fromModality, entry.toModality);
  const target = titleCaseModality(entry.toModality);
  const doctorLabel = `Dr. ${names.doctor}`;
  const patientLabel = names.patient;

  // Who appears as the subject / object depends on viewerRole.
  const initiatorSubject =
    entry.initiatedBy === "patient"
      ? viewerRole === "patient"
        ? "You"
        : patientLabel
      : viewerRole === "doctor"
      ? "You"
      : doctorLabel;

  const responderLabel =
    entry.initiatedBy === "patient"
      ? viewerRole === "doctor"
        ? "you"
        : doctorLabel
      : viewerRole === "patient"
      ? "you"
      : patientLabel;

  if (direction === "upgrade") {
    switch (entry.billingAction) {
      case "paid_upgrade": {
        // Patient-initiated paid upgrade: "You/Patient requested upgrade to
        // VOICE" + "Dr. Sharma/you approved (charged ₹150)".
        const verbResponder =
          entry.initiatedBy === "patient"
            ? `${responderLabel} approved`
            : // doctor-initiated paid upgrades don't exist in v1 (Decision 11);
              // fall through to a safe neutral copy just in case.
              `${initiatorSubject} applied`;
        const charged =
          entry.amountPaise != null
            ? ` (charged ${formatInrPaise(entry.amountPaise)})`
            : "";
        return {
          headline: `${initiatorSubject} requested upgrade to ${target}`,
          detail: `${capitalize(verbResponder)}${charged}`,
        };
      }
      case "free_upgrade": {
        if (entry.initiatedBy === "patient") {
          return {
            headline: `${initiatorSubject} requested upgrade to ${target}`,
            detail: `${capitalize(responderLabel)} approved (free)`,
          };
        }
        // Doctor-initiated free upgrade (requires patient consent).
        return {
          headline: `${initiatorSubject} upgraded to ${target} (free)`,
          detail: undefined,
        };
      }
      default: {
        // Any other billingAction on an upgrade shouldn't happen per
        // Decision 11's 2x2 matrix; render a neutral fallback.
        return {
          headline: `${initiatorSubject} upgraded to ${target}`,
        };
      }
    }
  }

  // Downgrade branch.
  switch (entry.billingAction) {
    case "no_refund_downgrade": {
      return {
        headline: `${initiatorSubject} switched to ${target}`,
        detail: "No refund.",
      };
    }
    case "auto_refund_downgrade": {
      const amount =
        entry.amountPaise != null ? formatInrPaise(entry.amountPaise) : null;
      if (entry.refundFailedPermanent) {
        return {
          headline: `${initiatorSubject} downgraded to ${target}`,
          detail: amount
            ? `Refund of ${amount} needs manual attention.`
            : "Refund needs manual attention.",
        };
      }
      const refundSettled = entry.razorpayRefundId != null;
      if (refundSettled) {
        // Use the patient-focussed phrasing ("Patient refunded …" / "You
        // were refunded …") so the beneficiary is always named.
        const refundSubject =
          viewerRole === "patient" ? "You were refunded" : "Patient refunded";
        return {
          headline: `${initiatorSubject} downgraded to ${target}`,
          detail: amount ? `${refundSubject} ${amount}.` : `${refundSubject}.`,
        };
      }
      // Pending branch.
      return {
        headline: `${initiatorSubject} downgraded to ${target}`,
        detail: amount
          ? `Refund of ${amount} processing.`
          : "Refund processing.",
      };
    }
    default: {
      return {
        headline: `${initiatorSubject} downgraded to ${target}`,
      };
    }
  }
}

// ===========================================================================
// Refund-status badge
// ===========================================================================

function renderRefundBadge(
  entry: ModalityHistoryTimelineEntry,
): JSX.Element | null {
  if (entry.billingAction !== "auto_refund_downgrade") return null;
  if (entry.refundFailedPermanent) {
    return (
      <span
        role="status"
        aria-label="Refund needs manual attention; support contacted"
        className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
      >
        Support contacted
      </span>
    );
  }
  if (entry.razorpayRefundId == null) {
    return (
      <span
        role="status"
        aria-label="Refund pending — expect within 3 business days"
        className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
      >
        Pending
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label="Refund processed"
      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
    >
      ✓ Processed
    </span>
  );
}

// ===========================================================================
// Small presentational helpers
// ===========================================================================

function Timestamp(props: { iso: string | null; compact: boolean }): JSX.Element {
  const { iso, compact } = props;
  const label = iso ? formatLocalTime(iso) : "—";
  return (
    <time
      dateTime={iso ?? undefined}
      className={
        compact
          ? "shrink-0 font-mono text-xs text-gray-500"
          : "w-14 shrink-0 pt-0.5 font-mono text-xs text-gray-500"
      }
    >
      {label}
    </time>
  );
}

function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
      <div className="h-3 flex-1 animate-pulse rounded bg-gray-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function classifyDirection(
  from: Modality,
  to: Modality,
): "upgrade" | "downgrade" | "noop" {
  const rank: Record<Modality, number> = { text: 0, voice: 1, video: 2 };
  if (rank[to] > rank[from]) return "upgrade";
  if (rank[to] < rank[from]) return "downgrade";
  return "noop";
}

function titleCaseModality(m: Modality): string {
  return m === "text" ? "Text" : m === "voice" ? "Voice" : "Video";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format an ISO-8601 timestamp as local `HH:mm`. Uses
 * `Intl.DateTimeFormat` with `hour12: false` so it matches the Indian
 * convention of 24h clocks on consult artifacts.
 */
function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "—";
  }
}

function classes(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
