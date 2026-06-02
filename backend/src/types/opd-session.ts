/**
 * Patient-facing OPD session snapshot (e-task-opd-04).
 * No PHI — ids, status, scheduling context only.
 */

import type { OpdMode } from './doctor-settings';
import type { AppointmentStatus } from './database';
import type { DoctorQueueSessionRow } from './opd-doctor-queue';
import type { SlotSessionCounts, SlotSessionRow } from './opd-slot-session';

/** Doctor is in an active video consult with someone */
export type DoctorBusyWith = 'other_patient' | 'you';

/** In-app notification hint types (OPD-09); client compares polls for queue order changes */
export type OpdInAppNotificationType =
  | 'delay_broadcast'
  | 'early_invite'
  | 'your_turn_soon'
  | 'queue_position_changed';

export interface OpdInAppNotificationHint {
  type: OpdInAppNotificationType;
}

/**
 * JSON returned by GET /api/v1/bookings/session/snapshot
 * @see docs/Reference/engineering/architecture/CONTRACTS.md — Patient OPD session snapshot
 */
export interface PatientOpdSnapshot {
  appointmentId: string;
  status: AppointmentStatus;
  opdMode: OpdMode;
  /** Client polling hint (seconds); also exposed via Cache-Control max-age */
  suggestedPollSeconds: number;
  /** Minutes past scheduled start while still waiting (pending/confirmed, consult not started) */
  delayMinutes?: number | null;
  /** If doctor has an in-progress consult on another visit vs yours */
  doctorBusyWith?: DoctorBusyWith;
  /** Slot mode — ISO datetimes */
  slotStart?: string;
  slotEnd?: string;
  /** Slot mode — early join offered and not yet answered */
  earlyInviteAvailable?: boolean;
  earlyInviteExpiresAt?: string | null;
  /** Queue mode */
  tokenNumber?: number;
  aheadCount?: number;
  etaMinutes?: number;
  etaRange?: { minMinutes: number; maxMinutes: number };
  /** In-app / polling hints (OPD-09); no push transport in MVP */
  inAppNotifications?: OpdInAppNotificationHint[];
}

// ============================================================================
// Doctor unified OPD session snapshot (pdm-02) — GET /api/v1/opd/session
// ============================================================================

export type QueueSessionRow = DoctorQueueSessionRow;

/** Resolver cascade source tag on GET /opd/session (DL-1). */
export type OpdSessionPayloadModeSource =
  | 'fact'
  | 'policy'
  | 'doctor_settings'
  | 'default';

export interface QueueSessionCounts {
  all: number;
  active: number;
  done: number;
  missed: number;
}

export interface OpdSessionPayloadBase {
  date: string;
  snapshotAt: string;
  modeSource: OpdSessionPayloadModeSource;
  modeChangeCount: number;
}

export interface OpdSlotSessionPayload extends OpdSessionPayloadBase {
  mode: 'slot';
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
}

export interface OpdQueueSessionPayload extends OpdSessionPayloadBase {
  mode: 'queue';
  entries: QueueSessionRow[];
  counts: QueueSessionCounts;
}

export type OpdSessionPayload = OpdSlotSessionPayload | OpdQueueSessionPayload;

