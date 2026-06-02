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
  AUTO_NO_SHOW_AFTER_MIN_MAX,
  AUTO_NO_SHOW_AFTER_MIN_MIN,
  CATALOG_MODES,
  PATIENT_FLOW_ADVANCE_VALUES,
  COCKPIT_TEMPLATE_OVERRIDE_VALUES,
  type CatalogMode,
  type CockpitLayoutPreset,
  type LayoutNode,
  type LegacyPresetLayout,
  type CockpitTemplateOverride,
  type DoctorSettingsRow,
  type OpdMode,
  type PatientFlowAdvance,
  type PayoutSchedule,
} from '../types/doctor-settings';
import { mergeServiceCatalogOnSave } from '../utils/service-catalog-normalize';
import {
  appendMatcherHintFields,
  hydrateServiceCatalogServiceIds,
  MATCHER_HINT_EXAMPLE_MAX_CHARS,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
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
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { parseLayoutTreeNode } from '../api/routes/cockpit-layout-presets';

const SELECT_COLUMNS =
  'doctor_id, appointment_fee_minor, appointment_fee_currency, country, ' +
  'practice_name, timezone, slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, ' +
  'cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes, ' +
  'welcome_message, specialty, address_summary, consultation_types, service_offerings_json, service_catalog_templates_json, default_notes, ' +
  'payout_schedule, payout_minor, razorpay_linked_account_id, ' +
  'opd_mode, opd_policies, ' +
  'instagram_receptionist_paused, instagram_receptionist_pause_message, ' +
  'catalog_mode, ' +
  // pf-09 (migration 098): post-wrap-up routing + auto-no-show opt-in.
  'patient_flow_advance, auto_no_show_after_min, ' +
  // CC-08 / CC-09: user-saved cockpit layout presets.
  'cockpit_layout_presets, ' +
  // R-MOD-full (migration 106): global cockpit template pin.
  'cockpit_template_override, ' +
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
  // pf-09: matches the DB DEFAULT 'countdown' so a doctor with no settings row
  // sees the same friendly UX as one whose row was back-filled by the migration.
  patient_flow_advance: 'countdown',
  auto_no_show_after_min: null,
  // CC-08 / CC-09: empty array is the DB-side default.
  cockpit_layout_presets: [],
  // R-MOD-full: NULL = auto-select per modality + state.
  cockpit_template_override: null,
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

/** Doctor IANA timezone for OPD policy resolution (pdm-07). */
export async function getDoctorTimezone(doctorId: string): Promise<string> {
  const settings = await getDoctorSettings(doctorId);
  return settings?.timezone ?? 'Asia/Kolkata';
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
 * Append a single patient-style example phrase to an existing `examples[]` list,
 * honoring the schema caps from `serviceMatcherHintsV1Schema`:
 *   - {@link MATCHER_HINT_EXAMPLE_MAX_CHARS} per entry (truncate on overflow);
 *   - {@link MATCHER_HINT_EXAMPLES_MAX_COUNT} entries total (FIFO eviction).
 *
 * Trim + case-insensitive dedupe on the merged fragment vs every existing entry —
 * staff repeatedly clicking the same correction in the review inbox must not bloat
 * the list nor produce a redundant DB write (the caller treats `changed: false` as
 * "skip the update entirely" — same idempotency contract as the legacy path).
 *
 * **Eviction strategy:** when adding the new fragment would exceed the 24-entry cap,
 * we drop the **oldest** entry (`shift()`). Rationale captured in Task 13's Decision
 * log: corrections from this week are more relevant than corrections from last
 * quarter; alternative provenance-aware eviction (drop oldest *learner-added* entry
 * only) would require a per-entry source field — deliberately deferred until we
 * have a UI badge to surface that provenance to the doctor.
 *
 * Pure / no I/O — easy to unit-test in isolation.
 */
export function appendExamplesEntry(
  existing: readonly string[],
  fragment: string,
  maxCount: number = MATCHER_HINT_EXAMPLES_MAX_COUNT,
  maxLen: number = MATCHER_HINT_EXAMPLE_MAX_CHARS
): { next: string[]; changed: boolean } {
  const trimmed = fragment.trim().slice(0, maxLen);
  if (!trimmed) {
    return { next: [...existing], changed: false };
  }
  const lowered = trimmed.toLowerCase();
  if (existing.some((e) => e.trim().toLowerCase() === lowered)) {
    return { next: [...existing], changed: false };
  }
  const next = [...existing, trimmed];
  while (next.length > maxCount) next.shift();
  return { next, changed: true };
}

/**
 * Append plain-language fragments to the `matcher_hints` of one catalog offering and
 * persist the result. Unlike `setMatcherHintsOnDoctorCatalogOffering` (full replace),
 * this is the **staff-feedback learning writer** invoked when staff corrects a service
 * routing on the review inbox — the patient's sanitized complaint fragment is appended
 * to the **destination** service's matcher hints (so future routing learns from the
 * correction) and the source service's `exclude_when` (so it doesn't repeat the
 * mistake). Empty / whitespace-only fields in `patch` are ignored; idempotent on
 * repeat corrections.
 *
 * **Routing v2 contract (Plan 19-04, Task 13 — un-defers the Task-04 hold):**
 *   - **v2 branch** — when `offering.matcher_hints.examples?.length > 0`, the
 *     fragment is collapsed into a single `examples[]` entry (preferring `inc` over
 *     `kw` since `examples` is example-phrase-shaped, not keyword-token-shaped) via
 *     {@link appendExamplesEntry}. Existing legacy `keywords` / `include_when` are
 *     preserved **byte-identical** — we never re-introduce dual-write here even on
 *     mixed-shape rows. `exclude_when` flows through {@link appendMatcherHintFields}'s
 *     single-string semicolon merge regardless of branch (same field in v1 and v2).
 *   - **Legacy fallback** — when `examples` is absent or empty, the original
 *     {@link appendMatcherHintFields} path runs unchanged. This stays for
 *     not-yet-migrated rows; doctors can graduate them via the Task 07 per-card
 *     "Convert to example phrases" CTA.
 *
 * Pre-Task-13 this function unconditionally targeted the legacy fields, which meant
 * Task 06's editor + Task 11's AI suggest produced v2 cards but staff corrections
 * landed in the legacy fields right alongside — silent dual-write, the exact problem
 * Routing v2 exists to remove. The deferral was safe to hold until Tasks 06 + 11
 * shipped because the reader path went through {@link resolveMatcherRouting} from
 * Task 03 onward and tolerated either shape.
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
  const existingHints = offering.matcher_hints;
  const existingExamples = existingHints?.examples ?? [];
  const usingV2 = existingExamples.length > 0;

  let nextHints: ServiceMatcherHintsV1 | undefined;
  if (usingV2) {
    /**
     * v2 branch (Task 13).
     *
     * - Collapse the legacy-shaped patch (`kw` token-style + `inc` phrase-style)
     *   into a single `examples[]` entry. v2 has no asymmetry between the two —
     *   both are patient-style phrases — so we prefer `inc` (already phrase-shaped)
     *   and fall back to `kw` if only that's set. The caller's
     *   {@link sanitizeHintAppendPatch} usually populates `inc` from the patient's
     *   complaint fragment, so `inc || kw` is the intuitive precedence.
     * - Preserve any pre-existing legacy `keywords` / `include_when` strings
     *   **byte-identical** (mixed-shape defense — re-touching them here would
     *   re-introduce dual-write, the exact problem Task 11 + Task 13 exist to
     *   remove). The reader path via {@link resolveMatcherRouting} ignores legacy
     *   fields when `examples[]` is non-empty, so the un-migrated text is inert
     *   until the doctor explicitly converts via the Task 07 per-card CTA.
     * - `exclude_when` flows through {@link appendMatcherHintFields}'s single-string
     *   merge regardless of branch — same field in v1 and v2 shapes.
     */
    const fragment = inc || kw;
    const { next: nextExamples, changed: examplesChanged } = fragment
      ? appendExamplesEntry(existingExamples, fragment)
      : { next: [...existingExamples], changed: false };

    const mergedExclude = exc
      ? appendMatcherHintFields(
          { exclude_when: existingHints?.exclude_when },
          { exclude_when: exc }
        ).exclude_when
      : existingHints?.exclude_when;
    const excludeChanged =
      (existingHints?.exclude_when ?? '') !== (mergedExclude ?? '');

    if (!examplesChanged && !excludeChanged) {
      return false;
    }

    nextHints = {
      ...(existingHints ?? {}),
      examples: nextExamples,
    };
    if (mergedExclude) {
      nextHints.exclude_when = mergedExclude;
    } else {
      delete nextHints.exclude_when;
    }
  } else {
    const merged = appendMatcherHintFields(existingHints, {
      keywords: kw || undefined,
      include_when: inc || undefined,
      exclude_when: exc || undefined,
    });

    const unchanged =
      (existingHints?.keywords ?? '') === (merged.keywords ?? '') &&
      (existingHints?.include_when ?? '') === (merged.include_when ?? '') &&
      (existingHints?.exclude_when ?? '') === (merged.exclude_when ?? '');
    if (unchanged) {
      return false;
    }

    nextHints = Object.keys(merged).length > 0 ? merged : undefined;
  }

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
   * `docs/Work/Architecture/legacy-appointment-fee-minor-deprecation.md`).
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
  /** pf-09: post-wrap-up routing preference. */
  patient_flow_advance?: PatientFlowAdvance;
  /** pf-09: opt-in auto-no-show timer (minutes). NULL clears = off. */
  auto_no_show_after_min?: number | null;
  /** R-MOD-full: global cockpit template pin. `null` clears = auto-select. */
  cockpit_template_override?: CockpitTemplateOverride | null;
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
  if (
    payload.patient_flow_advance !== undefined &&
    !(PATIENT_FLOW_ADVANCE_VALUES as readonly string[]).includes(payload.patient_flow_advance)
  ) {
    throw new ValidationError(
      `patient_flow_advance must be one of: ${PATIENT_FLOW_ADVANCE_VALUES.join(', ')}`
    );
  }
  if (
    payload.auto_no_show_after_min !== undefined &&
    payload.auto_no_show_after_min !== null &&
    (!Number.isInteger(payload.auto_no_show_after_min) ||
      payload.auto_no_show_after_min < AUTO_NO_SHOW_AFTER_MIN_MIN ||
      payload.auto_no_show_after_min > AUTO_NO_SHOW_AFTER_MIN_MAX)
  ) {
    throw new ValidationError(
      `auto_no_show_after_min must be an integer in [${AUTO_NO_SHOW_AFTER_MIN_MIN}, ${AUTO_NO_SHOW_AFTER_MIN_MAX}] or null`
    );
  }
  if (
    payload.cockpit_template_override !== undefined &&
    payload.cockpit_template_override !== null &&
    !(COCKPIT_TEMPLATE_OVERRIDE_VALUES as readonly string[]).includes(
      payload.cockpit_template_override
    )
  ) {
    throw new ValidationError(
      `cockpit_template_override must be one of: ${COCKPIT_TEMPLATE_OVERRIDE_VALUES.join(', ')}`
    );
  }

  if (payload.opd_policies !== undefined && payload.opd_policies !== null) {
    const modeSchedule = payload.opd_policies.mode_schedule;
    if (modeSchedule !== undefined) {
      const { validateModeSchedule } = await import('../utils/validation');
      const validated = validateModeSchedule(modeSchedule);
      if (!validated.ok) {
        throw new ValidationError(validated.error);
      }
      payload.opd_policies = {
        ...payload.opd_policies,
        mode_schedule: validated.value,
      };
    }
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
    'patient_flow_advance',
    'auto_no_show_after_min',
    'cockpit_template_override',
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

// ---------------------------------------------------------------------------
// CC-08 / CC-09: Cockpit layout preset CRUD
// ---------------------------------------------------------------------------

const MAX_COCKPIT_PRESETS = 5;
const PRESET_NAME_MAX_LEN = 60;
const PRESET_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SOURCE_TEMPLATE_ID_MAX_LEN = 128;
const COLUMN_TYPES = ['chart', 'body', 'rx'] as const;

/**
 * clpm-04 owns the full flat → tree conversion. Stub returns undefined so the
 * read path falls back to legacy rendering until the mutation engine lands.
 */
export function legacyFlatToTree(_layout: LegacyPresetLayout): LayoutNode | undefined {
  return undefined;
}

/** Attach in-memory layout_tree from legacy layout when tree is absent. */
function hydratePresetLayoutTree(preset: CockpitLayoutPreset): CockpitLayoutPreset {
  if (preset.layout_tree != null || preset.layout == null) {
    return preset;
  }
  const tree = legacyFlatToTree(preset.layout);
  return tree != null ? { ...preset, layout_tree: tree } : preset;
}

function normalizeCockpitPresetsOnRead(presets: CockpitLayoutPreset[]): CockpitLayoutPreset[] {
  return presets.map(hydratePresetLayoutTree);
}

/**
 * Read the calling doctor's cockpit layout presets.
 * Returns `[]` when the doctor has no doctor_settings row OR the column
 * is the default empty array. Never throws on "no row" — the cockpit's
 * read path is hot and must not error on a fresh-doctor account.
 */
export async function getCockpitPresetsForUser(userId: string): Promise<CockpitLayoutPreset[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }
  const { data, error } = await supabase
    .from('doctor_settings')
    .select('cockpit_layout_presets')
    .eq('doctor_id', userId)
    .maybeSingle();
  if (error) handleSupabaseError(error, 'getCockpitPresetsForUser');
  const raw = ((data as { cockpit_layout_presets?: unknown } | null)?.cockpit_layout_presets ??
    []) as CockpitLayoutPreset[];
  return normalizeCockpitPresetsOnRead(raw);
}

