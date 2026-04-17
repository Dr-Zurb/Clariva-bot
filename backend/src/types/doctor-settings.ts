/**
 * Doctor Settings Type Definitions (e-task-4.1)
 *
 * Per-doctor appointment fee and currency (and optional country).
 * When a value is null, the app uses env fallback.
 *
 * Payout columns (migration 025): payout_schedule, payout_minor, razorpay_linked_account_id.
 * RBH-09 (migration 033): instagram_receptionist_paused, instagram_receptionist_pause_message.
 * SFU-01 (migration 035): service_offerings_json — validated via service-catalog-schema (version 1).
 */

import type {
  ServiceCatalogTemplatesJsonV1,
  ServiceCatalogV1,
} from '../utils/service-catalog-schema';

/** When doctor receives payouts. NULL = default weekly in payout service. */
export type PayoutSchedule = 'per_appointment' | 'daily' | 'weekly' | 'monthly';

/** OPD scheduling mode (migration 028, e-task-opd-01). */
export type OpdMode = 'slot' | 'queue';

/**
 * Plan 03 · Task 08 — how the doctor charges for consultations.
 *   - `single_fee`   : one flat fee (legacy `appointment_fee_minor`); Task 09 materializes a single-entry catalog internally.
 *   - `multi_service`: explicit service catalog in `service_offerings_json`.
 *   - `null`         : undecided (fresh onboarding); Task 12 prompts the mode selector.
 *
 * The CHECK constraint in `048_catalog_mode.sql` enforces the same set of allowed values
 * at the database layer. Keep `CATALOG_MODES` in sync with the frontend mirror in
 * `frontend/types/doctor-settings.ts`.
 */
export const CATALOG_MODES = ['single_fee', 'multi_service'] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

export interface DoctorSettingsRow {
  doctor_id: string;
  /**
   * @deprecated Plan 03 · Task 11 — use `service_offerings_json` (per-modality
   * pricing) instead. Planned removal: **Phase 3** (see
   * `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md`).
   *
   * NOT dead yet: remains the **seed** for `catalog_mode === 'single_fee'`
   * doctors' auto-materialized single-entry catalog (Task 09). Phase 2 migrations
   * must replace *reader* sites (render / comparison / quote / gate); the seed
   * site in `single-fee-catalog.ts` stays until Phase 3 cutover.
   */
  appointment_fee_minor: number | null;
  appointment_fee_currency: string | null;
  country: string | null;
  practice_name: string | null;
  timezone: string;
  slot_interval_minutes: number;
  max_advance_booking_days: number;
  min_advance_hours: number;
  business_hours_summary: string | null;
  cancellation_policy_hours: number | null;
  max_appointments_per_day: number | null;
  booking_buffer_minutes: number | null;
  welcome_message: string | null;
  specialty: string | null;
  address_summary: string | null;
  consultation_types: string | null;
  /**
   * SFU-01: Structured service × modality pricing + optional follow-up policy.
   * DB may contain legacy invalid shapes — use `getActiveServiceCatalog` / `safeParseServiceCatalogV1FromDb` when reading.
   */
  service_offerings_json: ServiceCatalogV1 | null;
  /**
   * SFU-14: User-named catalogs. Omitted on legacy-shaped rows; API GET/PATCH responses include
   * normalized `{ templates: [] }` after `normalizeDoctorSettingsApiRow`.
   */
  service_catalog_templates_json?: ServiceCatalogTemplatesJsonV1;
  /**
   * Plan 03 · Task 08: how this doctor charges for consultations. `null` means undecided
   * (fresh onboarding row post-migration). See {@link CatalogMode}.
   */
  catalog_mode: CatalogMode | null;
  default_notes: string | null;
  /** When doctor receives payouts. Migration 025. */
  payout_schedule: PayoutSchedule | null;
  /** Min amount (paise) before payout; NULL = pay any. Migration 025. */
  payout_minor: number | null;
  /** Razorpay Route Linked Account ID for India. Migration 025. */
  razorpay_linked_account_id: string | null;
  /** OPD: fixed slots vs token queue. Migration 028. Default slot. */
  opd_mode: OpdMode;
  /** Optional JSON policies (grace minutes, caps); keys documented in DB_SCHEMA. Migration 028. */
  opd_policies: Record<string, unknown> | null;
  /**
   * When true, automated Instagram DM replies and comment outreach (DM + public reply) are off.
   * Migration 033, RBH-09.
   */
  instagram_receptionist_paused: boolean;
  /** Optional custom patient-facing DM when paused; null = default copy (no “instant human” promise). */
  instagram_receptionist_pause_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resolved values for payment link creation.
 * Non-null from DB; fallback applied by caller from env.
 */
export interface DoctorPaymentSettings {
  amountMinor: number;
  currency: string;
  doctorCountry: string;
}
