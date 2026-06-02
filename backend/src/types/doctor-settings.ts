/**
 * Doctor Settings Type Definitions (e-task-4.1)
 *
 * Per-doctor appointment fee and currency (and optional country).
 * When a value is null, the app uses env fallback.
 *
 * Payout columns (migration 025): payout_schedule, payout_minor, razorpay_linked_account_id.
 * RBH-09 (migration 033): instagram_receptionist_paused, instagram_receptionist_pause_message.
 * SFU-01 (migration 035): service_offerings_json — validated via service-catalog-schema (version 1).
 * CC-08 / CC-09 (migration): cockpit_layout_presets JSONB — user-saved cockpit layout presets.
 */

import type {
  ServiceCatalogTemplatesJsonV1,
  ServiceCatalogV1,
} from '../utils/service-catalog-schema';

/** CC-08 / 099: legacy flat three-column cockpit layout snapshot. */
export type LegacyPresetLayout = {
  slots: ['chart' | 'body' | 'rx', 'chart' | 'body' | 'rx', 'chart' | 'body' | 'rx'];
  widths: [number, number, number];
  /**
   * Per-column collapsed flags. `body` is optional for back-compat
   * with payloads written before the body column became side-
   * collapsible (May 2026 cockpit polish) — backend validators
   * coerce a missing `body` to `false` rather than rejecting the
   * preset.
   */
  collapsed: { chart: boolean; rx: boolean; body?: boolean };
};

/** R-LAYOUT-UX (112 / clpm-01): recursive split tree for the new cockpit shell. */
export type LayoutNode =
  | { kind: 'pane'; paneId: string; collapsed?: boolean }
  | {
      kind: 'split';
      direction: 'horizontal' | 'vertical';
      children: LayoutNode[];
      sizes: number[];
    };

/**
 * CC-08 / CC-09: a single user-saved cockpit layout preset.
 * Stored inside the `cockpit_layout_presets` JSONB array on `doctor_settings`.
 * Built-in presets (Triage / Consult / Document) live in the frontend bundle
 * and are NOT persisted here.
 */
export interface CockpitLayoutPreset {
  /** Stable client-generated id (e.g. `crypto.randomUUID()`). */
  id: string;
  /** User-supplied display name (1–60 chars after trim). */
  name: string;
  /** ISO timestamp the preset was created — used for soft-cap eviction (oldest first). */
  created_at: string;
  /** DL-11 (112): built-in template id for "Reset to template default". */
  sourceTemplateId?: string;
  /** Legacy flat layout (099). At least one of layout / layout_tree required. */
  layout?: LegacyPresetLayout;
  /** Recursive tree layout (112). At least one of layout / layout_tree required. */
  layout_tree?: LayoutNode;
}

/** When doctor receives payouts. NULL = default weekly in payout service. */
export type PayoutSchedule = 'per_appointment' | 'daily' | 'weekly' | 'monthly';

/** OPD scheduling mode (migration 028, e-task-opd-01). */
export type OpdMode = 'slot' | 'queue';

/** DL-9: day-of-week keys for mode_schedule.weekly_overrides (doctor TZ). */
export type ModeScheduleWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ModeScheduleWeeklyOverrides {
  mon?: OpdMode;
  tue?: OpdMode;
  wed?: OpdMode;
  thu?: OpdMode;
  fri?: OpdMode;
  sat?: OpdMode;
  sun?: OpdMode;
}

export interface ModeScheduleDateRangeOverride {
  /** YYYY-MM-DD, inclusive */
  from: string;
  /** YYYY-MM-DD, inclusive — required per DL-9 (no open-ended ranges) */
  to: string;
  mode: OpdMode;
}

export interface ModeScheduleDateOverride {
  /** YYYY-MM-DD */
  date: string;
  mode: OpdMode;
}

