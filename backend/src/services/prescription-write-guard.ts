/**
 * rxl-23 — writable iff not superseded AND (not yet issued OR issued today).
 *
 * "Issued" for the day clock is issued_at, else attested_at (Finish still
 * stamps only attested_at). A requisition print must not lock a draft.
 * Server clock + doctor timezone — never the client clock.
 */

import { isSameClinicVisitDay } from '../utils/clinic-visit-day';

const TERMINAL_APPOINTMENT_STATUSES = new Set(['cancelled', 'no_show']);

export type PrescriptionWriteGuardReason =
  | 'superseded'
  | 'attested'
  | 'appointment_locked'
  | 'undetermined';

export type PrescriptionWriteGuardDecision =
  | { ok: true }
  | { ok: false; reason: PrescriptionWriteGuardReason };

export interface PrescriptionWriteGuardInput {
  supersededById: string | null | undefined;
  issuedAt: string | null | undefined;
  attestedAt: string | null | undefined;
  appointmentStatus: string;
  now: Date;
  timezone: string;
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}

function parseInstant(iso: string): Date | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export function evaluatePrescriptionWriteGuard(
  input: PrescriptionWriteGuardInput
): PrescriptionWriteGuardDecision {
  if (nonEmpty(input.supersededById)) {
    return { ok: false, reason: 'superseded' };
  }

  if (typeof input.appointmentStatus !== 'string' || input.appointmentStatus.length === 0) {
    return { ok: false, reason: 'undetermined' };
  }

  if (TERMINAL_APPOINTMENT_STATUSES.has(input.appointmentStatus)) {
    return { ok: false, reason: 'appointment_locked' };
  }

  const issuedIso = nonEmpty(input.issuedAt) ?? nonEmpty(input.attestedAt);
  if (!issuedIso) {
    if (input.appointmentStatus === 'completed') {
      return { ok: false, reason: 'appointment_locked' };
    }
    return { ok: true };
  }

  const issuedAt = parseInstant(issuedIso);
  if (!issuedAt) {
    return { ok: false, reason: 'undetermined' };
  }

  if (!isSameClinicVisitDay(issuedAt, input.now, input.timezone)) {
    return { ok: false, reason: 'attested' };
  }

  return { ok: true };
}