/**
 * Replace the full presets array. Atomic. The frontend sends the desired
 * state (after eviction / rename / etc.); the backend validates shape and
 * persists. Idempotent — same payload twice is a no-op.
 *
 * Throws ValidationError (400) on:
 *  - more than 5 presets
 *  - any preset missing required fields, or with bad shapes
 *  - duplicate ids
 *  - empty / overly long names
 *
 * Throws InternalError (500) on Supabase failures.
 */
export async function putCockpitPresetsForUser(
  userId: string,
  presets: unknown,
): Promise<CockpitLayoutPreset[]> {
  validatePresetArray(presets);
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Database not available');
  }
  const { data, error } = await supabase
    .from('doctor_settings')
    .upsert(
      { doctor_id: userId, cockpit_layout_presets: presets },
      { onConflict: 'doctor_id' },
    )
    .select('cockpit_layout_presets')
    .single();
  if (error) handleSupabaseError(error, 'putCockpitPresetsForUser');
  void logDataModification('system', userId, 'update', 'doctor_settings', userId, ['cockpit_layout_presets']);
  const raw = ((data as { cockpit_layout_presets?: unknown } | null)?.cockpit_layout_presets ??
    []) as CockpitLayoutPreset[];
  return normalizeCockpitPresetsOnRead(raw);
}