/** doctor_settings.opd_policies.mode_schedule (DL-9). */
export interface ModeSchedule {
  /** Ultimate fallback for unmatched dates */
  default_mode?: OpdMode;
  /** Day-of-week defaults (in doctor's TZ) */
  weekly_overrides?: ModeScheduleWeeklyOverrides;
  /** Inclusive date-range rules; LATER entry wins on overlap */
  date_range_overrides?: ModeScheduleDateRangeOverride[];
  /** Single-date rules; LATER entry wins on overlap */
  date_overrides?: ModeScheduleDateOverride[];
}

/** Known keys inside doctor_settings.opd_policies JSONB. */
export interface OpdPoliciesShape {
  slot_join_grace_minutes?: number;
  reschedule_payment_policy?: 'forfeit' | 'transfer_entitlement';
  queue_reinsert_default?: 'end_of_queue' | 'after_current';
  mode_schedule?: ModeSchedule;
  [key: string]: unknown;
}

/**
 * pf-09 (migration 098) — what happens after the doctor taps "Done with patient":
 *   - `'countdown'` (default): pf-11 shows a 5-second confirm overlay before routing.
 *   - `'instant'`            : skip the overlay; route immediately.
 *   - `'manual'`             : stay on the current screen until the doctor moves.
 *
 * Mirror the DB CHECK constraint in `098_doctor_patient_flow_advance.sql` and the
 * frontend twin in `frontend/types/doctor-settings.ts`.
 */
export const PATIENT_FLOW_ADVANCE_VALUES = ['countdown', 'instant', 'manual'] as const;
export type PatientFlowAdvance = (typeof PATIENT_FLOW_ADVANCE_VALUES)[number];

/** pf-09 — auto-no-show timer bounds (minutes). NULL outside the column = off. */
export const AUTO_NO_SHOW_AFTER_MIN_MIN = 5;
export const AUTO_NO_SHOW_AFTER_MIN_MAX = 240;

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

/**
 * R-MOD-full (migration 106): doctor's global cockpit template pin.
 * `null` = auto-select per modality + state. Vocab mirrors the DB CHECK
 * constraint and the frontend `CockpitTemplate` type in
 * `frontend/lib/patient-profile/state.ts`.
 */
export const COCKPIT_TEMPLATE_OVERRIDE_VALUES = [
  'telemed-video',
  'telemed-voice',
  'telemed-text',
  'review',
] as const;
export type CockpitTemplateOverride = (typeof COCKPIT_TEMPLATE_OVERRIDE_VALUES)[number];

export interface DoctorSettingsRow {
  doctor_id: string;
  /**
   * @deprecated Plan 03 · Task 11 — use `service_offerings_json` (per-modality
   * pricing) instead. Planned removal: **Phase 3** (see
   * `docs/Work/Architecture/legacy-appointment-fee-minor-deprecation.md`).
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
  /**
   * pf-09 (migration 098): post-wrap-up routing preference. Default `'countdown'`
   * for every existing doctor (DB-side DEFAULT) — matches source plan P-D2.
   * Read by pf-11's countdown hook and pf-15's prefetch trigger.
   */
  patient_flow_advance: PatientFlowAdvance;
  /**
   * pf-09 (migration 098): opt-in minutes after which pf-17's worker marks
   * appointments `no_show` if no consultation has started. NULL = off (default
   * per P-D7). Range [{@link AUTO_NO_SHOW_AFTER_MIN_MIN}, {@link AUTO_NO_SHOW_AFTER_MIN_MAX}].
   */
  auto_no_show_after_min: number | null;
  /**
   * CC-08 / CC-09: user-saved cockpit layout presets (max 5, enforced by DB CHECK).
   * Built-in presets (Triage / Consult / Document) are bundled in the frontend
   * and are NOT stored here.
   */
  cockpit_layout_presets: CockpitLayoutPreset[];
  /**
   * R-MOD-full (migration 106): global template pin. `null` = auto-select per
   * modality + state (cockpit-v2 default). Non-null must be one of
   * {@link COCKPIT_TEMPLATE_OVERRIDE_VALUES}.
   */
  cockpit_template_override: CockpitTemplateOverride | null;
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
