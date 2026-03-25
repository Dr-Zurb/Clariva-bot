/**
 * OPD policy helpers: grace window, reschedule payment keys, queue reinsert defaults (OPD-08).
 * Values come from doctor_settings.opd_policies JSONB (migration 028) with safe defaults.
 */

import type { DoctorSettingsRow } from '../../types/doctor-settings';
import { getSupabaseAdminClient } from '../../config/database';
import { getDoctorSettings } from '../doctor-settings-service';
import { resolveOpdModeFromSettings } from './opd-mode-service';
import { handleSupabaseError } from '../../utils/db-helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';

/** Minutes after scheduled slot start that patient may still join video (slot mode). */
export const DEFAULT_SLOT_JOIN_GRACE_MINUTES = 15;

export type ReschedulePaymentPolicy = 'forfeit' | 'transfer_entitlement';

export type QueueReinsertDefault = 'end_of_queue' | 'after_current';

function policiesObject(settings: DoctorSettingsRow | null | undefined): Record<string, unknown> {
  const raw = settings?.opd_policies;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function getSlotJoinGraceMinutes(settings: DoctorSettingsRow | null | undefined): number {
  const p = policiesObject(settings).slot_join_grace_minutes;
  if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 24 * 60) {
    return Math.floor(p);
  }
  return DEFAULT_SLOT_JOIN_GRACE_MINUTES;
}

/**
 * When patient reschedules after paying: clinic may forfeit fee or treat as transferred entitlement.
 * Product copy is non-prescriptive; enforcement hooks into future paid-reschedule flows.
 */
export function getReschedulePaymentPolicy(
  settings: DoctorSettingsRow | null | undefined
): ReschedulePaymentPolicy {
  const p = policiesObject(settings).reschedule_payment_policy;
  if (p === 'transfer_entitlement') {
    return 'transfer_entitlement';
  }
  return 'forfeit';
}

export function getQueueReinsertDefault(
  settings: DoctorSettingsRow | null | undefined
): QueueReinsertDefault {
  const p = policiesObject(settings).queue_reinsert_default;
  if (p === 'after_current') {
    return 'after_current';
  }
  return 'end_of_queue';
}

/**
 * Slot mode: block patient video join after scheduled start + grace (unless early-join accepted).
 * Queue mode: no fixed clock grace here (token/ETA flow).
 */
export async function assertSlotJoinAllowedForPatient(
  appointmentId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new ValidationError('Service unavailable');
  }

  const { data: apt, error } = await admin
    .from('appointments')
    .select(
      'id, doctor_id, appointment_date, status, opd_early_invite_response'
    )
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }

  if (apt.status !== 'pending' && apt.status !== 'confirmed') {
    throw new ValidationError('This appointment is no longer active');
  }

  const settings = await getDoctorSettings(apt.doctor_id as string);
  const opdMode = resolveOpdModeFromSettings(settings);
  if (opdMode === 'queue') {
    return;
  }

  if (apt.opd_early_invite_response === 'accepted') {
    return;
  }

  const graceMin = getSlotJoinGraceMinutes(settings);
  const slotStart = new Date(apt.appointment_date as string);
  const graceEnd = new Date(slotStart.getTime() + graceMin * 60 * 1000);
  if (new Date() > graceEnd) {
    throw new ValidationError(
      'Your scheduled join window has passed. Please message the clinic to reschedule or discuss options.'
    );
  }
}