/**
 * Delete a single preset by id. Convenience wrapper — internally reads,
 * filters, writes. Returns the new array.
 * 404s if the id isn't found in the doctor's array (no silent no-op).
 */
export async function deleteCockpitPresetForUser(
  userId: string,
  presetId: string,
): Promise<CockpitLayoutPreset[]> {
  if (!PRESET_ID_REGEX.test(presetId)) {
    throw new ValidationError(`Invalid preset id: ${presetId}`);
  }
  const current = await getCockpitPresetsForUser(userId);
  const next = current.filter((p) => p.id !== presetId);
  if (next.length === current.length) {
    throw new NotFoundError(`Cockpit preset not found: ${presetId}`);
  }
  return putCockpitPresetsForUser(userId, next);
}

function validatePresetArray(presets: unknown): asserts presets is CockpitLayoutPreset[] {
  if (!Array.isArray(presets)) {
    throw new ValidationError('cockpit_layout_presets must be an array');
  }
  if (presets.length > MAX_COCKPIT_PRESETS) {
    throw new ValidationError(`Maximum ${MAX_COCKPIT_PRESETS} cockpit layout presets allowed`);
  }
  const seenIds = new Set<string>();
  for (const [i, p] of presets.entries()) {
    if (!p || typeof p !== 'object') {
      throw new ValidationError(`presets[${i}] must be an object`);
    }
    const preset = p as Partial<CockpitLayoutPreset>;
    if (typeof preset.id !== 'string' || !PRESET_ID_REGEX.test(preset.id)) {
      throw new ValidationError(`presets[${i}].id is invalid`);
    }
    if (seenIds.has(preset.id)) {
      throw new ValidationError(`Duplicate preset id: ${preset.id}`);
    }
    seenIds.add(preset.id);
    const name = typeof preset.name === 'string' ? preset.name.trim() : '';
    if (!name || name.length > PRESET_NAME_MAX_LEN) {
      throw new ValidationError(`presets[${i}].name must be 1–${PRESET_NAME_MAX_LEN} chars`);
    }
    if (typeof preset.created_at !== 'string' || !isValidIsoDate(preset.created_at)) {
      throw new ValidationError(`presets[${i}].created_at must be ISO-8601 string`);
    }
    if (
      preset.sourceTemplateId !== undefined &&
      (typeof preset.sourceTemplateId !== 'string' ||
        !preset.sourceTemplateId.trim() ||
        preset.sourceTemplateId.length > SOURCE_TEMPLATE_ID_MAX_LEN)
    ) {
      throw new ValidationError(
        `presets[${i}].sourceTemplateId must be 1–${SOURCE_TEMPLATE_ID_MAX_LEN} chars when provided`,
      );
    }
    const hasLayout = preset.layout != null;
    const hasLayoutTree = preset.layout_tree != null;
    if (!hasLayout && !hasLayoutTree) {
      throw new ValidationError(`presets[${i}] must include layout or layout_tree`);
    }
    if (hasLayout) {
      validateLayoutShape(preset.layout, `presets[${i}].layout`);
    }
    if (hasLayoutTree) {
      parseLayoutTreeNode(preset.layout_tree, `presets[${i}].layout_tree`);
    }
  }
}

