/**
 * Plan 03 · Task 09: Auto-generated single-service catalog.
 *
 * When a doctor is in `catalog_mode = 'single_fee'` we maintain a one-entry
 * `ServiceCatalogV1` automatically, derived from `appointment_fee_minor`,
 * `consultation_types`, and `practice_name`. Downstream consumers (fee
 * display, booking flow, payment gate, slot selection) go through the same
 * catalog-driven code path regardless of mode; Task 10 short-circuits the
 * matcher / review / learning pipelines so single-fee doctors never pay the
 * catalog-matching cost.
 *
 * Deterministic by design:
 *   - `service_id` is a UUID-shaped hash of (doctor_id, SINGLE_FEE_SERVICE_KEY)
 *     so rebuilds produce the same id — no churn in dependent records.
 *   - Every rebuild with identical inputs yields byte-identical JSON, so the
 *     PATCH / lazy-materialization flows can write unconditionally without
 *     creating noisy audit rows (PostgreSQL short-circuits equal UPDATEs).
 *
 * Deliberately narrow:
 *   - No per-modality price ladder (Plan 03 Open Question 4 — deferred).
 *   - Single flat `appointment_fee_minor` across all enabled modalities.
 *   - No catch-all row — this catalog parses via `serviceCatalogV1BaseSchema`,
 *     which does NOT require `other`. The live catch-all guard only applies
 *     to multi-service catalogs and to `serviceCatalogV1Schema`.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import {
  deterministicServiceIdForLegacyOffering,
  SERVICE_CATALOG_VERSION,
  serviceCatalogV1BaseSchema,
  serviceOfferingV1Schema,
  type ServiceCatalogV1,
  type ServiceModalitiesV1,
  type ServiceOfferingV1,
} from './service-catalog-schema';
import {
  deriveAllowedModalitiesFromConsultationTypes,
  type AllowedModalities,
} from './consultation-types';

/**
 * Reserved slug for the single-entry catalog.
 *
 * Intentionally NOT `CATALOG_CATCH_ALL_SERVICE_KEY` ('other'): the catch-all
 * carries multi-service-specific matcher semantics. In single-fee mode the
 * matcher is bypassed upstream (Task 10), so we use a neutral slug whose
 * intent is obvious to humans reading DB rows.
 */
export const SINGLE_FEE_SERVICE_KEY = 'consultation' as const;

/** Default currency when `appointment_fee_currency` is null. Matches backend India default. */
export const SINGLE_FEE_DEFAULT_CURRENCY = 'INR' as const;

/** Default fee when the doctor flips to single_fee before setting `appointment_fee_minor`. */
const DEFAULT_PRICE_MINOR = 0;

/**
 * Subset of `DoctorSettingsRow` the builder actually needs.
 * Accepting the wider row keeps call sites simple; constraining the contract
 * in the type keeps the pure-utility test story honest.
 */
export type SingleFeeCatalogInput = Pick<
  DoctorSettingsRow,
  'doctor_id' | 'practice_name' | 'appointment_fee_minor' | 'consultation_types'
>;

function buildLabel(practiceName: string | null | undefined): string {
  const trimmed = practiceName?.trim();
  return trimmed ? `${trimmed} Consultation` : 'Consultation';
}

function buildModalities(
  allowed: AllowedModalities,
  priceMinor: number
): ServiceModalitiesV1 {
  const modalities: ServiceModalitiesV1 = {};
  if (allowed.text) {
    modalities.text = { enabled: true, price_minor: priceMinor };
  }
  if (allowed.voice) {
    modalities.voice = { enabled: true, price_minor: priceMinor };
  }
  if (allowed.video) {
    modalities.video = { enabled: true, price_minor: priceMinor };
  }
  return modalities;
}

/**
 * Build the single-service offering entry (without wrapping it in a catalog).
 * Exposed so tests can drive offering-level assertions without re-parsing.
 */
export function buildSingleFeeOffering(input: SingleFeeCatalogInput): ServiceOfferingV1 {
  const priceMinor = input.appointment_fee_minor ?? DEFAULT_PRICE_MINOR;
  const allowed = deriveAllowedModalitiesFromConsultationTypes(input.consultation_types);
  const modalities = buildModalities(allowed, priceMinor);

  const offering: ServiceOfferingV1 = {
    service_id: deterministicServiceIdForLegacyOffering(
      input.doctor_id,
      SINGLE_FEE_SERVICE_KEY
    ),
    service_key: SINGLE_FEE_SERVICE_KEY,
    label: buildLabel(input.practice_name),
    matcher_hints: {},
    modalities,
    // scope_mode intentionally omitted — matcher is bypassed upstream (Task 10);
    // leaving it absent means `resolveServiceScopeMode` → 'flexible' by default.
    followup_policy: null,
  };

  return serviceOfferingV1Schema.parse(offering);
}

/**
 * Build the full single-entry `ServiceCatalogV1` for a single-fee doctor.
 *
 * Parsed through `serviceCatalogV1BaseSchema` (not `serviceCatalogV1Schema`)
 * because the catch-all guard is a multi-service invariant. If the builder
 * ever produces something invalid (bad service_id, empty modalities), this
 * fails loud in tests rather than silently in production.
 */
export function buildSingleFeeCatalog(input: SingleFeeCatalogInput): ServiceCatalogV1 {
  const offering = buildSingleFeeOffering(input);
  const catalog: ServiceCatalogV1 = {
    version: SERVICE_CATALOG_VERSION,
    services: [offering],
  };
  return serviceCatalogV1BaseSchema.parse(catalog);
}

/**
 * Stable shape stored alongside `services` when promoting a multi-service
 * catalog to single-fee. Task 12 reads this to offer a "revert to previous
 * catalog" round-trip when the doctor flips back to multi_service.
 */
export const SINGLE_FEE_BACKUP_KEY = '_backup_pre_single_fee' as const;

/**
 * Serialize the single-fee catalog for persistence, optionally preserving a
 * previous multi-service catalog under `SINGLE_FEE_BACKUP_KEY`.
 *
 * We emit a plain JSON-serializable object (not `ServiceCatalogV1`) because
 * the backup sibling is not part of the schema. Catalog readers only consume
 * `version` + `services`, so unknown top-level keys survive round-tripping.
 */
export function buildSingleFeePersistedJson(
  input: SingleFeeCatalogInput,
  options?: { preserveBackup?: unknown }
): Record<string, unknown> {
  const catalog = buildSingleFeeCatalog(input);
  const out: Record<string, unknown> = { ...catalog };
  const backup = options?.preserveBackup;
  if (backup !== undefined && backup !== null) {
    out[SINGLE_FEE_BACKUP_KEY] = backup;
  }
  return out;
}
