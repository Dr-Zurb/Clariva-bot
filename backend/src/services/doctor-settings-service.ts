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
import { logger } from '../config/logger';
import {
  CATALOG_MODES,
  type CatalogMode,
  type DoctorSettingsRow,
  type OpdMode,
  type PayoutSchedule,
} from '../types/doctor-settings';
import { mergeServiceCatalogOnSave } from '../utils/service-catalog-normalize';
import {
  appendMatcherHintFields,
  hydrateServiceCatalogServiceIds,
  parseServiceCatalogIncoming,
  parseServiceCatalogTemplatesJson,
  safeParseServiceCatalogV1FromDb,
  serviceCatalogTemplatesJsonSchema,
  serviceCatalogV1Schema,
  type ServiceCatalogV1,
  type ServiceMatcherHintsV1,
} from '../utils/service-catalog-schema';
import {
  buildSingleFeePersistedJson,
  SINGLE_FEE_BACKUP_KEY,
} from '../utils/single-fee-catalog';
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
  'catalog_mode, ' +
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
  catalog_mode: null,
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
  const row = data as unknown as DoctorSettingsRow;
  const materialized = await ensureSingleFeeCatalogMaterialized(row);
  return normalizeDoctorSettingsApiRow(materialized);
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
  const row = data as unknown as DoctorSettingsRow;
  const materialized = await ensureSingleFeeCatalogMaterialized(row);
  return normalizeDoctorSettingsApiRow(materialized);
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

export type MatcherHintsReplacePayload = {
  keywords: string;
  include_when: string;
  exclude_when: string;
};

/**
 * Replace `matcher_hints` on one catalog offering (same fields as practice setup) and persist.
 * Skips write if trimmed values match the row. No PHI in hints.
 * @returns whether `doctor_settings.service_offerings_json` was updated.
 */
export async function setMatcherHintsOnDoctorCatalogOffering(
  doctorId: string,
  correlationId: string,
  serviceKey: string,
  hints: MatcherHintsReplacePayload
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }

  const { data: row, error: selErr } = await supabase
    .from('doctor_settings')
    .select('service_offerings_json')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (selErr) handleSupabaseError(selErr, correlationId);
  if (!row?.service_offerings_json) {
    throw new ValidationError('Practice has no service catalog');
  }

  const previousCatalog = safeParseServiceCatalogV1FromDb(
    row.service_offerings_json as unknown,
    doctorId
  );
  if (!previousCatalog) {
    throw new ValidationError('Invalid service catalog');
  }

  const keyNorm = serviceKey.trim().toLowerCase();
  const idx = previousCatalog.services.findIndex(
    (s) => s.service_key.trim().toLowerCase() === keyNorm
  );
  if (idx < 0) {
    throw new ValidationError('Service not found in catalog');
  }

  const offering = previousCatalog.services[idx]!;
  const kw = hints.keywords.trim();
  const inc = hints.include_when.trim();
  const exc = hints.exclude_when.trim();

  const prev = offering.matcher_hints;
  const unchanged =
    (prev?.keywords ?? '') === kw &&
    (prev?.include_when ?? '') === inc &&
    (prev?.exclude_when ?? '') === exc;
  if (unchanged) {
    return false;
  }

  const newHints: ServiceMatcherHintsV1 = {};
  if (kw) newHints.keywords = kw;
  if (inc) newHints.include_when = inc;
  if (exc) newHints.exclude_when = exc;

  const nextOffering = {
    ...offering,
    matcher_hints: Object.keys(newHints).length > 0 ? newHints : undefined,
  };
  const nextServices = [...previousCatalog.services];
  nextServices[idx] = nextOffering;
  const incoming: ServiceCatalogV1 = { ...previousCatalog, services: nextServices };

  const hydrated = hydrateServiceCatalogServiceIds(doctorId, incoming);
  const strict = serviceCatalogV1Schema.safeParse(hydrated);
  if (!strict.success) {
    const first = strict.error.issues[0];
    throw new ValidationError(
      first ? `${first.path.join('.')}: ${first.message}` : 'Invalid catalog after hint update'
    );
  }

  const merged = mergeServiceCatalogOnSave(doctorId, strict.data, previousCatalog);

  const { error: updErr } = await supabase
    .from('doctor_settings')
    .update({ service_offerings_json: merged })
    .eq('doctor_id', doctorId);

  if (updErr) handleSupabaseError(updErr, correlationId);
  return true;
}

