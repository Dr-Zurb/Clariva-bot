import type { AppointmentBookingOrigin } from '../../types/database';
import type {
  SlotStatus,
  SlotTag,
  SlotTiming,
  VisitLifecycle,
} from '../../types/opd-slot-session';
import {
  consultationSessionStarted,
  type IncompleteConsultSessionInput,
} from '../../utils/incomplete-consult';
import { resolveLobbyPresence } from '../../utils/lobby-presence';

export interface DeriveSlotAxesInput {
  appointmentStatus: string;
  scheduledAtMs: number;
  nowMs: number;
  graceMinutes: number;
  /** Latest / best consultation_sessions row for this appointment, if any. */
  session: IncompleteConsultSessionInput | null;
  opdEventType: 'standard' | 'return_after_completed' | null;
  bookingOrigin: AppointmentBookingOrigin | null | undefined;
  delayMinutes: number | null;
  earlyInviteExpiresAt: string | null;
  earlyInviteResponse: 'accepted' | 'declined' | null;
  /** Lobby presence stamps (migration 193 / crc-02). */
  patientCheckedInAt?: string | null;
  patientLobbyLastSeenAt?: string | null;
}

export interface SlotAxes {
  lifecycle: VisitLifecycle;
  timing: SlotTiming | null;
  tags: SlotTag[];
}

/**
 * Axis 1 — visit lifecycle (OSM-D1 / OSM-D5 / OSM-D10).
 *
 * Order (first match wins within this axis only):
 *   cancelled → completed → no_show → in_consult → incomplete → scheduled
 *
 * Live always wins over incomplete (do not use `isIncompleteConsult` alone —
 * it is true for live sessions and is KPI-shaped, not badge-shaped).
 */
export function deriveLifecycle(input: DeriveSlotAxesInput): VisitLifecycle {
  if (input.appointmentStatus === 'cancelled') return 'cancelled';
  if (input.appointmentStatus === 'completed') return 'completed';
  if (input.appointmentStatus === 'no_show') return 'no_show';

  const session = input.session;
  if (session?.status === 'live') return 'in_consult';
  if (session && consultationSessionStarted(session)) return 'incomplete';
  return 'scheduled';
}

/**
 * Axis 2 — clock band. Always computed for non-terminal lifecycle; null otherwise.
 *
 * Doctor-board rule: the moment `now` passes slot start, band is `late`.
 * `slot_join_grace_minutes` only softens the *pre-start* window (`due` =
 * "about to start"). Post-start join forgiveness stays a patient/policy
 * concern — it must not keep the board badge on Scheduled.
 */
export function deriveTiming(
  input: DeriveSlotAxesInput,
  lifecycle: VisitLifecycle
): SlotTiming | null {
  if (
    lifecycle === 'completed' ||
    lifecycle === 'cancelled' ||
    lifecycle === 'no_show'
  ) {
    return null;
  }

  const graceMs = input.graceMinutes * 60_000;
  const startsIn = input.scheduledAtMs - input.nowMs;
  const minutesToStart = Math.round(startsIn / 60_000);

  let band: SlotTiming['band'];
  // At or past start → late (doctor board). Pre-start grace → due.
  if (startsIn <= 0) band = 'late';
  else if (startsIn <= graceMs) band = 'due';
  else band = 'early';

  return { minutesToStart, band };
}

/**
 * Axis 3 — tags from stored provenance + row modifiers (OSM-D2 / OSM-D4).
 * Does not infer overflow from created_at.
 */
export function deriveTags(input: DeriveSlotAxesInput): SlotTag[] {
  const tags: SlotTag[] = [];
  const origin = input.bookingOrigin ?? 'booked';

  if (origin === 'overflow') tags.push('overflow');
  if (origin === 'walk_in') tags.push('walk_in');
  if (origin === 'rebooked') tags.push('rebooked');
  if (
    origin === 'return_after_completed' ||
    input.opdEventType === 'return_after_completed'
  ) {
    tags.push('return_visit');
  }

  if (
    input.earlyInviteExpiresAt != null &&
    input.earlyInviteResponse !== 'declined'
  ) {
    tags.push('early_invited');
  }

  if (input.delayMinutes != null && input.delayMinutes > 0) {
    tags.push('delayed');
  }

  const presence = resolveLobbyPresence({
    checkedInAt: input.patientCheckedInAt,
    lastSeenAt: input.patientLobbyLastSeenAt,
    nowMs: input.nowMs,
  });
  if (presence === 'waiting') tags.push('patient_waiting');
  else if (presence === 'stepped_away') tags.push('patient_stepped_away');

  return tags;
}

export function deriveSlotAxes(input: DeriveSlotAxesInput): SlotAxes {
  const lifecycle = deriveLifecycle(input);
  const timing = deriveTiming(input, lifecycle);
  const tags = deriveTags(input);
  return { lifecycle, timing, tags };
}

/**
 * One-release wire compat (OSM-D7).
 *
 * Trade-off: when tags include `overflow` and lifecycle is still `scheduled`,
 * legacy consumers see `overflow` and still lose Late-on-Overflow. New axes
 * preserve both facts; only this shim collapses them.
 */
export function toLegacySlotStatus(
  lifecycle: VisitLifecycle,
  timing: SlotTiming | null,
  tags: readonly SlotTag[]
): SlotStatus {
  if (lifecycle === 'cancelled') return 'cancelled';
  if (lifecycle === 'completed') return 'completed';
  if (lifecycle === 'no_show') return 'missed';
  if (lifecycle === 'in_consult') return 'in_consultation';
  // Incomplete mapped to in_consultation so existing Incomplete filter chips
  // keep matching until osm-03 reads lifecycle directly.
  if (lifecycle === 'incomplete') return 'in_consultation';
  if (tags.includes('overflow')) return 'overflow';
  if (timing?.band === 'late') return 'running_late';
  return 'upcoming';
}

/**
 * @deprecated Prefer `deriveSlotAxes` + `toLegacySlotStatus` (osm-02).
 * Thin wrapper for any remaining callers during the transition.
 */
export function deriveSlotStatus(input: DeriveSlotAxesInput): SlotStatus {
  const axes = deriveSlotAxes(input);
  return toLegacySlotStatus(axes.lifecycle, axes.timing, axes.tags);
}
