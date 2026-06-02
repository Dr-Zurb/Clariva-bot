/**
 * ALL TELEMETRY PAYLOADS MUST BE PHI-FREE. COUNTS AND ENUMS ONLY.
 * REVIEWER: REJECT ANY PR THAT ADDS FREE-TEXT PATIENT FIELDS TO PAYLOAD TYPES.
 *
 * PHI-free telemetry helpers for OPD queue + slot hub.
 * Match the pattern in OpdQueueStrip's `cockpit.opd_strip.viewed` event:
 * structured payload, no patient identifiers, count-only where applicable.
 *
 * Call sites: OpdTodayClient, OpdQueueRowActions, OpdQueueStatusFilter,
 * OpdQueueSearchBox, OpdQueueSessionToolbar, OpdSlotRowActions, OpdSlotStatusFilter,
 * shared/BroadcastDelayPopover, shared/OfferEarlyJoinPopover.
 *
 * Future enhancement: replace `console.debug` with a real analytics SDK call
 * (Mixpanel / PostHog / Segment). These helpers are the single place to swap wiring.
 */

import type { SlotSessionCounts } from "@/types/opd-doctor";
import type { OpdSessionDayMode } from "@/types/opd-session";

export type OpdQueueEvent =
  | {
      event: "opd_queue.viewed";
      totalActive: number;
      totalDone: number;
      totalMissed: number;
    }
  | {
      event: "opd_queue.row_clicked";
      statusOfClickedRow: string; // queue status enum value — NO patient identifiers
      viaKeyboard: boolean;
      viaSearch: boolean;
    }
  | {
      event: "opd_queue.filter_changed";
      kind: "status" | "search";
      statusValue: string | null; // when kind === 'status'
      queryLength: number | null; // when kind === 'search' — LENGTH ONLY, not the query string
    }
  | {
      event: "opd_queue.action";
      action:
        | "mark_called_silently"
        | "requeue_after_current"
        | "send_to_end"
        | "mark_no_show"
        | "broadcast_delay_set"
        | "broadcast_delay_cleared"
        | "offer_early_join_sent";
      statusOfTargetRow: string | null; // queue status before the action — NO patient identifiers
      outcome: "success" | "error";
    };

export type OpdSlotEventName =
  | "opd_slot.viewed"
  | "opd_slot.action"
  | "opd_slot.filter_changed"
  | "opd_slot.row_clicked";

export type OpdSlotEvent =
  | {
      event: "opd_slot.viewed";
      counts?: SlotSessionCounts;
    }
  | {
      event: "opd_slot.row_clicked";
      kind?: string;
      entryId: string;
      slotStatus: string;
    }
  | {
      event: "opd_slot.filter_changed";
      kind: "status" | "search";
      statusValue: string | null;
      queryLength: number | null;
    }
  | {
      event: "opd_slot.action";
      kind: string;
      entryId?: string;
      slotStatus?: string | null;
      outcome: "success" | "error";
    };

/**
 * Fire a PHI-free telemetry event for the OPD queue page.
 * Wrapped in try/catch so telemetry can never break the UI.
 */
export function trackOpdQueueEvent(payload: OpdQueueEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.debug("[opd_queue]", payload);
  } catch {
    // Telemetry must never break the UI.
  }
}

/**
 * Fire a PHI-free telemetry event for the OPD slot-mode hub.
 * Wrapped in try/catch so telemetry can never break the UI.
 */
export function trackOpdSlotEvent(payload: OpdSlotEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.debug("[opd_slot]", payload);
  } catch {
    // Telemetry must never break the UI.
  }
}

export type OpdSessionModeFlipSource = "opd_tab" | "settings" | "unknown";

export type OpdSessionModeEvent = {
  event: "opd_session.mode_flipped";
  from: OpdSessionDayMode;
  to: OpdSessionDayMode;
  affected_count: number;
  overflow_count: number;
  source: OpdSessionModeFlipSource;
};

/**
 * PHI-free telemetry for per-day OPD mode conversion (pdm-05 / pdm-11).
 */
export function trackOpdSessionModeEvent(payload: OpdSessionModeEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.debug("[opd_session]", payload);
  } catch {
    // Telemetry must never break the UI.
  }
}