export type MatcherHintsAppendPayload = {
  keywords?: string;
  include_when?: string;
  exclude_when?: string;
};

/**
 * Append plain-language fragments to the `matcher_hints` of one catalog offering
 * (semicolon-separated, schema-capped). Unlike `setMatcherHintsOnDoctorCatalogOffering`
 * (full replace), this is the feedback-loop entry point used when staff corrects a
 * service routing on the review inbox — the patient's sanitized complaint fragment is
 * appended to the destination service's `include_when` (and the source service's
 * `exclude_when`) so future deterministic + LLM matching improves automatically.
 *
 * Empty / whitespace-only fields in `patch` are ignored. The merged value is
 * length-capped via {@link appendMatcherHintFields}. Skips the write when the merge
 * produces no change (idempotent on repeat corrections).
 *
 * @returns whether `doctor_settings.service_offerings_json` was updated.
 */
export async function appendMatcherHintsOnDoctorCatalogOffering(
  doctorId: string,
  correlationId: string,
  serviceKey: string,
  patch: MatcherHintsAppendPayload
): Promise<boolean> {
  const kw = patch.keywords?.trim() ?? '';
  const inc = patch.include_when?.trim() ?? '';
  const exc = patch.exclude_when?.trim() ?? '';
  if (!kw && !inc && !exc) {
    return false;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }

  const { data: row, error: selErr } = await supabase
    .from('doctor_settings')
    .select('service_offerings_json')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (selErr) handleSupabaseError(selErr, correlationId);
  if (!row?.service_offerings_json) {
    throw new ValidationError('Practice has no service catalog');
  }

  const previousCatalog = safeParseServiceCatalogV1FromDb(
    row.service_offerings_json as unknown,
    doctorId
  );
  if (!previousCatalog) {
    throw new ValidationError('Invalid service catalog');
  }

  const keyNorm = serviceKey.trim().toLowerCase();
  const idx = previousCatalog.services.findIndex(
    (s) => s.service_key.trim().toLowerCase() === keyNorm
  );
  if (idx < 0) {
    throw new ValidationError('Service not found in catalog');
  }

  const offering = previousCatalog.services[idx]!;
  const merged = appendMatcherHintFields(offering.matcher_hints, {
    keywords: kw || undefined,
    include_when: inc || undefined,
    exclude_when: exc || undefined,
  });

  const prev = offering.matcher_hints;
  const unchanged =
    (prev?.keywords ?? '') === (merged.keywords ?? '') &&
    (prev?.include_when ?? '') === (merged.include_when ?? '') &&
    (prev?.exclude_when ?? '') === (merged.exclude_when ?? '');
  if (unchanged) {
    return false;
  }

  const nextHints: ServiceMatcherHintsV1 | undefined =
    Object.keys(merged).length > 0 ? merged : undefined;

  const nextOffering = { ...offering, matcher_hints: nextHints };
  const nextServices = [...previousCatalog.services];
  nextServices[idx] = nextOffering;
  const incoming: ServiceCatalogV1 = { ...previousCatalog, services: nextServices };

  const hydrated = hydrateServiceCatalogServiceIds(doctorId, incoming);
  const strict = serviceCatalogV1Schema.safeParse(hydrated);
  if (!strict.success) {
    const first = strict.error.issues[0];
    throw new ValidationError(
      first ? `${first.path.join('.')}: ${first.message}` : 'Invalid catalog after hint append'
    );
  }

  const mergedCatalog = mergeServiceCatalogOnSave(doctorId, strict.data, previousCatalog);

  const { error: updErr } = await supabase
    .from('doctor_settings')
    .update({ service_offerings_json: mergedCatalog })
    .eq('doctor_id', doctorId);

  if (updErr) handleSupabaseError(updErr, correlationId);
  return true;
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
  /**
   * Appointment fee in smallest unit (paise INR, cents USD). e.g. 50000 = ₹500.
   * @deprecated Plan 03 · Task 11 — PATCH the catalog (`service_offerings_json`)
   * instead for multi-service doctors; for single-fee doctors, Task 09 rebuilds
   * the catalog from this field automatically. Planned removal: **Phase 3**
   * (see
   * `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md`).
   */
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
  /**
   * Plan 03 · Task 08: catalog-charging mode. `null` clears the field (only
   * meaningful for doctors who haven't picked yet). Unknown values are 400s.
   * Strictly data-only in Task 08 — Task 09 hooks into PATCH to materialize /
   * back up `service_offerings_json` when this flag flips.
   */
  catalog_mode?: CatalogMode | null;
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
  if (
    payload.catalog_mode !== undefined &&
    payload.catalog_mode !== null &&
    !(CATALOG_MODES as readonly string[]).includes(payload.catalog_mode)
  ) {
    throw new ValidationError(
      `catalog_mode must be one of: ${CATALOG_MODES.join(', ')}`
    );
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
    'catalog_mode',
  ];
  for (const key of allowedKeys) {
    if (key in payload) {
      (updateData as Record<string, unknown>)[key] = (payload as Record<string, unknown>)[key];
    }
  }

  // Plan 03 · Task 09: single pre-fetch for (a) existence, (b) catalog merge,
  // (c) single-fee sync triggers. Pull every field any downstream branch needs.
  // Cast via `unknown` — Supabase's inline multi-column select returns an
  // opaque `GenericStringError` type; the SELECT columns are known-good here.
  const { data: existingRowRaw } = await supabase
    .from('doctor_settings')
    .select(
      'doctor_id, catalog_mode, appointment_fee_minor, consultation_types, ' +
        'practice_name, service_offerings_json'
    )
    .eq('doctor_id', doctorId)
    .maybeSingle();
  const existingRow = (existingRowRaw as unknown as SingleFeeSyncExistingRow | null) ?? null;

  if ('service_offerings_json' in payload) {
    if (payload.service_offerings_json === null) {
      updateData.service_offerings_json = null;
    } else {
      const previousCatalog = existingRow?.service_offerings_json
        ? safeParseServiceCatalogV1FromDb(existingRow.service_offerings_json as unknown, doctorId)
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

  // Plan 03 · Task 09: sync `service_offerings_json` with the single-fee builder
  // when any of (mode flip → single_fee, appointment_fee_minor change in
  // single_fee, consultation_types change in single_fee) fires. Skips when the
  // same PATCH already supplied an explicit catalog — caller wins.
  const singleFeeSync = computeSingleFeeCatalogSyncUpdate({
    doctorId,
    payload,
    existingRow,
  });
  if (singleFeeSync.didSync) {
    updateData.service_offerings_json = singleFeeSync.newServiceOfferingsJson;
  }

  if (Object.keys(updateData).length === 0) {
    const existing = await getDoctorSettingsForUser(doctorId, userId, correlationId);
    return existing;
  }

  const existing = existingRow ? { doctor_id: existingRow.doctor_id } : null;

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

// ---------------------------------------------------------------------------
// Plan 03 · Task 09: single-fee catalog sync (PATCH + lazy read)
// ---------------------------------------------------------------------------

/** Minimal shape `computeSingleFeeCatalogSyncUpdate` pulls from the DB. */
export type SingleFeeSyncExistingRow = Pick<
  DoctorSettingsRow,
  | 'doctor_id'
  | 'catalog_mode'
  | 'appointment_fee_minor'
  | 'consultation_types'
  | 'practice_name'
  | 'service_offerings_json'
>;

export interface SingleFeeSyncResult {
  didSync: boolean;
  newServiceOfferingsJson: Record<string, unknown> | null;
}

/**
 * Decide whether a PATCH should auto-(re)build the single-fee catalog and, if
 * so, return the JSON blob to write into `service_offerings_json`.
 *
 * Triggers (all gated on the *effective* `catalog_mode === 'single_fee'`
 * after the PATCH is applied):
 *   A. Mode transitioned to `'single_fee'` — snapshots the previous catalog
 *      into `_backup_pre_single_fee` (Task 12 round-trip).
 *   B. `appointment_fee_minor` changes while already in single_fee.
 *   C. `consultation_types` changes while already in single_fee.
 *
 * Skipped entirely when:
 *   - The same PATCH already supplied `service_offerings_json` (manual wins).
 *   - Effective mode is NOT `'single_fee'` (multi_service / null are no-ops —
 *     Task 12 owns the `single_fee → multi_service` promotion flow).
 */
export function computeSingleFeeCatalogSyncUpdate(params: {
  doctorId: string;
  payload: UpdateDoctorSettingsPayload;
  existingRow: SingleFeeSyncExistingRow | null;
}): SingleFeeSyncResult {
  const { doctorId, payload, existingRow } = params;

  // Caller wins: an explicit catalog in the same PATCH disables auto-sync.
  if ('service_offerings_json' in payload) {
    return { didSync: false, newServiceOfferingsJson: null };
  }

  const prevMode = existingRow?.catalog_mode ?? null;
  const effectiveMode = 'catalog_mode' in payload
    ? payload.catalog_mode ?? null
    : prevMode;

  if (effectiveMode !== 'single_fee') {
    return { didSync: false, newServiceOfferingsJson: null };
  }

  const modeTransitionedToSingleFee = prevMode !== 'single_fee';
  const feeChanged =
    'appointment_fee_minor' in payload &&
    payload.appointment_fee_minor !== (existingRow?.appointment_fee_minor ?? null);
  const typesChanged =
    'consultation_types' in payload &&
    payload.consultation_types !== (existingRow?.consultation_types ?? null);

  if (!modeTransitionedToSingleFee && !feeChanged && !typesChanged) {
    return { didSync: false, newServiceOfferingsJson: null };
  }

  const effectiveFee = 'appointment_fee_minor' in payload
    ? payload.appointment_fee_minor ?? null
    : existingRow?.appointment_fee_minor ?? null;
  const effectiveTypes = 'consultation_types' in payload
    ? payload.consultation_types ?? null
    : existingRow?.consultation_types ?? null;
  const effectivePracticeName = 'practice_name' in payload
    ? payload.practice_name ?? null
    : existingRow?.practice_name ?? null;

  // Backup preservation:
  //   - Mode transition: the pre-transition catalog (whatever it was) becomes
  //     the Task-12-visible backup.
  //   - Already-single_fee trigger (B/C): keep whatever backup is already in
  //     the JSON root so the original multi-service catalog survives fee /
  //     consultation_types churn.
  let backup: unknown = null;
  const prevJson = existingRow?.service_offerings_json as unknown;
  if (modeTransitionedToSingleFee) {
    backup = prevJson ?? null;
  } else if (prevJson && typeof prevJson === 'object' && !Array.isArray(prevJson)) {
    const existingBackup = (prevJson as Record<string, unknown>)[SINGLE_FEE_BACKUP_KEY];
    backup = existingBackup ?? null;
  }

  const newJson = buildSingleFeePersistedJson(
    {
      doctor_id: doctorId,
      practice_name: effectivePracticeName,
      appointment_fee_minor: effectiveFee,
      consultation_types: effectiveTypes,
    },
    { preserveBackup: backup }
  );

  return { didSync: true, newServiceOfferingsJson: newJson };
}

/**
 * Lazy materialization for Task 08 back-filled rows.
 *
 * Migration `048_catalog_mode.sql` set `catalog_mode = 'single_fee'` for
 * legacy flat-fee doctors but left `service_offerings_json` untouched. On
 * first read, build the single-entry catalog and persist it so every other
 * reader (matcher skip, fee DM, booking) sees the canonical shape.
 *
 * Concurrency: two parallel requests may both materialize. The builder is
 * deterministic, so both writes produce identical JSON — last-writer-wins is
 * safe. If the write fails, we still return an enriched in-memory row so the
 * caller isn't blocked on a transient DB error.
 */
export async function ensureSingleFeeCatalogMaterialized(
  row: DoctorSettingsRow
): Promise<DoctorSettingsRow> {
  if (row.catalog_mode !== 'single_fee' || row.service_offerings_json != null) {
    return row;
  }
  if (!row.doctor_id) {
    return row;
  }

  const newJson = buildSingleFeePersistedJson({
    doctor_id: row.doctor_id,
    practice_name: row.practice_name,
    appointment_fee_minor: row.appointment_fee_minor,
    consultation_types: row.consultation_types,
  });

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { error: updErr } = await supabase
      .from('doctor_settings')
      .update({ service_offerings_json: newJson })
      .eq('doctor_id', row.doctor_id)
      .is('service_offerings_json', null);

    if (updErr) {
      logger.warn(
        {
          doctorId: row.doctor_id,
          err: updErr.message,
        },
        'catalog_mode.single_fee.materialize.failed'
      );
    } else {
      logger.info(
        { doctorId: row.doctor_id },
        'catalog_mode.single_fee.materialized'
      );
    }
  }

  return {
    ...row,
    service_offerings_json: newJson as unknown as DoctorSettingsRow['service_offerings_json'],
  };
}
