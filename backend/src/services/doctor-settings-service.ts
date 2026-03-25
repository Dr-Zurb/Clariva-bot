/**
 * Doctor Settings Service (e-task-4.1, e-task-2)
 *
 * Loads per-doctor appointment fee, currency, and country from DB.
 * Used by webhook-worker when creating payment links; env provides fallback
 * when doctor has no row or column is null.
 *
 * API: getDoctorSettingsForUser, updateDoctorSettings (auth required, validateOwnership).
 *
 * @see e-task-4.1-per-doctor-payment-settings.md
 * @see e-task-2-doctor-settings-api.md
 */

import { getSupabaseAdminClient } from '../config/database';
import type { DoctorSettingsRow, OpdMode, PayoutSchedule } from '../types/doctor-settings';
import { validateOwnership } from '../utils/db-helpers';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { InternalError, ValidationError } from '../utils/errors';

const SELECT_COLUMNS =
  'doctor_id, appointment_fee_minor, appointment_fee_currency, country, ' +
  'practice_name, timezone, slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, ' +
  'cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes, ' +
  'welcome_message, specialty, address_summary, consultation_types, default_notes, ' +
  'payout_schedule, payout_minor, razorpay_linked_account_id, ' +
  'opd_mode, opd_policies, ' +
  'created_at, updated_at';

/** Default values when no row exists (for API GET response). */
const DEFAULT_SETTINGS: DoctorSettingsRow = {
  doctor_id: '',
  appointment_fee_minor: null,
  appointment_fee_currency: null,
  country: null,
  practice_name: null,
  timezone: 'Asia/Kolkata',
  slot_interval_minutes: 15,
  max_advance_booking_days: 90,
  min_advance_hours: 0,
  business_hours_summary: null,
  cancellation_policy_hours: null,
  max_appointments_per_day: null,
  booking_buffer_minutes: null,
  welcome_message: null,
  specialty: null,
  address_summary: null,
  consultation_types: null,
  default_notes: null,
  payout_schedule: null,
  payout_minor: null,
  razorpay_linked_account_id: null,
  opd_mode: 'slot',
  opd_policies: null,
  created_at: '',
  updated_at: '',
};

/**
 * Get doctor settings by doctor ID (service role).
 * Returns null if no row exists.
 */
export async function getDoctorSettings(doctorId: string): Promise<DoctorSettingsRow | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('doctor_settings')
    .select(SELECT_COLUMNS)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return data as DoctorSettingsRow | null;
}

/**
 * Get doctor settings for authenticated user (API).
 * Validates ownership; returns row or default object when no row exists.
 *
 * @param doctorId - Doctor ID (must match userId)
 * @param userId - Authenticated user ID
 * @param correlationId - Request correlation ID
 * @returns Doctor settings (row or defaults)
 */
export async function getDoctorSettingsForUser(
  doctorId: string,
  userId: string,
  correlationId: string
): Promise<DoctorSettingsRow> {
  validateOwnership(doctorId, userId);

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }

  const { data, error } = await supabase
    .from('doctor_settings')
    .select(SELECT_COLUMNS)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, userId, 'doctor_settings', undefined);

  if (!data) {
    return { ...DEFAULT_SETTINGS, doctor_id: doctorId };
  }
  return data as unknown as DoctorSettingsRow;
}

/** Valid slot interval range: 1–60 minutes. */
const SLOT_INTERVAL_MIN = 1;
const SLOT_INTERVAL_MAX = 60;

/** Payload for partial update of doctor settings. */
export interface UpdateDoctorSettingsPayload {
  practice_name?: string | null;
  timezone?: string;
  slot_interval_minutes?: number;
  max_advance_booking_days?: number;
  min_advance_hours?: number;
  business_hours_summary?: string | null;
  cancellation_policy_hours?: number | null;
  max_appointments_per_day?: number | null;
  booking_buffer_minutes?: number | null;
  welcome_message?: string | null;
  specialty?: string | null;
  address_summary?: string | null;
  consultation_types?: string | null;
  default_notes?: string | null;
  /** Appointment fee in smallest unit (paise INR, cents USD). e.g. 50000 = ₹500 */
  appointment_fee_minor?: number | null;
  /** Currency code e.g. INR, USD */
  appointment_fee_currency?: string | null;
  /** When doctor receives payouts (e-task-6). */
  payout_schedule?: PayoutSchedule | null;
  /** Min amount (paise) before payout; NULL = pay any (e-task-6). */
  payout_minor?: number | null;
  /** OPD scheduling mode (e-task-opd-01). */
  opd_mode?: OpdMode;
  /** Optional JSON policies (grace, queue caps). */
  opd_policies?: Record<string, unknown> | null;
}