function validateLayoutShape(layout: unknown, label: string): void {
  if (!layout || typeof layout !== 'object') {
    throw new ValidationError(`${label} must be an object`);
  }
  const l = layout as Record<string, unknown>;
  // DL-9 / pr-04: patients-list saved views share the JSONB array with a kind discriminator.
  if (l.kind === 'patients_list_view') {
    if (l.filters !== undefined && (typeof l.filters !== 'object' || l.filters === null)) {
      throw new ValidationError(`${label}.filters must be an object`);
    }
    if (l.is_default !== undefined && typeof l.is_default !== 'boolean') {
      throw new ValidationError(`${label}.is_default must be a boolean`);
    }
    if (
      l.columns !== undefined &&
      (!Array.isArray(l.columns) || !l.columns.every((c) => typeof c === 'string'))
    ) {
      throw new ValidationError(`${label}.columns must be a string array`);
    }
    return;
  }
  const slots = l.slots;
  if (
    !Array.isArray(slots) ||
    slots.length !== 3 ||
    !slots.every((s) => (COLUMN_TYPES as readonly string[]).includes(s as string))
  ) {
    throw new ValidationError(`${label}.slots must be a permutation of ${COLUMN_TYPES.join('/')}`);
  }
  if (new Set(slots).size !== 3) {
    throw new ValidationError(`${label}.slots must contain each of chart/body/rx exactly once`);
  }
  const widths = l.widths;
  if (
    !Array.isArray(widths) ||
    widths.length !== 3 ||
    !widths.every((w) => typeof w === 'number' && w >= 0 && w <= 100)
  ) {
    throw new ValidationError(`${label}.widths must be 3 numbers in [0,100]`);
  }
  const sum = (widths as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 5) {
    throw new ValidationError(`${label}.widths must sum to ~100 (got ${sum})`);
  }
  const collapsed = l.collapsed as Record<string, unknown> | undefined;
  if (
    !collapsed ||
    typeof collapsed !== 'object' ||
    typeof collapsed.chart !== 'boolean' ||
    typeof collapsed.rx !== 'boolean'
  ) {
    throw new ValidationError(`${label}.collapsed must be { chart: boolean, rx: boolean }`);
  }
  // `body` is a recent addition (May 2026 — body column became side-collapsible).
  // Accept payloads that omit it (legacy presets) but reject non-boolean values.
  if ('body' in collapsed && typeof collapsed.body !== 'boolean') {
    throw new ValidationError(`${label}.collapsed.body must be a boolean when provided`);
  }
}

function isValidIsoDate(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10);
}
