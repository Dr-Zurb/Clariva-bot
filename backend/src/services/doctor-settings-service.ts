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
import { mergeServiceCatalogOnSave } from '../utils/service-catalog-normalize';
import {
  hydrateServiceCatalogServiceIds,
  parseServiceCatalogIncoming,
  parseServiceCatalogTemplatesJson,
  safeParseServiceCatalogV1FromDb,
  serviceCatalogTemplatesJsonSchema,
  serviceCatalogV1Schema,
  type ServiceCatalogV1,
} from '../utils/service-catalog-schema';
import { validateOwnership } from '../utils/db-helpers';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification, logAuditEvent } from '../utils/audit-logger';
import { InternalError, ValidationError } from '../utils/errors';

const SELECT_COLUMNS =
  'doctor_id, appointment_fee_minor, appointment_fee_currency, country, ' +
  'practice_name, timezone, slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, ' +
  'cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes, ' +
  'welcome_message, specialty, address_summary, consultation_types, service_offerings_json, service_catalog_templates_json, default_notes, ' +
  'payout_schedule, payout_minor, razorpay_linked_account_id, ' +
  'opd_mode, opd_policies, ' +
  'instagram_receptionist_paused, instagram_receptionist_pause_message, ' +
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
  service_offerings_json: null,
  service_catalog_templates_json: { templates: [] },
  default_notes: null,
  payout_schedule: null,
  payout_minor: null,
  razorpay_linked_account_id: null,
  opd_mode: 'slot',
  opd_policies: null,
  instagram_receptionist_paused: false,
  instagram_receptionist_pause_message: null,
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
  if (!data) {
    return null;
  }
  return normalizeDoctorSettingsApiRow(data as unknown as DoctorSettingsRow);
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
  return normalizeDoctorSettingsApiRow(data as unknown as DoctorSettingsRow);
}

/** Valid slot interval range: 1–60 minutes. */
const SLOT_INTERVAL_MIN = 1;
const SLOT_INTERVAL_MAX = 60;

/** SFU-11: hydrate legacy/missing `service_id` for API consumers. */
function normalizeServiceOfferingsInRow(row: DoctorSettingsRow): DoctorSettingsRow {
  if (row.service_offerings_json == null) {
    return row;
  }
  const c = safeParseServiceCatalogV1FromDb(row.service_offerings_json as unknown, row.doctor_id);
  if (!c) {
    return row;
  }
  return { ...row, service_offerings_json: c };
}

/** SFU-14: coerce DB JSON to validated shape or empty list. */
function normalizeUserTemplatesInRow(row: DoctorSettingsRow): DoctorSettingsRow {
  const raw = (row as unknown as { service_catalog_templates_json?: unknown }).service_catalog_templates_json;
  const parsed = parseServiceCatalogTemplatesJson(raw);
  return {
    ...row,
    service_catalog_templates_json: parsed ?? { templates: [] },
  };
}

function normalizeDoctorSettingsApiRow(row: DoctorSettingsRow): DoctorSettingsRow {
  return normalizeUserTemplatesInRow(normalizeServiceOfferingsInRow(row));
}

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
  /** SFU-01 / SFU-11: structured catalog; merged + normalized before persist. */
  service_offerings_json?: ServiceCatalogV1 | null;
  /** SFU-14: replace entire user template library, or null to clear. */
  service_catalog_templates_json?:
    | import('../utils/service-catalog-schema').ServiceCatalogTemplatesJsonV1
    | null;
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
  /** RBH-09: Pause automated Instagram DM + comment outreach. */
  instagram_receptionist_paused?: boolean;
  /** Optional custom DM when paused (nullable to clear). */
  instagram_receptionist_pause_message?: string | null;
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
  if (
    payload.instagram_receptionist_pause_message !== undefined &&
    payload.instagram_receptionist_pause_message !== null &&
    payload.instagram_receptionist_pause_message.length > 500
  ) {
    throw new ValidationError('instagram_receptionist_pause_message must be at most 500 characters');
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
    'instagram_receptionist_paused',
    'instagram_receptionist_pause_message',
  ];
  for (const key of allowedKeys) {
    if (key in payload) {
      (updateData as Record<string, unknown>)[key] = (payload as Record<string, unknown>)[key];
    }
  }

  if ('service_offerings_json' in payload) {
    if (payload.service_offerings_json === null) {
      updateData.service_offerings_json = null;
    } else {
      const { data: existingSnap } = await supabase
        .from('doctor_settings')
        .select('service_offerings_json')
        .eq('doctor_id', doctorId)
        .maybeSingle();
      const previousCatalog = existingSnap?.service_offerings_json
        ? safeParseServiceCatalogV1FromDb(existingSnap.service_offerings_json as unknown, doctorId)
        : null;
      const incomingLoose = parseServiceCatalogIncoming(payload.service_offerings_json);
      const incomingHydrated = hydrateServiceCatalogServiceIds(
        doctorId,
        incomingLoose as ServiceCatalogV1
      );
      const incStrict = serviceCatalogV1Schema.safeParse(incomingHydrated);
      if (!incStrict.success) {
        const first = incStrict.error.issues[0];
        throw new ValidationError(
          first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_offerings_json'
        );
      }
      const merged = mergeServiceCatalogOnSave(doctorId, incStrict.data, previousCatalog);
      updateData.service_offerings_json = merged;
    }
  }

  if ('service_catalog_templates_json' in payload) {
    if (payload.service_catalog_templates_json === null) {
      updateData.service_catalog_templates_json = null;
    } else {
      const tpl = serviceCatalogTemplatesJsonSchema.safeParse(payload.service_catalog_templates_json);
      if (!tpl.success) {
        const first = tpl.error.issues[0];
        throw new ValidationError(
          first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_catalog_templates_json'
        );
      }
      updateData.service_catalog_templates_json = tpl.data;
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

  if (payload.instagram_receptionist_paused !== undefined) {
    await logAuditEvent({
      correlationId,
      userId,
      action: 'doctor_settings_instagram_receptionist_pause',
      resourceType: 'doctor_settings',
      status: 'success',
      metadata: {
        instagram_receptionist_paused: payload.instagram_receptionist_paused,
      },
    });
  }

  return normalizeDoctorSettingsApiRow(result);
}
