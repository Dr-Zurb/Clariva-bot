/**
 * Doctor settings types aligned with backend API.
 * @see backend/src/types/doctor-settings.ts, e-task-2, e-task-opd-01
 */

import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";

/** OPD scheduling: fixed slots vs token queue (migration 028). */
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
  from: string;
  to: string;
  mode: OpdMode;
}

export interface ModeScheduleDateOverride {
  date: string;
  mode: OpdMode;
}

/** doctor_settings.opd_policies.mode_schedule (DL-9). */
export interface ModeSchedule {
  default_mode?: OpdMode;
  weekly_overrides?: ModeScheduleWeeklyOverrides;
  date_range_overrides?: ModeScheduleDateRangeOverride[];
  date_overrides?: ModeScheduleDateOverride[];
}

/** Known keys inside doctor_settings.opd_policies JSONB. */
export interface OpdPoliciesShape {
  slot_grace_join_minutes?: number;
  slot_join_grace_minutes?: number;
  mode_schedule?: ModeSchedule;
  [key: string]: unknown;
}

export type OpdSessionDayModeSource = 'fact' | 'policy' | 'doctor_settings' | 'default';

/**
 * pf-09 (migration 098) — what happens after the doctor taps "Done with patient":
 *   - `'countdown'` (default): pf-11 shows a 5-second confirm overlay before routing.
 *   - `'instant'`            : skip the overlay; route immediately.
 *   - `'manual'`             : stay on the current screen until the doctor moves.
 *
 * Mirror the DB CHECK constraint in `backend/migrations/098_doctor_patient_flow_advance.sql`
 * and the backend twin in `backend/src/types/doctor-settings.ts`.
 */
export const PATIENT_FLOW_ADVANCE_VALUES = ['countdown', 'instant', 'manual'] as const;
export type PatientFlowAdvance = (typeof PATIENT_FLOW_ADVANCE_VALUES)[number];

/** pf-09 — auto-no-show timer bounds (minutes). */
export const AUTO_NO_SHOW_AFTER_MIN_MIN = 5;
export const AUTO_NO_SHOW_AFTER_MIN_MAX = 240;

/**
 * Plan 03 · Task 08 — how the doctor charges for consultations.
 *   - `single_fee`    : one flat fee (legacy `appointment_fee_minor`).
 *   - `multi_service` : explicit service catalog in `service_offerings_json`.
 *   - `null`          : undecided (fresh onboarding); Task 12 renders the mode selector.
 *
 * Keep literals in sync with the backend mirror in `backend/src/types/doctor-settings.ts`.
 */
export const CATALOG_MODES = ['single_fee', 'multi_service'] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

/** SFU-14: one user-named snapshot (same `catalog` shape as live `service_offerings_json`). */
export interface UserSavedServiceTemplateV1 {
  id: string;
  name: string;
  specialty_tag?: string | null;
  updated_at: string;
  catalog: ServiceCatalogV1;
}

export interface ServiceCatalogTemplatesJsonV1 {
  templates: UserSavedServiceTemplateV1[];
}

/** Max templates per doctor (backend `MAX_USER_SAVED_TEMPLATES`). */
export const MAX_USER_SAVED_SERVICE_TEMPLATES = 20;

export interface DoctorSettings {
  doctor_id: string;
  /**
   * @deprecated Plan 03 · Task 11 — use `service_offerings_json` (per-modality
   * pricing) instead. Planned removal: **Phase 3** (see
   * `docs/Work/Architecture/legacy-appointment-fee-minor-deprecation.md`).
   *
   * The API envelope still returns this field during Phase 2 coexistence so
   * legacy admin-console code paths continue to read it; new UI surfaces MUST
   * render from the catalog, not from this field.
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
  /** SFU-01/06: structured teleconsult pricing; null/omitted = legacy flat fee only. */
  service_offerings_json?: ServiceCatalogV1 | null;
  /** SFU-14: user-named catalog templates; omitted or empty until saved. */
  service_catalog_templates_json?: ServiceCatalogTemplatesJsonV1 | null;
  default_notes: string | null;
  /** OPD mode (migration 028). Absent pre-migration — UI defaults to `slot`. */
  opd_mode?: OpdMode;
  /** Optional policy JSON (grace minutes, caps); keys in DB_SCHEMA. */
  opd_policies?: Record<string, unknown> | null;
  /** RBH-09: Pause automated Instagram DM + comment outreach. */
  instagram_receptionist_paused?: boolean;
  /** Optional custom DM text when paused (nullable). */
  instagram_receptionist_pause_message?: string | null;
  /**
   * Plan 03 · Task 08: catalog-charging mode. `null` = undecided (Task 12
   * prompts the mode selector). Absent on legacy API responses pre-migration.
   */
  catalog_mode?: CatalogMode | null;
  /**
   * pf-09 (migration 098): post-wrap-up routing preference. Default `'countdown'`
   * for every existing doctor (DB-side DEFAULT). Read by pf-11's countdown hook.
   */
  patient_flow_advance?: PatientFlowAdvance;
  /**
   * pf-09 (migration 098): opt-in auto-no-show timer (minutes). NULL = off
   * (default). Range [{@link AUTO_NO_SHOW_AFTER_MIN_MIN}, {@link AUTO_NO_SHOW_AFTER_MIN_MAX}].
   */
  auto_no_show_after_min?: number | null;
  /**
   * R-MOD (migration 106): global cockpit template pin. `null` = auto-select
   * per modality + state via `mapStateToTemplate`.
   */
  cockpit_template_override?:
    | 'telemed-video'
    | 'telemed-voice'
    | 'telemed-text'
    | 'review'
    | null;
  created_at: string;
  updated_at: string;
}

/** Partial update payload for PATCH */
export type PatchDoctorSettingsPayload = Partial<{
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
  service_offerings_json?: ServiceCatalogV1 | null;
  service_catalog_templates_json?: ServiceCatalogTemplatesJsonV1 | null;
  default_notes: string | null;
  /**
   * Appointment fee in smallest unit (paise INR, cents USD). e.g. 50000 = ₹500.
   * @deprecated Plan 03 · Task 11 — PATCH the catalog (`service_offerings_json`)
   * instead for multi-service doctors; for single-fee doctors, Task 09's sync
   * re-builds the catalog from this field automatically. Planned removal:
   * **Phase 3** (see
   * `docs/Work/Architecture/legacy-appointment-fee-minor-deprecation.md`).
   */
  appointment_fee_minor: number | null;
  /** Currency code e.g. INR, USD */
  appointment_fee_currency: string | null;
  opd_mode?: OpdMode;
  opd_policies?: Record<string, unknown> | null;
  instagram_receptionist_paused?: boolean;
  instagram_receptionist_pause_message?: string | null;
  /** Plan 03 · Task 08: set mode; `null` clears (only for undecided rows). */
  catalog_mode?: CatalogMode | null;
  /** pf-09: post-wrap-up routing preference. */
  patient_flow_advance?: PatientFlowAdvance;
  /** pf-09: opt-in auto-no-show timer (minutes). `null` clears = off. */
  auto_no_show_after_min?: number | null;
  /** R-MOD: global cockpit template pin. `null` clears = auto-select. */
  cockpit_template_override?:
    | 'telemed-video'
    | 'telemed-voice'
    | 'telemed-text'
    | 'review'
    | null;
}>;
