/**
 * Patient OPD session snapshot — mirrors backend CONTRACTS (e-task-opd-04).
 */

import type {
  DoctorQueueSessionRow,
  SlotSessionCounts,
  SlotSessionRow,
} from "./opd-doctor";

export type OpdMode = "slot" | "queue";

export type DoctorBusyWith = "other_patient" | "you";

export type OpdInAppNotificationType =
  | "delay_broadcast"
  | "early_invite"
  | "your_turn_soon"
  | "queue_position_changed";

export interface OpdInAppNotificationHint {
  type: OpdInAppNotificationType;
}

export interface PatientOpdSnapshot {
  appointmentId: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  opdMode: OpdMode;
  suggestedPollSeconds: number;
  delayMinutes?: number | null;
  doctorBusyWith?: DoctorBusyWith;
  slotStart?: string;
  slotEnd?: string;
  earlyInviteAvailable?: boolean;
  earlyInviteExpiresAt?: string | null;
  tokenNumber?: number;
  aheadCount?: number;
  etaMinutes?: number;
  etaRange?: { minMinutes: number; maxMinutes: number };
  /** Polling hints from API (OPD-09) */
  inAppNotifications?: OpdInAppNotificationHint[];
}

export interface OpdSessionSnapshotData {
  snapshot: PatientOpdSnapshot;
}

// ============================================================================
// Per-(doctor, session_date) mode fact row (pdm-01).
// ----------------------------------------------------------------------------
// Mirrors backend table `doctor_opd_session_modes` (migration 100). Consumers
// added in pdm-02 (unified /opd/session endpoint) and pdm-03 (doctor hub +
// snapshot + slot-join grace gate). Today the type sits unused — that's
// expected; pdm-02 wires the first consumer.
//
// Aliases `OpdSessionDayMode` to the existing `OpdMode` above to keep one
// source of truth for the 'slot' | 'queue' union — naming differs because
// downstream tasks reference the per-day shape by `OpdSessionDayMode`.
// ============================================================================

export type OpdSessionDayMode = OpdMode;

export type OpdSessionDayModeSource =
  | "doctor"
  | "policy_default"
  | "backfill"
  | "system_overrun_fallback";

export interface OpdSessionDayModeRow {
  doctorId: string;
  /** ISO date (YYYY-MM-DD) — DATE column, no time component. */
  sessionDate: string;
  mode: OpdSessionDayMode;
  source: OpdSessionDayModeSource;
  changeCount: number;
  /** ISO datetime — last time `mode` actually changed (distinct from updatedAt). */
  changedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Doctor unified OPD session snapshot (pdm-02) — GET /api/v1/opd/session
// ============================================================================

export type QueueSessionRow = DoctorQueueSessionRow;

export interface QueueSessionCounts {
  all: number;
  active: number;
  done: number;
  missed: number;
}

/** Resolver cascade source tag on GET /opd/session (DL-1). */
export type OpdSessionPayloadModeSource =
  | "fact"
  | "policy"
  | "doctor_settings"
  | "default";

export interface OpdSessionPayloadBase {
  date: string;
  snapshotAt: string;
  modeSource: OpdSessionPayloadModeSource;
  modeChangeCount: number;
}

export interface OpdSlotSessionPayload extends OpdSessionPayloadBase {
  mode: "slot";
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
}

export interface OpdQueueSessionPayload extends OpdSessionPayloadBase {
  mode: "queue";
  entries: QueueSessionRow[];
  counts: QueueSessionCounts;
}

export type OpdSessionPayload = OpdSlotSessionPayload | OpdQueueSessionPayload;

// ============================================================================
// Session mode conversion (pdm-04 / pdm-05)
// ============================================================================

/** Mirrors backend `ConvertSessionDayModeResult`. */
export interface ConvertSessionDayModeResult {
  fromMode: OpdSessionDayMode | null;
  toMode: OpdSessionDayMode;
  affected: number;
  overflowCount: number;
  notificationCount: number;
  changeCount: number;
  telemedCount: number;
  snapshotAfter: OpdSessionPayload;
}
