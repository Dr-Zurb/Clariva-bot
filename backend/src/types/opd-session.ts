/**
 * Patient-facing OPD session snapshot (e-task-opd-04).
 * No PHI — ids, status, scheduling context only.
 */

import type { OpdMode } from './doctor-settings';
import type { AppointmentStatus } from './database';

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
 * @see docs/Reference/CONTRACTS.md — Patient OPD session snapshot
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