/**
 * Update doctor settings (partial update, upsert).
 * Validates ownership and slot_interval_minutes.
 *
 * @param doctorId - Doctor ID (must match userId)
 * @param userId - Authenticated user ID
 * @param payload - Fields to update (partial)
 * @param correlationId - Request correlation ID
 * @returns Updated doctor settings row
 */
export async function updateDoctorSettings(
  doctorId: string,
  userId: string,
  payload: UpdateDoctorSettingsPayload,
  correlationId: string
): Promise<DoctorSettingsRow> {
  validateOwnership(doctorId, userId);

  if (
    payload.slot_interval_minutes !== undefined &&
    (payload.slot_interval_minutes < SLOT_INTERVAL_MIN || payload.slot_interval_minutes > SLOT_INTERVAL_MAX)
  ) {
    throw new ValidationError('slot_interval_minutes must be between 1 and 60');
  }
  if (
    payload.appointment_fee_minor !== undefined &&
    payload.appointment_fee_minor !== null &&
    (payload.appointment_fee_minor < 0 || !Number.isInteger(payload.appointment_fee_minor))
  ) {
    throw new ValidationError('appointment_fee_minor must be a non-negative integer (paise/cents)');
  }
  if (
    payload.appointment_fee_currency !== undefined &&
    payload.appointment_fee_currency !== null &&
    !/^[A-Z]{3}$/.test(payload.appointment_fee_currency)
  ) {
    throw new ValidationError('appointment_fee_currency must be a 3-letter code (e.g. INR, USD)');
  }
  if (
    payload.payout_schedule !== undefined &&
    payload.payout_schedule !== null &&
    !['per_appointment', 'daily', 'weekly', 'monthly'].includes(payload.payout_schedule)
  ) {
    throw new ValidationError(
      'payout_schedule must be one of: per_appointment, daily, weekly, monthly'
    );
  }
  if (
    payload.payout_minor !== undefined &&
    payload.payout_minor !== null &&
    (payload.payout_minor < 0 || !Number.isInteger(payload.payout_minor))
  ) {
    throw new ValidationError('payout_minor must be a non-negative integer (paise)');
  }
  if (
    payload.opd_mode !== undefined &&
    payload.opd_mode !== null &&
    !['slot', 'queue'].includes(payload.opd_mode)
  ) {
    throw new ValidationError('opd_mode must be slot or queue');
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }

  const updateData: Record<string, unknown> = {};
  const allowedKeys: (keyof UpdateDoctorSettingsPayload)[] = [
    'practice_name',
    'timezone',
    'slot_interval_minutes',
    'max_advance_booking_days',
    'min_advance_hours',
    'business_hours_summary',
    'cancellation_policy_hours',
    'max_appointments_per_day',
    'booking_buffer_minutes',
    'welcome_message',
    'specialty',
    'address_summary',
    'consultation_types',
    'default_notes',
    'appointment_fee_minor',
    'appointment_fee_currency',
    'payout_schedule',
    'payout_minor',
    'opd_mode',
    'opd_policies',
  ];
  for (const key of allowedKeys) {
    if (key in payload) {
      (updateData as Record<string, unknown>)[key] = (payload as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    const existing = await getDoctorSettingsForUser(doctorId, userId, correlationId);
    return existing;
  }

  const { data: existing } = await supabase
    .from('doctor_settings')
    .select('doctor_id')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  let result: DoctorSettingsRow;

  if (existing) {
    const { data: updated, error } = await supabase
      .from('doctor_settings')
      .update(updateData)
      .eq('doctor_id', doctorId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      handleSupabaseError(error, correlationId);
    }
    if (!updated) {
      throw new InternalError('Failed to update doctor settings');
    }
    result = updated as unknown as DoctorSettingsRow;
  } else {
    const insertData = {
      doctor_id: doctorId,
      ...updateData,
    };
    const { data: inserted, error } = await supabase
      .from('doctor_settings')
      .insert(insertData)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      handleSupabaseError(error, correlationId);
    }
    if (!inserted) {
      throw new InternalError('Failed to create doctor settings');
    }
    result = inserted as unknown as DoctorSettingsRow;
  }

  await logDataModification(correlationId, userId, 'update', 'doctor_settings', doctorId);

  return result;
}
