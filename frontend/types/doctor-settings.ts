/**
 * Doctor settings types aligned with backend API.
 * @see backend/src/types/doctor-settings.ts, e-task-2, e-task-opd-01
 */

import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";

/** OPD scheduling: fixed slots vs token queue (migration 028). */
export type OpdMode = 'slot' | 'queue';

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
  /** Appointment fee in smallest unit (paise INR, cents USD). e.g. 50000 = ₹500 */
  appointment_fee_minor: number | null;
  /** Currency code e.g. INR, USD */
  appointment_fee_currency: string | null;
  opd_mode?: OpdMode;
  opd_policies?: Record<string, unknown> | null;
  instagram_receptionist_paused?: boolean;
  instagram_receptionist_pause_message?: string | null;
}>;
