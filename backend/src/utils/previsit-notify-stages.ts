/**
 * Pure stage resolver for the pre-visit notify ladder.
 * No DB / notification imports — safe for unit tests.
 */

import { resolveLobbyPresence } from './lobby-presence';

export type PrevisitNotifyStage =
  | 'reminder_24h'
  | 'checkin_30'
  | 'nudge_15'
  | 'nudge_5'
  | 'starting_now';

const MS_MIN = 60_000;

/** How long after scheduled start we still fire the T=0 ping (cron lag). */
export const STARTING_NOW_GRACE_MINUTES = 2;

export type PrevisitAptRow = {
  id: string;
  appointment_date: string;
  patient_checkin_notified_at: string | null;
  patient_reminder_24h_notified_at: string | null;
  patient_checkin_nudge_15_notified_at: string | null;
  patient_checkin_nudge_5_notified_at: string | null;
  patient_start_notified_at: string | null;
  patient_checked_in_at: string | null;
  patient_lobby_last_seen_at: string | null;
};

/**
 * Most urgent stage due for this appointment at `nowMs`, or null.
 * Prefer first check-in invite over nudges when both are due.
 * T=0 `starting_now` wins once the slot time has arrived.
 */
export function resolvePrevisitStageDue(
  apt: PrevisitAptRow,
  nowMs: number,
  checkinLeadMinutes: number,
  options?: { forceCheckin30?: boolean }
): PrevisitNotifyStage | null {
  const startMs = new Date(apt.appointment_date).getTime();
  if (!Number.isFinite(startMs) && !options?.forceCheckin30) return null;

  const minutesToStart = Number.isFinite(startMs)
    ? (startMs - nowMs) / MS_MIN
    : Number.POSITIVE_INFINITY;

  const waiting =
    resolveLobbyPresence({
      checkedInAt: apt.patient_checked_in_at,
      lastSeenAt: apt.patient_lobby_last_seen_at,
      nowMs,
    }) === 'waiting';

  // T=0 — slot time reached (small grace for cron lag). Skip if already Waiting.
  if (
    Number.isFinite(startMs) &&
    minutesToStart <= 0 &&
    minutesToStart >= -STARTING_NOW_GRACE_MINUTES &&
    !apt.patient_start_notified_at &&
    !waiting
  ) {
    return 'starting_now';
  }

  // Pre-start stages require minutesToStart > 0 so T=0 is only `starting_now`.
  if (
    !apt.patient_checkin_notified_at &&
    (options?.forceCheckin30 ||
      (minutesToStart > 0 && minutesToStart <= checkinLeadMinutes))
  ) {
    return 'checkin_30';
  }

  const checkinSettled =
    !!apt.patient_checkin_notified_at &&
    nowMs - new Date(apt.patient_checkin_notified_at).getTime() >= 3 * MS_MIN;

  if (
    checkinSettled &&
    minutesToStart > 0 &&
    minutesToStart <= 5 &&
    !apt.patient_checkin_nudge_5_notified_at &&
    !waiting
  ) {
    return 'nudge_5';
  }
  if (
    checkinSettled &&
    minutesToStart > 0 &&
    minutesToStart <= 15 &&
    !apt.patient_checkin_nudge_15_notified_at &&
    !waiting
  ) {
    return 'nudge_15';
  }

  if (
    minutesToStart >= 23 * 60 &&
    minutesToStart <= 24 * 60 &&
    !apt.patient_reminder_24h_notified_at
  ) {
    return 'reminder_24h';
  }

  return null;
}
