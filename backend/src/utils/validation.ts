/**
 * Validation Utilities (e-task-4)
 *
 * Zod schemas for patient collection fields per RECIPES R-VALIDATION-001.
 * Phone: E.164-like regex. Used in collection/flow layer (webhook path has no HTTP controller).
 * Validation failures throw ValidationError (ERROR_CATALOG).
 *
 * e-task-1: availableSlotsQuerySchema for GET /api/v1/appointments/available-slots
 */

import { z } from 'zod';
import { ValidationError } from './errors';
import { env } from '../config/env';
import {
  serviceCatalogIncomingSchema,
  serviceCatalogTemplatesJsonSchema,
} from './service-catalog-schema';
import {
  AUTO_NO_SHOW_AFTER_MIN_MAX,
  AUTO_NO_SHOW_AFTER_MIN_MIN,
  CATALOG_MODES,
  PATIENT_FLOW_ADVANCE_VALUES,
  COCKPIT_TEMPLATE_OVERRIDE_VALUES,
  type ModeSchedule,
} from '../types/doctor-settings';
import type { PatientListFilters, PatientListSortId, PatientSegmentId } from '../services/patient-list-types';
import {
  PATIENT_LIST_SORT_IDS,
  PATIENT_SEGMENT_IDS,
  PRESCRIPTION_FOLLOW_UP_VALUE_SUPPORTED,
} from '../services/patient-list-segment-sql';

// ============================================================================
// Constants (RECIPES: E.164-like phone)
// ============================================================================

/** E.164-like phone: optional +, then 1-9, then 1-14 digits (RECIPES R-VALIDATION-001) */
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/** Name length bounds */
const NAME_MIN_LEN = 1;
const NAME_MAX_LEN = 200;

/** reason_for_visit max length (stored on appointment.notes or future patients column) */
const REASON_MAX_LEN = 500;

/** Acceptable DOB format: YYYY-MM-DD or M/D/YYYY - normalize to ISO date string (date-only, no TZ shift) */
function parseDateString(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  // ISO YYYY-MM-DD: return as-is (date-only, no Date object to avoid TZ shift)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const [, , m, d] = isoMatch;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return trimmed;
  }
  // US-style M/D/YYYY or MM/DD/YYYY: build ISO from parts
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    const year = parseInt(y!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

// ============================================================================
// Zod Schemas (field-level)
// ============================================================================

export const patientPhoneSchema = z
  .string()
  .min(1, 'Phone is required')
  .regex(PHONE_REGEX, 'Please provide a valid phone number (e.g. +1234567890)');

export const patientNameSchema = z
  .string()
  .min(NAME_MIN_LEN, 'Name is required')
  .max(NAME_MAX_LEN, `Name must be at most ${NAME_MAX_LEN} characters`)
  .transform((s) => s.trim());

export const patientDobSchema = z
  .string()
  .min(1, 'Date of birth is required')
  .refine(
    (s) => parseDateString(s) !== null,
    'Please provide a valid date of birth (e.g. YYYY-MM-DD or M/D/YYYY)'
  )
  .transform((s) => parseDateString(s)!);

export const patientGenderSchema = z
  .string()
  .max(50, 'Gender must be at most 50 characters')
  .transform((s) => s.trim() || undefined)
  .optional();

export const patientReasonForVisitSchema = z
  .string()
  .max(REASON_MAX_LEN, `Reason for visit must be at most ${REASON_MAX_LEN} characters`)
  .transform((s) => s.trim());

/** Age: 1-120 (required for collection). Accepts string or number. */
export const patientAgeSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : parseInt(String(v).trim(), 10)))
  .refine((n) => !Number.isNaN(n) && n >= 1 && n <= 120, 'Please provide a valid age (1-120)');

/** Email: optional, valid format. Empty string → undefined. */
export const patientEmailSchema = z
  .string()
  .max(254, 'Email too long')
  .transform((s) => {
    const t = s.trim();
    if (!t) return undefined;
    const email = t.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please provide a valid email address');
    return email;
  });

// ============================================================================
// Field name type and validation map
// ============================================================================

export const PATIENT_COLLECTION_FIELDS = [
  'name',
  'phone',
  'age',
  'gender',
  'reason_for_visit',
  'email',
] as const;

export type PatientCollectionField = (typeof PATIENT_COLLECTION_FIELDS)[number];

/** Required fields before transitioning to confirm_details (e-task-2). Gender required for medical context. */
export const REQUIRED_COLLECTION_FIELDS: readonly PatientCollectionField[] = [
  'name',
  'phone',
  'age',
  'gender',
  'reason_for_visit',
];

const fieldSchemas: Record<
  PatientCollectionField,
  z.ZodType<string | number | undefined>
> = {
  name: patientNameSchema,
  phone: patientPhoneSchema,
  age: patientAgeSchema,
  gender: patientGenderSchema,
  reason_for_visit: patientReasonForVisitSchema,
  email: patientEmailSchema as z.ZodType<string | undefined>,
};

/**
 * Partial collected patient data (PHI). Used only in memory/Redis until Task 5 consent.
 * Not stored in conversations.metadata.
 */
export interface CollectedPatientData {
  name?: string;
  phone?: string;
  age?: number;
  gender?: string;
  reason_for_visit?: string;
  email?: string;
}

/**
 * Validate a single patient collection field value.
 * Used in collection/flow layer before updating in-memory store.
 *
 * @param field - Field name
 * @param value - Raw string from user message
 * @returns Validated value (normalized string)
 * @throws ValidationError when validation fails
 */
export function validatePatientField(
  field: PatientCollectionField,
  value: string
): string | number | undefined {
  const schema = fieldSchemas[field];
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid value';
    throw new ValidationError(message);
  }
  return result.data as string | number | undefined;
}

// ============================================================================
// Available Slots Query Schema (e-task-1, RECIPES R-VALIDATION-001)
// ============================================================================

const MAX_FUTURE_DAYS = env.AVAILABLE_SLOTS_MAX_FUTURE_DAYS;

export const availableSlotsQuerySchema = z.object({
  doctorId: z.string().uuid('doctorId must be a valid UUID'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .refine(
      (val) => {
        const d = new Date(val + 'T12:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const dayStart = new Date(val + 'T00:00:00Z');
        return !isNaN(d.getTime()) && dayStart >= today;
      },
      'date cannot be in the past'
    )
    .refine(
      (val) => {
        const d = new Date(val + 'T12:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const maxDate = new Date(today);
        maxDate.setUTCDate(maxDate.getUTCDate() + MAX_FUTURE_DAYS);
        return d <= maxDate;
      },
      `date cannot be more than ${MAX_FUTURE_DAYS} days in the future`
    ),
});

export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;

export function validateAvailableSlotsQuery(
  query: Record<string, string | undefined>
): AvailableSlotsQuery {
  const result = availableSlotsQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Book Appointment Schema (e-task-2, RECIPES R-VALIDATION-001)
// ============================================================================

const REASON_FOR_VISIT_MAX_LEN = 500;
const NOTES_MAX_LEN = 1000;

export const bookAppointmentSchema = z.object({
  doctorId: z.string().uuid('doctorId must be a valid UUID'),
  patientId: z.string().uuid('patientId must be a valid UUID').optional(),
  patientName: patientNameSchema,
  patientPhone: patientPhoneSchema,
  appointmentDate: z
    .string()
    .datetime({ message: 'appointmentDate must be ISO 8601 datetime' })
    .refine(
      (val) => new Date(val) >= new Date(),
      'Cannot book appointments in the past'
    ),
  reasonForVisit: z
    .string()
    .min(1, 'Reason for visit is required')
    .max(REASON_FOR_VISIT_MAX_LEN, `Reason for visit must be at most ${REASON_FOR_VISIT_MAX_LEN} characters`)
    .transform((s) => s.trim()),
  notes: z
    .string()
    .max(NOTES_MAX_LEN, `Notes must be at most ${NOTES_MAX_LEN} characters`)
    .transform((s) => s.trim() || undefined)
    .optional(),
  consultationType: z
    .enum(['video', 'in_clinic', 'text', 'voice'])
    .optional(),
  /** SFU-05: matches doctor_settings.service_offerings_json service_key */
  catalogServiceKey: z.string().min(1).max(64).trim().optional(),
  /** SFU-11: matches service_id in catalog */
  catalogServiceId: z.string().uuid('catalogServiceId must be a UUID').optional(),
  /** SFU-05: quote modality (teleconsult) */
  consultationModality: z.enum(['text', 'voice', 'video']).optional(),
  /** SFU-05: active episode when visit is a priced follow-up */
  episodeId: z.string().uuid('episodeId must be a valid UUID').optional(),
  conversationId: z.string().uuid().optional(),
  /** When true, appointment status is 'confirmed' and no payment; doctor-create flow only. */
  freeOfCost: z.boolean().optional(),
  /** OPD slot hub — overflow / return row (migration 031). */
  opdEventType: z.enum(['standard', 'return_after_completed']).optional(),
  /** Links overflow / return visit to a prior appointment on the same day. */
  relatedAppointmentId: z.string().uuid('relatedAppointmentId must be a valid UUID').optional(),
});

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

// ============================================================================
// Doctor Create Appointment Schema (e-task-5 - Add Appointment from Dashboard)
// ============================================================================

export const doctorCreateAppointmentSchema = z
  .object({
    patientId: z.string().uuid('patientId must be a valid UUID').optional(),
    patientName: patientNameSchema.optional(),
    patientPhone: patientPhoneSchema.optional(),
    appointmentDate: z
      .string()
      .datetime({ message: 'appointmentDate must be ISO 8601 datetime' }),
    reasonForVisit: z
      .string()
      .max(REASON_FOR_VISIT_MAX_LEN, `Reason for visit must be at most ${REASON_FOR_VISIT_MAX_LEN} characters`)
      .transform((s) => s.trim())
      .optional(),
    notes: z
      .string()
      .max(NOTES_MAX_LEN, `Notes must be at most ${NOTES_MAX_LEN} characters`)
      .transform((s) => s.trim() || undefined)
      .optional(),
    freeOfCost: z.boolean().optional().default(false),
    /** pf-16: fast-path walk-in — bypasses patientName/Phone/reason requirements. */
    walkin: z.boolean().optional(),
    /** pf-16: optional free-text name hint stored in notes until a patient row is linked. */
    patientNameHint: z
      .string()
      .max(200, 'patientNameHint must be at most 200 characters')
      .trim()
      .nullable()
      .optional(),
    /** pf-16: consultation modality for the walk-in appointment. */
    consultationType: z.enum(['video', 'in_clinic', 'text', 'voice']).optional(),
    /** OPD slot hub — doctor add-slot / overflow dialog (sl-06). */
    opdEventType: z.enum(['standard', 'return_after_completed']).optional(),
    relatedAppointmentId: z.string().uuid('relatedAppointmentId must be a valid UUID').optional(),
  })
  .refine(
    (data) => {
      if (data.walkin) return true;
      if (data.patientId) return true;
      return !!data.patientName && !!data.patientPhone;
    },
    { message: 'Either walkin flag, patientId, or both patientName and patientPhone are required' }
  );

export type DoctorCreateAppointmentInput = z.infer<typeof doctorCreateAppointmentSchema>;

export function validateDoctorCreateAppointment(body: unknown): DoctorCreateAppointmentInput {
  const result = doctorCreateAppointmentSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export function validateBookAppointment(body: unknown): BookAppointmentInput {
  const result = bookAppointmentSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Get Appointment Params Schema (e-task-2, RECIPES R-VALIDATION-001)
// ============================================================================

export const getAppointmentParamsSchema = z.object({
  id: z.string().uuid('Invalid appointment ID'),
});

export type GetAppointmentParams = z.infer<typeof getAppointmentParamsSchema>;

export function validateGetAppointmentParams(params: unknown): GetAppointmentParams {
  const result = getAppointmentParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid appointment ID';
    throw new ValidationError(message);
  }
  return result.data;
}

/** GET /api/v1/appointments — optional per-patient filter (pr-11). */
export const listAppointmentsQuerySchema = z.object({
  patient_id: z.string().uuid('patient_id must be a valid UUID').optional(),
});

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export function validateListAppointmentsQuery(
  query: Record<string, string | string[] | undefined>
): ListAppointmentsQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = listAppointmentsQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// PATCH Appointment Body (e-task-5 - status, clinical_notes)
// ============================================================================

const CLINICAL_NOTES_MAX_LEN = 5000;

export const patchAppointmentBodySchema = z
  .object({
    status: z
      .enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
      .optional(),
    clinical_notes: z
      .union([
        z.string().max(CLINICAL_NOTES_MAX_LEN).transform((s) => (s.trim() === '' ? null : s.trim())),
        z.null(),
      ])
      .optional(),
  })
  .refine((data) => data.status !== undefined || data.clinical_notes !== undefined, {
    message: 'At least one field (status or clinical_notes) is required',
  });

export type PatchAppointmentBody = z.infer<typeof patchAppointmentBodySchema>;

export function validatePatchAppointmentBody(body: unknown): PatchAppointmentBody {
  const result = patchAppointmentBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Recording Consent Body (Plan 02 · Task 27)
// ============================================================================

export const recordingConsentBodySchema = z.object({
  decision: z.boolean({ message: 'decision must be a boolean' }),
  consentVersion: z
    .string({ message: 'consentVersion must be a string' })
    .min(1, 'consentVersion must not be empty')
    .max(32, 'consentVersion is too long'),
  bookingToken: z
    .string({ message: 'bookingToken must be a string' })
    .min(10, 'bookingToken must be a valid token')
    .max(2048, 'bookingToken is too long')
    .optional(),
});

export type RecordingConsentBody = z.infer<typeof recordingConsentBodySchema>;

export function validateRecordingConsentBody(body: unknown): RecordingConsentBody {
  const result = recordingConsentBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Wrap-up Body (pf-02 — Patient seeing flow)
// ----------------------------------------------------------------------------
// Body shape for `POST /v1/appointments/:id/wrap-up`. The wrap-up dialog
// (pf-04) sends every field optional — the doctor may save mid-call without
// a diagnosis line yet, or finalise without a follow-up date. Storage-side
// invariants (NOT NULL on `diagnosis_tags`, CHECK on `followup_kind`) live
// in migration 097 (pf-01).
//
// `followup_date` is YYYY-MM-DD (`DATE` column server-side). We accept the
// ISO date string and let Postgres do the parse — passing through a JS
// `Date` would force a TZ assumption we don't want here.
// ============================================================================

const DIAGNOSIS_TEXT_MAX_LEN = 2000;
const DIAGNOSIS_TAG_MAX_LEN = 64;
const DIAGNOSIS_TAGS_MAX_COUNT = 20;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const wrapUpBodySchema = z.object({
  diagnosis_text: z
    .string()
    .max(DIAGNOSIS_TEXT_MAX_LEN, `diagnosis_text must be at most ${DIAGNOSIS_TEXT_MAX_LEN} characters`)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional(),
  diagnosis_tags: z
    .array(
      z
        .string()
        .min(1, 'diagnosis_tags entries must not be empty')
        .max(DIAGNOSIS_TAG_MAX_LEN, `diagnosis_tags entries must be at most ${DIAGNOSIS_TAG_MAX_LEN} characters`)
        .transform((s) => s.trim())
    )
    .max(DIAGNOSIS_TAGS_MAX_COUNT, `diagnosis_tags must contain at most ${DIAGNOSIS_TAGS_MAX_COUNT} entries`)
    .default([]),
  followup_date: z
    .string()
    .regex(ISO_DATE_REGEX, 'followup_date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  followup_kind: z.enum(['none', 'in_person', 'tele']).nullable().optional(),
});

export type WrapUpBody = z.infer<typeof wrapUpBodySchema>;

export function validateWrapUpBody(body: unknown): WrapUpBody {
  const result = wrapUpBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid wrap-up body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Recent diagnoses query (pf-02): GET /v1/diagnoses/recent?limit=20
// ============================================================================

const RECENT_DIAGNOSES_LIMIT_DEFAULT = 20;
const RECENT_DIAGNOSES_LIMIT_MAX = 50;

export const recentDiagnosesQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined) return RECENT_DIAGNOSES_LIMIT_DEFAULT;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : RECENT_DIAGNOSES_LIMIT_DEFAULT;
    })
    .pipe(
      z
        .number()
        .int('limit must be an integer')
        .min(1, 'limit must be at least 1')
        .max(RECENT_DIAGNOSES_LIMIT_MAX, `limit must be at most ${RECENT_DIAGNOSES_LIMIT_MAX}`)
    ),
});

export type RecentDiagnosesQuery = z.infer<typeof recentDiagnosesQuerySchema>;

export function validateRecentDiagnosesQuery(query: unknown): RecentDiagnosesQuery {
  const result = recentDiagnosesQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid limit';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Consultation Schemas (e-task-3 - teleconsultation)
// ============================================================================

export const startConsultationBodySchema = z.object({
  appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
});

export type StartConsultationBody = z.infer<typeof startConsultationBodySchema>;

export function validateStartConsultationBody(body: unknown): StartConsultationBody {
  const result = startConsultationBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const getConsultationTokenQuerySchema = z
  .object({
    appointmentId: z.string().uuid('appointmentId must be a valid UUID').optional(),
    token: z.string().min(1).optional(), // Patient path: required when no auth
  })
  .refine(
    (data) => data.appointmentId !== undefined || (data.token !== undefined && data.token.length >= 10),
    { message: 'Either appointmentId (doctor) or token (patient) is required' }
  );

export type GetConsultationTokenQuery = z.infer<typeof getConsultationTokenQuerySchema>;

export function validateGetConsultationTokenQuery(
  query: Record<string, string | string[] | undefined>
): GetConsultationTokenQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = getConsultationTokenQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Payment Schemas (e-task-4)
// ============================================================================

export const createPaymentLinkSchema = z.object({
  appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
  amountMinor: z.number().int().positive('amountMinor must be a positive integer (paise/cents)'),
  currency: z.string().length(3, 'currency must be 3-letter ISO code (e.g. INR, USD)'),
  doctorCountry: z.string().min(2, 'doctorCountry required (e.g. IN, US)'),
  doctorId: z.string().uuid('doctorId must be a valid UUID'),
  patientId: z.string().uuid('patientId must be a valid UUID'),
  patientName: z.string().max(200).optional(),
  patientPhone: z.string().max(30).optional(),
  patientEmail: z.string().email().optional(),
  description: z.string().max(500).optional(),
});

export type CreatePaymentLinkBody = z.infer<typeof createPaymentLinkSchema>;

export function validateCreatePaymentLink(body: unknown): CreatePaymentLinkBody {
  const result = createPaymentLinkSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const getPaymentParamsSchema = z.object({
  id: z.string().uuid('Invalid payment ID'),
});

export type GetPaymentParams = z.infer<typeof getPaymentParamsSchema>;

export function validateGetPaymentParams(params: unknown): GetPaymentParams {
  const result = getPaymentParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid payment ID';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Booking Slot Selection (e-task-3)
// ============================================================================

export const daySlotsQuerySchema = z.object({
  token: z.string().min(1, 'token is required'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .refine(
      (val) => {
        const d = new Date(val + 'T12:00:00Z');
        return !isNaN(d.getTime());
      },
      'date must be valid'
    ),
});

export type DaySlotsQuery = z.infer<typeof daySlotsQuerySchema>;

export function validateDaySlotsQuery(query: Record<string, string | undefined>): DaySlotsQuery {
  const result = daySlotsQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

export const selectSlotBodySchema = z.object({
  token: z.string().min(1, 'token is required'),
  slotStart: z
    .string()
    .datetime({ message: 'slotStart must be ISO 8601 datetime' })
    .refine(
      (val) => new Date(val) >= new Date(),
      'Cannot select a slot in the past'
    ),
  /** SFU-07: required when doctor has multi-service catalog (unless already in conversation state). */
  catalogServiceKey: z.string().min(1).max(64).trim().optional(),
  /** SFU-11 */
  catalogServiceId: z.string().uuid().optional(),
  /** SFU-07: teleconsult modality; required when multiple modalities enabled for the service. */
  consultationModality: z.enum(['text', 'voice', 'video']).optional(),
});

export type SelectSlotBody = z.infer<typeof selectSlotBodySchema>;

export function validateSelectSlotBody(body: unknown): SelectSlotBody {
  const result = selectSlotBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const slotPageInfoQuerySchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export type SlotPageInfoQuery = z.infer<typeof slotPageInfoQuerySchema>;

export function validateSlotPageInfoQuery(
  query: Record<string, string | undefined>
): SlotPageInfoQuery {
  const result = slotPageInfoQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// OPD session snapshot (e-task-opd-04)
// ============================================================================

export const sessionTokenQuerySchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export type SessionTokenQuery = z.infer<typeof sessionTokenQuerySchema>;

export function validateSessionTokenQuery(query: Record<string, string | undefined>): SessionTokenQuery {
  const result = sessionTokenQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// OPD doctor dashboard (e-task-opd-06)
// ============================================================================

/** Shared `date=YYYY-MM-DD` query for OPD session endpoints (queue + slot). */
export const opdSessionDateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

/** @deprecated Prefer `opdSessionDateQuerySchema`; kept as alias for queue-session. */
export const opdQueueSessionQuerySchema = opdSessionDateQuerySchema;

export type OpdQueueSessionQuery = z.infer<typeof opdSessionDateQuerySchema>;
export type OpdSlotSessionQuery = z.infer<typeof opdSessionDateQuerySchema>;

export function validateOpdQueueSessionQuery(
  query: Record<string, string | undefined>
): OpdQueueSessionQuery {
  const result = opdSessionDateQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

export function validateOpdSlotSessionQuery(
  query: Record<string, string | undefined>
): OpdSlotSessionQuery {
  const result = opdSessionDateQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

export type OpdSessionQuery = OpdSlotSessionQuery;

export function validateOpdSessionQuery(
  query: Record<string, string | undefined>
): OpdSessionQuery {
  const parsed = validateOpdSlotSessionQuery(query);
  const [y, m, d] = parsed.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError('date must be a valid calendar date (YYYY-MM-DD)');
  }
  return parsed;
}

export const offerEarlyJoinBodySchema = z.object({
  expiresInMinutes: z.number().int().min(5).max(120).optional(),
});

export type OfferEarlyJoinBody = z.infer<typeof offerEarlyJoinBodySchema>;

export function validateOfferEarlyJoinBody(body: unknown): OfferEarlyJoinBody {
  const result = offerEarlyJoinBodySchema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const sessionDelayBodySchema = z.object({
  delayMinutes: z.union([z.number().int().min(0).max(480), z.null()]),
});

export type SessionDelayBody = z.infer<typeof sessionDelayBodySchema>;

export function validateSessionDelayBody(body: unknown): SessionDelayBody {
  const result = sessionDelayBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const patchQueueEntryBodySchema = z.object({
  status: z.enum(['called', 'skipped']),
});

export type PatchQueueEntryBody = z.infer<typeof patchQueueEntryBodySchema>;

export function validatePatchQueueEntryBody(body: unknown): PatchQueueEntryBody {
  const result = patchQueueEntryBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const queueEntryParamsSchema = z.object({
  entryId: z.string().uuid('Invalid queue entry id'),
});

export type QueueEntryParams = z.infer<typeof queueEntryParamsSchema>;

export function validateQueueEntryParams(params: unknown): QueueEntryParams {
  const result = queueEntryParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid parameters';
    throw new ValidationError(message);
  }
  return result.data;
}

export const convertSessionBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  toMode: z.enum(['slot', 'queue']),
  notes: z.string().trim().max(500, 'notes must be at most 500 characters').optional(),
});

export type ConvertSessionBody = z.infer<typeof convertSessionBodySchema>;

/**
 * pdm-04 body validation shared by POST /opd/session/convert and
 * POST /opd/session/preview-convert. Validates `date` is a real calendar
 * date and `toMode` is `'slot' | 'queue'`; notes are optional ≤ 500 chars.
 */
export function validateConvertSessionBody(body: unknown): ConvertSessionBody {
  const result = convertSessionBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  const [y, m, d] = result.data.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m! - 1), d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== (m! - 1) ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError('date must be a valid calendar date (YYYY-MM-DD)');
  }
  return result.data;
}

export const requeueQueueEntryBodySchema = z.object({
  strategy: z.enum(['end_of_queue', 'after_current']),
});

export type RequeueQueueEntryBody = z.infer<typeof requeueQueueEntryBodySchema>;

export function validateRequeueQueueEntryBody(body: unknown): RequeueQueueEntryBody {
  const result = requeueQueueEntryBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// OPD session overrun (pdm-09)
// ============================================================================

const sessionDateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const opdSessionOverrunQuerySchema = z.object({
  date: sessionDateYmdSchema,
});

export type OpdSessionOverrunQuery = z.infer<typeof opdSessionOverrunQuerySchema>;

export function validateOpdSessionOverrunQuery(
  query: Record<string, string | undefined>
): OpdSessionOverrunQuery {
  const result = opdSessionOverrunQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Query param `date` (YYYY-MM-DD) is required.');
  }
  return result.data;
}

const overrunActionSchema = z.enum([
  'reschedule_all',
  'reschedule_per_patient',
  'mark_completed',
  'cancel_refund',
  'mark_no_show',
]);

export const bulkResolveSessionOverrunBodySchema = z.object({
  date: sessionDateYmdSchema,
  action: overrunActionSchema,
  perRowOverrides: z
    .array(
      z.object({
        appointmentId: z.string().uuid(),
        action: overrunActionSchema,
        rescheduleTo: z.string().datetime().optional(),
      })
    )
    .optional(),
});

export type BulkResolveSessionOverrunBody = z.infer<typeof bulkResolveSessionOverrunBodySchema>;

export function validateBulkResolveSessionOverrunBody(
  body: unknown
): BulkResolveSessionOverrunBody {
  const result = bulkResolveSessionOverrunBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

// ============================================================================
// Patient Params (e-task-5)
// ============================================================================

export const getPatientParamsSchema = z.object({
  id: z.string().uuid('Invalid patient ID'),
});

export type GetPatientParams = z.infer<typeof getPatientParamsSchema>;

export function validateGetPatientParams(params: unknown): GetPatientParams {
  const result = getPatientParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid patient ID';
    throw new ValidationError(message);
  }
  return result.data;
}

export const mergePatientsBodySchema = z.object({
  sourcePatientId: z.string().uuid('Invalid source patient ID'),
  targetPatientId: z.string().uuid('Invalid target patient ID'),
});

export type MergePatientsBody = z.infer<typeof mergePatientsBodySchema>;

export function validateMergePatientsBody(body: unknown): MergePatientsBody {
  const result = mergePatientsBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid merge request';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Doctor Settings PATCH (e-task-2)
// ============================================================================

export const patchDoctorSettingsSchema = z
  .object({
    practice_name: z.string().max(200).trim().nullable().optional(),
    timezone: z.string().max(100).trim().optional(),
    slot_interval_minutes: z.number().int().min(1).max(60).optional(),
    max_advance_booking_days: z.number().int().min(1).max(365).optional(),
    min_advance_hours: z.number().int().min(0).optional(),
    business_hours_summary: z.string().max(500).trim().nullable().optional(),
    cancellation_policy_hours: z.number().int().min(0).nullable().optional(),
    max_appointments_per_day: z.number().int().min(1).nullable().optional(),
    booking_buffer_minutes: z.number().int().min(0).nullable().optional(),
    welcome_message: z.string().max(1000).trim().nullable().optional(),
    specialty: z.string().max(200).trim().nullable().optional(),
    address_summary: z.string().max(500).trim().nullable().optional(),
    consultation_types: z.string().max(200).trim().nullable().optional(),
    /** SFU-01 / SFU-11: catalog v1; service_id optional until merge */
    service_offerings_json: z.union([serviceCatalogIncomingSchema, z.null()]).optional(),
    /** SFU-14: user-named template library */
    service_catalog_templates_json: z
      .union([serviceCatalogTemplatesJsonSchema, z.null()])
      .optional(),
    default_notes: z.string().max(1000).trim().nullable().optional(),
    appointment_fee_minor: z.number().int().min(0).nullable().optional(),
    appointment_fee_currency: z.string().length(3).nullable().optional(),
    /** Payout schedule (e-task-6): when doctor receives payouts */
    payout_schedule: z
      .enum(['per_appointment', 'daily', 'weekly', 'monthly'])
      .nullable()
      .optional(),
    /** Min amount (paise) before payout; NULL = pay any (e-task-6) */
    payout_minor: z.number().int().min(0).nullable().optional(),
    /** OPD: fixed slots vs token queue (e-task-opd-02) */
    opd_mode: z.enum(['slot', 'queue']).optional(),
    /**
     * Optional JSON policy blob (grace minutes, reschedule policy, etc.).
     * Object keys/values are validated loosely here; doctor-settings-service applies business rules.
     */
    opd_policies: z
      .union([
        z.record(z.string(), z.any()),
        z.null(),
      ])
      .optional(),
    /** RBH-09: Pause Instagram DM + comment automation */
    instagram_receptionist_paused: z.boolean().optional(),
    instagram_receptionist_pause_message: z.string().max(500).trim().nullable().optional(),
    /**
     * Plan 03 · Task 08: how the doctor charges. `null` clears the field
     * (only meaningful for doctors who haven't picked yet). Unknown values
     * fail strict parsing. Task 09 hooks into the service layer to react to
     * this transition; this schema is strictly shape-validation.
     */
    catalog_mode: z.enum(CATALOG_MODES).nullable().optional(),
    /**
     * pf-09 (migration 098): post-wrap-up routing preference.
     * Vocab mirrors the DB CHECK constraint exactly.
     */
    patient_flow_advance: z.enum(PATIENT_FLOW_ADVANCE_VALUES).optional(),
    /**
     * pf-09 (migration 098): opt-in auto-no-show timer (minutes). `null` clears
     * the timer (= off). Range mirrors the DB CHECK constraint exactly.
     */
    auto_no_show_after_min: z
      .number()
      .int()
      .min(AUTO_NO_SHOW_AFTER_MIN_MIN)
      .max(AUTO_NO_SHOW_AFTER_MIN_MAX)
      .nullable()
      .optional(),
    /**
     * R-MOD-full (migration 106): global cockpit template pin. `null` clears
     * the override (= auto-select). Vocab mirrors the DB CHECK constraint.
     */
    cockpit_template_override: z
      .enum(COCKPIT_TEMPLATE_OVERRIDE_VALUES)
      .nullable()
      .optional(),
  })
  .strict();

export type PatchDoctorSettingsBody = z.infer<typeof patchDoctorSettingsSchema>;

export function validatePatchDoctorSettings(body: unknown): PatchDoctorSettingsBody {
  const result = patchDoctorSettingsSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Availability PUT (e-task-3)
// ============================================================================

const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function parseTimeToMinutes(t: string): number {
  const parts = t.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  const s = parseInt(parts[2] || '0', 10);
  return h * 3600 + m * 60 + s;
}

export const putAvailabilitySchema = z.object({
  slots: z.array(
    z
      .object({
        day_of_week: z.number().int().min(0).max(6, 'day_of_week must be 0-6 (Sunday-Saturday)'),
        start_time: z
          .string()
          .regex(TIME_REGEX, 'start_time must be HH:MM or HH:MM:SS'),
        end_time: z
          .string()
          .regex(TIME_REGEX, 'end_time must be HH:MM or HH:MM:SS'),
      })
      .refine(
        (s) => parseTimeToMinutes(s.start_time) < parseTimeToMinutes(s.end_time),
        'start_time must be before end_time'
      )
  ),
});

export type PutAvailabilityBody = z.infer<typeof putAvailabilitySchema>;

export function validatePutAvailability(body: unknown): PutAvailabilityBody {
  const result = putAvailabilitySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Blocked Times (e-task-3)
// ============================================================================

export const postBlockedTimeSchema = z
  .object({
    start_time: z.string().datetime({ message: 'start_time must be ISO 8601 datetime' }),
    end_time: z.string().datetime({ message: 'end_time must be ISO 8601 datetime' }),
    reason: z.string().max(500).trim().optional(),
  })
  .refine((s) => new Date(s.start_time) < new Date(s.end_time), 'start_time must be before end_time');

export type PostBlockedTimeBody = z.infer<typeof postBlockedTimeSchema>;

export function validatePostBlockedTime(body: unknown): PostBlockedTimeBody {
  const result = postBlockedTimeSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const getBlockedTimesQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD')
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD')
    .optional(),
});

export type GetBlockedTimesQuery = z.infer<typeof getBlockedTimesQuerySchema>;

export function validateGetBlockedTimesQuery(
  query: Record<string, string | string[] | undefined>
): GetBlockedTimesQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = getBlockedTimesQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query';
    throw new ValidationError(message);
  }
  return result.data;
}

export const deleteBlockedTimeParamsSchema = z.object({
  id: z.string().uuid('Invalid blocked time ID'),
});

export type DeleteBlockedTimeParams = z.infer<typeof deleteBlockedTimeParamsSchema>;

export function validateDeleteBlockedTimeParams(params: unknown): DeleteBlockedTimeParams {
  const result = deleteBlockedTimeParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid blocked time ID';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Prescription Schemas (Prescription V1)
// ============================================================================

const PRESCRIPTION_CC_MAX = 500;
const PRESCRIPTION_HOPI_MAX = 2000;
const PRESCRIPTION_DIAGNOSIS_MAX = 500;
const PRESCRIPTION_FIELD_MAX = 1000;
const PRESCRIPTION_SOAP_TEXT_MAX = 5000;
const PRESCRIPTION_MEDICINE_NAME_MAX = 200;
const PRESCRIPTION_MEDICINE_FIELD_MAX = 100;

// cockpit-v2 / migration 103 — structured SOAP field ranges mirror DB CHECKs.
const FOLLOW_UP_UNIT_VALUES = ['days', 'weeks', 'months', 'as_needed'] as const;

const structuredSoapFieldsSchema = {
  vitalsBpSystolic: z.number().int().min(30).max(300).optional().nullable(),
  vitalsBpDiastolic: z.number().int().min(20).max(200).optional().nullable(),
  vitalsHr: z.number().int().min(20).max(250).optional().nullable(),
  vitalsTempC: z.number().min(30).max(45).optional().nullable(),
  vitalsSpo2: z.number().int().min(0).max(100).optional().nullable(),
  vitalsWtKg: z.number().min(0.5).max(500).optional().nullable(),
  vitalsHtCm: z.number().min(20).max(250).optional().nullable(),
  examinationFindings: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
  differentialDiagnosis: z
    .array(z.string().trim().min(1).max(200))
    .max(20)
    .optional()
    .nullable(),
  advice: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
  followUpValue: z.number().int().min(0).max(3650).optional().nullable(),
  followUpUnit: z.enum(FOLLOW_UP_UNIT_VALUES).optional().nullable(),
  referral: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
  testResults: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
};

function refineFollowUpPairing<T extends { followUpValue?: number | null; followUpUnit?: string | null }>(
  data: T,
  ctx: z.RefinementCtx
): void {
  const { followUpValue, followUpUnit } = data;
  if (followUpUnit === 'as_needed' && followUpValue != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'followUpValue must be null when followUpUnit is as_needed',
      path: ['followUpValue'],
    });
  }
  if (followUpValue != null && followUpUnit == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'followUpUnit is required when followUpValue is set',
      path: ['followUpUnit'],
    });
  }
  if (
    followUpUnit != null &&
    followUpUnit !== 'as_needed' &&
    followUpValue == null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'followUpValue is required for days, weeks, or months',
      path: ['followUpValue'],
    });
  }
}

/** Prefer `investigationsOrders` over legacy `investigations` when both are sent. */
function resolveInvestigationsField<T extends {
  investigations?: string | null;
  investigationsOrders?: string | null;
}>(data: T): Omit<T, 'investigationsOrders'> {
  const resolved =
    data.investigationsOrders !== undefined
      ? data.investigationsOrders
      : data.investigations;
  const { investigationsOrders: _drop, investigations: _legacy, ...rest } = data;
  return {
    ...rest,
    investigations: resolved,
  } as Omit<T, 'investigationsOrders'>;
}

// EHR Sub-batch B1 / T2.9 — structured-column enums. Mirror migration
// 090's CHECK constraints exactly. If the DB enum vocabulary changes,
// update both files in lockstep.
const FREQUENCY_CODE_VALUES = ['OD', 'BID', 'TID', 'QID', 'QHS', 'PRN', 'STAT', 'CUSTOM'] as const;
const DURATION_UNIT_VALUES = ['days', 'weeks', 'months', 'until-finished', 'continue'] as const;
const ROUTE_CODE_VALUES = [
  'oral',
  'IV',
  'IM',
  'SC',
  'topical',
  'inhaled',
  'rectal',
  'nasal',
  'sublingual',
  'other',
] as const;

const prescriptionMedicineSchema = z.object({
  medicineName: z.string().min(1).max(PRESCRIPTION_MEDICINE_NAME_MAX).trim(),
  dosage: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  route: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  frequency: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  duration: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  instructions: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  // EHR Sub-batch B1 / T2.9 — additive structured fields. All optional
  // and nullable so legacy callers (older app versions) still validate.
  drugMasterId: z.string().uuid().optional().nullable(),
  frequencyCode: z.enum(FREQUENCY_CODE_VALUES).optional().nullable(),
  durationValue: z.number().int().positive().optional().nullable(),
  durationUnit: z.enum(DURATION_UNIT_VALUES).optional().nullable(),
  routeCode: z.enum(ROUTE_CODE_VALUES).optional().nullable(),
});

export const createPrescriptionBodySchema = z
  .object({
    appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
    patientId: z.string().uuid().nullable().optional(),
    type: z.enum(['structured', 'photo', 'both']),
    cc: z.string().max(PRESCRIPTION_CC_MAX).trim().optional().nullable(),
    hopi: z.string().max(PRESCRIPTION_HOPI_MAX).trim().optional().nullable(),
    provisionalDiagnosis: z.string().max(PRESCRIPTION_DIAGNOSIS_MAX).trim().optional().nullable(),
    investigations: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    investigationsOrders: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    clinicalNotes: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
    medicines: z.array(prescriptionMedicineSchema).optional(),
    ...structuredSoapFieldsSchema,
  })
  .superRefine(refineFollowUpPairing)
  .transform(resolveInvestigationsField);

export type CreatePrescriptionBody = z.infer<typeof createPrescriptionBodySchema>;

export function validateCreatePrescriptionBody(body: unknown): CreatePrescriptionBody {
  const result = createPrescriptionBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const updatePrescriptionBodySchema = z
  .object({
    cc: z.string().max(PRESCRIPTION_CC_MAX).trim().optional().nullable(),
    hopi: z.string().max(PRESCRIPTION_HOPI_MAX).trim().optional().nullable(),
    provisionalDiagnosis: z.string().max(PRESCRIPTION_DIAGNOSIS_MAX).trim().optional().nullable(),
    investigations: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    investigationsOrders: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    clinicalNotes: z.string().max(PRESCRIPTION_SOAP_TEXT_MAX).trim().optional().nullable(),
    medicines: z.array(prescriptionMedicineSchema).optional(),
    ...structuredSoapFieldsSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required')
  .superRefine(refineFollowUpPairing)
  .transform(resolveInvestigationsField);

export type UpdatePrescriptionBody = z.infer<typeof updatePrescriptionBodySchema>;

export function validateUpdatePrescriptionBody(body: unknown): UpdatePrescriptionBody {
  const result = updatePrescriptionBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// EHR Sub-batch B1 / T2.11 — Doctor Rx Templates validators
// ============================================================================
//
// Templates carry the same free-text Rx fields as a prescription plus a
// JSONB `medicines` payload that mirrors `MedicineInput` (camelCase).
// We reuse the structured-field length budgets above for parity with
// the live Rx surface.

const RX_TEMPLATE_NAME_MAX = 120;
const RX_TEMPLATE_DESCRIPTION_MAX = 500;

const rxTemplateMedicineSchema = z.object({
  drugMasterId: z.string().uuid().optional().nullable(),
  medicineName: z.string().min(1).max(PRESCRIPTION_MEDICINE_NAME_MAX).trim(),
  dosage: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  route: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  frequency: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  duration: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  instructions: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  // T2.9 structured enums — same vocab as prescription_medicines
  frequencyCode: z.enum(FREQUENCY_CODE_VALUES).optional().nullable(),
  durationValue: z.number().int().positive().optional().nullable(),
  durationUnit: z.enum(DURATION_UNIT_VALUES).optional().nullable(),
  routeCode: z.enum(ROUTE_CODE_VALUES).optional().nullable(),
});

export const createRxTemplateBodySchema = z.object({
  name: z.string().min(1, 'Template name is required').max(RX_TEMPLATE_NAME_MAX).trim(),
  description: z.string().max(RX_TEMPLATE_DESCRIPTION_MAX).trim().optional().nullable(),
  cc: z.string().max(PRESCRIPTION_CC_MAX).trim().optional().nullable(),
  hopi: z.string().max(PRESCRIPTION_HOPI_MAX).trim().optional().nullable(),
  provisionalDiagnosis: z.string().max(PRESCRIPTION_DIAGNOSIS_MAX).trim().optional().nullable(),
  investigations: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  clinicalNotes: z.string().max(5000).trim().optional().nullable(),
  medicines: z.array(rxTemplateMedicineSchema).optional(),
});

export type CreateRxTemplateBody = z.infer<typeof createRxTemplateBodySchema>;

export function validateCreateRxTemplateBody(body: unknown): CreateRxTemplateBody {
  const result = createRxTemplateBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const updateRxTemplateBodySchema = z
  .object({
    name: z.string().min(1).max(RX_TEMPLATE_NAME_MAX).trim().optional(),
    description: z.string().max(RX_TEMPLATE_DESCRIPTION_MAX).trim().optional().nullable(),
    cc: z.string().max(PRESCRIPTION_CC_MAX).trim().optional().nullable(),
    hopi: z.string().max(PRESCRIPTION_HOPI_MAX).trim().optional().nullable(),
    provisionalDiagnosis: z.string().max(PRESCRIPTION_DIAGNOSIS_MAX).trim().optional().nullable(),
    investigations: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    clinicalNotes: z.string().max(5000).trim().optional().nullable(),
    medicines: z.array(rxTemplateMedicineSchema).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

export type UpdateRxTemplateBody = z.infer<typeof updateRxTemplateBodySchema>;

export function validateUpdateRxTemplateBody(body: unknown): UpdateRxTemplateBody {
  const result = updateRxTemplateBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const rxTemplateParamsSchema = z.object({
  id: z.string().uuid('Invalid template ID'),
});

export type RxTemplateParams = z.infer<typeof rxTemplateParamsSchema>;

export function validateRxTemplateParams(params: unknown): RxTemplateParams {
  const result = rxTemplateParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid template ID';
    throw new ValidationError(message);
  }
  return result.data;
}

export const prescriptionParamsSchema = z.object({
  id: z.string().uuid('Invalid prescription ID'),
});

export type PrescriptionParams = z.infer<typeof prescriptionParamsSchema>;

export function validatePrescriptionParams(params: unknown): PrescriptionParams {
  const result = prescriptionParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid prescription ID';
    throw new ValidationError(message);
  }
  return result.data;
}

export const listPrescriptionsQuerySchema = z
  .object({
    appointmentId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
  })
  .refine((data) => data.appointmentId || data.patientId, 'appointmentId or patientId required');

export type ListPrescriptionsQuery = z.infer<typeof listPrescriptionsQuerySchema>;

export function validateListPrescriptionsQuery(
  query: Record<string, string | string[] | undefined>
): ListPrescriptionsQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = listPrescriptionsQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Prescription Attachment Schemas (Prescription V1 - e-task-3)
// ============================================================================

const ATTACHMENT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const ATTACHMENT_FILENAME_MAX = 200;
const ATTACHMENT_CAPTION_MAX = 500;

export const createUploadUrlBodySchema = z.object({
  filename: z.string().max(ATTACHMENT_FILENAME_MAX).trim().optional().default('file'),
  contentType: z
    .enum(ATTACHMENT_ALLOWED_MIME as unknown as [string, ...string[]])
    .optional()
    .default('image/jpeg'),
});

export type CreateUploadUrlBody = z.infer<typeof createUploadUrlBodySchema>;

export function validateCreateUploadUrlBody(body: unknown): CreateUploadUrlBody {
  const result = createUploadUrlBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const registerAttachmentBodySchema = z.object({
  filePath: z.string().min(1, 'filePath is required').max(500).trim(),
  fileType: z.enum(ATTACHMENT_ALLOWED_MIME as unknown as [string, ...string[]]),
  caption: z.string().max(ATTACHMENT_CAPTION_MAX).trim().optional().nullable(),
});

export type RegisterAttachmentBody = z.infer<typeof registerAttachmentBodySchema>;

export function validateRegisterAttachmentBody(body: unknown): RegisterAttachmentBody {
  const result = registerAttachmentBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid request body';
    throw new ValidationError(message);
  }
  return result.data;
}

export const prescriptionAttachmentParamsSchema = z.object({
  id: z.string().uuid('Invalid prescription ID'),
  attachmentId: z.string().uuid('Invalid attachment ID'),
});

export type PrescriptionAttachmentParams = z.infer<typeof prescriptionAttachmentParamsSchema>;

export function validatePrescriptionAttachmentParams(params: unknown): PrescriptionAttachmentParams {
  const result = prescriptionAttachmentParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid params';
    throw new ValidationError(message);
  }
  return result.data;
}

// ============================================================================
// Patient Chart Context (EHR Sub-batch A / T1.2)
// ============================================================================
// Validators for the three resource groups exposed under
//   /api/v1/patients/:patientId/chart/{allergies,conditions,vitals}
// All three share:
//   - patientId comes from URL params (UUID); validated via
//     patientChartParentParamsSchema in the route handler
//   - id (resource id) on PATCH validated via patientChartChildParamsSchema
//   - bodies are camelCase and minimal (V1: no fancy validation beyond bounds
//     mirroring the migration 087 CHECK constraints)

const PATIENT_CHART_TEXT_MAX = 1000;
const PATIENT_CHART_ALLERGEN_MAX = 200;
const PATIENT_CHART_CONDITION_MAX = 200;

const patientAllergySeveritySchema = z.enum(['mild', 'moderate', 'severe', 'unknown']);

// ---- params ----------------------------------------------------------------

export const patientChartParentParamsSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
});

export type PatientChartParentParams = z.infer<typeof patientChartParentParamsSchema>;

export function validatePatientChartParentParams(params: unknown): PatientChartParentParams {
  const result = patientChartParentParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid patient ID');
  }
  return result.data;
}

export const patientChartChildParamsSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  id: z.string().uuid('Invalid resource ID'),
});

export type PatientChartChildParams = z.infer<typeof patientChartChildParamsSchema>;

export function validatePatientChartChildParams(params: unknown): PatientChartChildParams {
  const result = patientChartChildParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid params');
  }
  return result.data;
}

// ---- allergies -------------------------------------------------------------

export const createPatientAllergyBodySchema = z.object({
  allergen: z.string().min(1, 'allergen is required').max(PATIENT_CHART_ALLERGEN_MAX).trim(),
  severity: patientAllergySeveritySchema.optional().default('unknown'),
  reaction: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
  note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
});

export type CreatePatientAllergyBody = z.infer<typeof createPatientAllergyBodySchema>;

export function validateCreatePatientAllergyBody(body: unknown): CreatePatientAllergyBody {
  const result = createPatientAllergyBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const updatePatientAllergyBodySchema = z
  .object({
    allergen: z.string().min(1).max(PATIENT_CHART_ALLERGEN_MAX).trim().optional(),
    severity: patientAllergySeveritySchema.optional(),
    reaction: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
    note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
    archivedAt: z.union([z.string().datetime({ offset: true }), z.literal('now'), z.null()]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

export type UpdatePatientAllergyBody = z.infer<typeof updatePatientAllergyBodySchema>;

export function validateUpdatePatientAllergyBody(body: unknown): UpdatePatientAllergyBody {
  const result = updatePatientAllergyBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

// ---- chronic conditions ----------------------------------------------------

const isoDateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
const diagnosedOnSchema = z
  .string()
  .refine((s) => isoDateOnlyRegex.test(s), 'diagnosedOn must be ISO date YYYY-MM-DD')
  .nullable()
  .optional();

export const createPatientConditionBodySchema = z.object({
  condition: z.string().min(1, 'condition is required').max(PATIENT_CHART_CONDITION_MAX).trim(),
  diagnosedOn: diagnosedOnSchema,
  note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
});

export type CreatePatientConditionBody = z.infer<typeof createPatientConditionBodySchema>;

export function validateCreatePatientConditionBody(body: unknown): CreatePatientConditionBody {
  const result = createPatientConditionBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const updatePatientConditionBodySchema = z
  .object({
    condition: z.string().min(1).max(PATIENT_CHART_CONDITION_MAX).trim().optional(),
    diagnosedOn: diagnosedOnSchema,
    note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
    archivedAt: z.union([z.string().datetime({ offset: true }), z.literal('now'), z.null()]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

export type UpdatePatientConditionBody = z.infer<typeof updatePatientConditionBodySchema>;

export function validateUpdatePatientConditionBody(body: unknown): UpdatePatientConditionBody {
  const result = updatePatientConditionBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

// ---- vitals ----------------------------------------------------------------
// Bounds mirror the CHECK constraints in migration 087. The DB is the second
// line of defense; this is the first.

const intInRange = (min: number, max: number, label: string) =>
  z
    .number()
    .int(`${label} must be an integer`)
    .min(min, `${label} must be >= ${min}`)
    .max(max, `${label} must be <= ${max}`)
    .nullable()
    .optional();

const numInRange = (min: number, max: number, label: string) =>
  z
    .number()
    .min(min, `${label} must be >= ${min}`)
    .max(max, `${label} must be <= ${max}`)
    .nullable()
    .optional();

export const createPatientVitalsBodySchema = z.object({
  appointmentId: z.string().uuid().nullable().optional(),
  bpSystolic: intInRange(40, 300, 'bpSystolic'),
  bpDiastolic: intInRange(20, 200, 'bpDiastolic'),
  heartRate: intInRange(20, 250, 'heartRate'),
  temperatureC: numInRange(30, 45, 'temperatureC'),
  spo2: intInRange(50, 100, 'spo2'),
  weightKg: numInRange(0, 500, 'weightKg'),
  heightCm: numInRange(0, 300, 'heightCm'),
  bmi: numInRange(0, 200, 'bmi'),
  note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
  recordedAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export type CreatePatientVitalsBody = z.infer<typeof createPatientVitalsBodySchema>;

export function validateCreatePatientVitalsBody(body: unknown): CreatePatientVitalsBody {
  const result = createPatientVitalsBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const updatePatientVitalsBodySchema = z
  .object({
    appointmentId: z.string().uuid().nullable().optional(),
    bpSystolic: intInRange(40, 300, 'bpSystolic'),
    bpDiastolic: intInRange(20, 200, 'bpDiastolic'),
    heartRate: intInRange(20, 250, 'heartRate'),
    temperatureC: numInRange(30, 45, 'temperatureC'),
    spo2: intInRange(50, 100, 'spo2'),
    weightKg: numInRange(0, 500, 'weightKg'),
    heightCm: numInRange(0, 300, 'heightCm'),
    bmi: numInRange(0, 200, 'bmi'),
    note: z.string().max(PATIENT_CHART_TEXT_MAX).trim().optional().nullable(),
    recordedAt: z.string().datetime({ offset: true }).optional().nullable(),
    archivedAt: z.union([z.string().datetime({ offset: true }), z.literal('now'), z.null()]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

export type UpdatePatientVitalsBody = z.infer<typeof updatePatientVitalsBodySchema>;

export function validateUpdatePatientVitalsBody(body: unknown): UpdatePatientVitalsBody {
  const result = updatePatientVitalsBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

// ============================================================================
// Service staff review (ARM-06)
// ============================================================================

const SERVICE_STAFF_REVIEW_NOTE_MAX = 2000;

/** List inbox: `cancelled` = both staff-cancelled and SLA timeout rows. */
export const listServiceStaffReviewsQueryStatusSchema = z.enum([
  'pending',
  'confirmed',
  'reassigned',
  'cancelled_by_staff',
  'cancelled_timeout',
  'cancelled',
]);

export const listServiceStaffReviewsQuerySchema = z.object({
  status: listServiceStaffReviewsQueryStatusSchema.optional().default('pending'),
});

export type ListServiceStaffReviewsQuery = z.infer<typeof listServiceStaffReviewsQuerySchema>;

export function validateListServiceStaffReviewsQuery(
  query: Record<string, string | string[] | undefined>
): ListServiceStaffReviewsQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = listServiceStaffReviewsQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid query');
  }
  return result.data;
}

export const serviceStaffReviewIdParamsSchema = z.object({
  id: z.string().uuid('Invalid review ID'),
});

export type ServiceStaffReviewIdParams = z.infer<typeof serviceStaffReviewIdParamsSchema>;

export function validateServiceStaffReviewIdParams(params: unknown): ServiceStaffReviewIdParams {
  const result = serviceStaffReviewIdParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid review ID');
  }
  return result.data;
}

const serviceStaffResolutionNoteSchema = z
  .string()
  .max(SERVICE_STAFF_REVIEW_NOTE_MAX)
  .trim()
  .optional();

export const confirmServiceStaffReviewBodySchema = z
  .object({
    note: serviceStaffResolutionNoteSchema,
  })
  .strict();

export type ConfirmServiceStaffReviewBody = z.infer<typeof confirmServiceStaffReviewBodySchema>;

export function validateConfirmServiceStaffReviewBody(body: unknown): ConfirmServiceStaffReviewBody {
  const result = confirmServiceStaffReviewBodySchema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

/**
 * Append-patch shape for doctor catalog `matcher_hints`. All fields are optional; empty
 * / whitespace-only fields are treated as "no change". Unlike the old replace payload,
 * this never clears existing hints — it only appends (semicolon-separated, schema-capped
 * server-side via `appendMatcherHintFields`). Plan 01 / Task 03.
 */
const reassignMatcherHintAppendSchema = z
  .object({
    keywords: z.string().max(400).optional(),
    include_when: z.string().max(800).optional(),
    exclude_when: z.string().max(800).optional(),
  })
  .strict();

export const reassignServiceStaffReviewBodySchema = z
  .object({
    catalogServiceKey: z.string().min(1).max(64).trim(),
    catalogServiceId: z.string().uuid().optional(),
    consultationModality: z.enum(['text', 'voice', 'video']).optional(),
    /**
     * Fragments to APPEND to the reassigned-TO service's matcher hints. Optional;
     * omit (or send all-empty fields) to skip hint learning on the destination service.
     */
    correctServiceHintAppend: reassignMatcherHintAppendSchema.optional(),
    /**
     * Fragments to APPEND to the reassigned-FROM service's matcher hints. Typically an
     * `exclude_when` signal saying "this patient's reason should NOT route here". Optional.
     */
    wrongServiceHintAppend: reassignMatcherHintAppendSchema.optional(),
  })
  .strict();

export type ReassignServiceStaffReviewBody = z.infer<typeof reassignServiceStaffReviewBodySchema>;

export function validateReassignServiceStaffReviewBody(body: unknown): ReassignServiceStaffReviewBody {
  const result = reassignServiceStaffReviewBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const cancelServiceStaffReviewBodySchema = z
  .object({
    note: serviceStaffResolutionNoteSchema,
  })
  .strict();

export type CancelServiceStaffReviewBody = z.infer<typeof cancelServiceStaffReviewBodySchema>;

export function validateCancelServiceStaffReviewBody(body: unknown): CancelServiceStaffReviewBody {
  const result = cancelServiceStaffReviewBodySchema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

// --- learn-04: service match learning policy suggestions ---

export const policySuggestionIdParamsSchema = z.object({
  id: z.string().uuid('Invalid suggestion ID'),
});

export type PolicySuggestionIdParams = z.infer<typeof policySuggestionIdParamsSchema>;

export function validatePolicySuggestionIdParams(params: unknown): PolicySuggestionIdParams {
  const result = policySuggestionIdParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid suggestion ID');
  }
  return result.data;
}

const listPolicySuggestionsQuerySchema = z.object({
  status: z.enum(['pending', 'declined', 'accepted', 'snoozed', 'superseded', 'all']).optional(),
});

export type ListPolicySuggestionsQuery = z.infer<typeof listPolicySuggestionsQuerySchema>;

export function validateListPolicySuggestionsQuery(
  query: Record<string, string | string[] | undefined>
): ListPolicySuggestionsQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = listPolicySuggestionsQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid query');
  }
  return result.data;
}

const listAutobookPoliciesQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).optional(),
});

export type ListAutobookPoliciesQuery = z.infer<typeof listAutobookPoliciesQuerySchema>;

export function validateListAutobookPoliciesQuery(
  query: Record<string, string | string[] | undefined>
): ListAutobookPoliciesQuery {
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }
  const result = listAutobookPoliciesQuerySchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid query');
  }
  return result.data;
}

export const snoozePolicySuggestionBodySchema = z
  .object({
    snoozeDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

export type SnoozePolicySuggestionBody = z.infer<typeof snoozePolicySuggestionBodySchema>;

export function validateSnoozePolicySuggestionBody(body: unknown): SnoozePolicySuggestionBody {
  const result = snoozePolicySuggestionBodySchema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const autobookPolicyIdParamsSchema = z.object({
  id: z.string().uuid('Invalid autobook policy ID'),
});

export type AutobookPolicyIdParams = z.infer<typeof autobookPolicyIdParamsSchema>;

export function validateAutobookPolicyIdParams(params: unknown): AutobookPolicyIdParams {
  const result = autobookPolicyIdParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid policy ID');
  }
  return result.data;
}

// ============================================================================
// OPD mode_schedule (pdm-07 / DL-9)
// ============================================================================

export function validateModeSchedule(
  input: unknown
): { ok: true; value: ModeSchedule } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'mode_schedule must be an object' };
  }
  const obj = input as Record<string, unknown>;

  if (obj.default_mode !== undefined && obj.default_mode !== 'slot' && obj.default_mode !== 'queue') {
    return { ok: false, error: 'default_mode must be "slot" or "queue"' };
  }

  if (obj.weekly_overrides !== undefined) {
    if (typeof obj.weekly_overrides !== 'object' || Array.isArray(obj.weekly_overrides)) {
      return { ok: false, error: 'weekly_overrides must be an object' };
    }
    const wd = obj.weekly_overrides as Record<string, unknown>;
    for (const key of Object.keys(wd)) {
      if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(key)) {
        return { ok: false, error: `weekly_overrides has unknown key: ${key}` };
      }
      if (wd[key] !== 'slot' && wd[key] !== 'queue') {
        return { ok: false, error: `weekly_overrides[${key}] must be "slot" or "queue"` };
      }
    }
  }

  if (obj.date_range_overrides !== undefined) {
    if (!Array.isArray(obj.date_range_overrides)) {
      return { ok: false, error: 'date_range_overrides must be an array' };
    }
    for (let i = 0; i < obj.date_range_overrides.length; i += 1) {
      const r = obj.date_range_overrides[i] as Record<string, unknown>;
      if (typeof r.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.from)) {
        return { ok: false, error: `date_range_overrides[${i}].from must be YYYY-MM-DD` };
      }
      if (typeof r.to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) {
        return {
          ok: false,
          error: `date_range_overrides[${i}].to is required (DL-9: no open-ended ranges; use default_mode for forever-from-X)`,
        };
      }
      if (r.from > r.to) {
        return { ok: false, error: `date_range_overrides[${i}].from > .to` };
      }
      if (r.mode !== 'slot' && r.mode !== 'queue') {
        return { ok: false, error: `date_range_overrides[${i}].mode must be "slot" or "queue"` };
      }
    }
  }

  if (obj.date_overrides !== undefined) {
    if (!Array.isArray(obj.date_overrides)) {
      return { ok: false, error: 'date_overrides must be an array' };
    }
    for (let i = 0; i < obj.date_overrides.length; i += 1) {
      const d = obj.date_overrides[i] as Record<string, unknown>;
      if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
        return { ok: false, error: `date_overrides[${i}].date must be YYYY-MM-DD` };
      }
      if (d.mode !== 'slot' && d.mode !== 'queue') {
        return { ok: false, error: `date_overrides[${i}].mode must be "slot" or "queue"` };
      }
    }
  }

  return { ok: true, value: obj as ModeSchedule };
}

// ============================================================================
// Patients list query (pr-02 / DL-4)
// ============================================================================

/** 400 with stable `error.code` for patients list query validation. */
export class PatientListQueryError extends ValidationError {
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
  }
}

export function validateOptionalString(
  value: unknown,
  options: { maxLength: number }
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new PatientListQueryError('invalid_query', 'Query parameter must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > options.maxLength) {
    throw new PatientListQueryError(
      'query_too_long',
      `Query parameter must be at most ${options.maxLength} characters`
    );
  }
  return trimmed;
}

export function validateOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  errorCode: string
): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new PatientListQueryError(errorCode, 'Query parameter must be a string');
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new PatientListQueryError(errorCode, `Invalid value: ${value}`);
  }
  return value as T;
}

export function validateOptionalIntegerInRange(
  value: unknown,
  options: { min: number; max: number; default: number }
): number {
  if (value === undefined || value === null || value === '') {
    return options.default;
  }
  const raw = typeof value === 'string' ? value.trim() : String(value);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || String(n) !== raw) {
    throw new PatientListQueryError('invalid_query', 'Query parameter must be an integer');
  }
  if (n < options.min || n > options.max) {
    if (options.max === 200 && n > 200) {
      throw new PatientListQueryError('page_size_too_large', 'pageSize must be at most 200');
    }
    throw new PatientListQueryError(
      'invalid_query',
      `Query parameter must be between ${options.min} and ${options.max}`
    );
  }
  return n;
}

export function hasPatientListQueryParams(
  query: Record<string, string | string[] | undefined>
): boolean {
  return (
    query.q !== undefined ||
    query.segment !== undefined ||
    query.sort !== undefined ||
    query.page !== undefined ||
    query.pageSize !== undefined
  );
}

export function validatePatientListQuery(
  query: Record<string, string | string[] | undefined>
): PatientListFilters {
  const pick = (key: string): string | undefined => {
    const v = query[key];
    return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  };

  const segment = validateOptionalEnum<PatientSegmentId>(
    pick('segment'),
    PATIENT_SEGMENT_IDS,
    'invalid_segment'
  );

  if (segment === 'at-risk-followup' && !PRESCRIPTION_FOLLOW_UP_VALUE_SUPPORTED) {
    throw new PatientListQueryError(
      'segment_unsupported_on_current_schema',
      'The at-risk-followup segment requires follow_up_value on prescriptions'
    );
  }

  return {
    q: validateOptionalString(pick('q'), { maxLength: 100 }),
    segment,
    sort: validateOptionalEnum<PatientListSortId>(
      pick('sort'),
      PATIENT_LIST_SORT_IDS,
      'invalid_sort'
    ),
    page: validateOptionalIntegerInRange(pick('page'), { min: 1, max: 10_000, default: 1 }),
    pageSize: validateOptionalIntegerInRange(pick('pageSize'), {
      min: 1,
      max: 200,
      default: 50,
    }),
  };
}

const bulkTagPatientsBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  tag: z.string().max(64).nullable(),
});

export type BulkTagPatientsBody = z.infer<typeof bulkTagPatientsBodySchema>;

export function validateBulkTagPatientsBody(body: unknown): BulkTagPatientsBody {
  const result = bulkTagPatientsBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid bulk-tag body');
  }
  return result.data;
}

// rx-polish-favorites · rxf-04 — MedicineRowValue-shaped favorite template
const DOCTOR_DRUG_FAVORITE_NAME_MAX = 60;

export const medicineRowValueSchema = z.object({
  medicineName: z.string().min(1).max(PRESCRIPTION_MEDICINE_NAME_MAX).trim(),
  dosage: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim(),
  route: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim(),
  frequency: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim(),
  duration: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim(),
  instructions: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim(),
  drugMasterId: z.string().uuid().nullable(),
  frequencyCode: z.enum(FREQUENCY_CODE_VALUES).nullable(),
  durationValue: z.number().int().positive().nullable(),
  durationUnit: z.enum(DURATION_UNIT_VALUES).nullable(),
  routeCode: z.enum(ROUTE_CODE_VALUES).nullable(),
});

export const createDoctorDrugFavoriteBodySchema = z.object({
  name: z
    .string()
    .min(1, 'Favorite name is required')
    .max(DOCTOR_DRUG_FAVORITE_NAME_MAX)
    .trim(),
  template: medicineRowValueSchema,
});

export type CreateDoctorDrugFavoriteBody = z.infer<typeof createDoctorDrugFavoriteBodySchema>;

export function validateCreateDoctorDrugFavoriteBody(
  body: unknown,
): CreateDoctorDrugFavoriteBody {
  const result = createDoctorDrugFavoriteBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const updateDoctorDrugFavoriteBodySchema = z
  .object({
    name: z.string().min(1).max(DOCTOR_DRUG_FAVORITE_NAME_MAX).trim().optional(),
    template: medicineRowValueSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

export type UpdateDoctorDrugFavoriteBody = z.infer<typeof updateDoctorDrugFavoriteBodySchema>;

export function validateUpdateDoctorDrugFavoriteBody(
  body: unknown,
): UpdateDoctorDrugFavoriteBody {
  const result = updateDoctorDrugFavoriteBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const doctorDrugFavoriteParamsSchema = z.object({
  id: z.string().uuid('Invalid favorite ID'),
});

export type DoctorDrugFavoriteParams = z.infer<typeof doctorDrugFavoriteParamsSchema>;

export function validateDoctorDrugFavoriteParams(
  params: unknown,
): DoctorDrugFavoriteParams {
  const result = doctorDrugFavoriteParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid favorite ID');
  }
  return result.data;
}

// =============================================================================
// Web Push subscriptions (task-text-D6b)
// =============================================================================

export const pushSubscribeBodySchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL').min(1),
  p256dhKey: z.string().min(1, 'p256dhKey is required'),
  authKey: z.string().min(1, 'authKey is required'),
  userAgent: z.string().max(512).optional(),
});

export type PushSubscribeBody = z.infer<typeof pushSubscribeBodySchema>;

export function validatePushSubscribeBody(body: unknown): PushSubscribeBody {
  const result = pushSubscribeBodySchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid request body');
  }
  return result.data;
}

export const pushSubscriptionParamsSchema = z.object({
  id: z.string().uuid('Invalid subscription ID'),
});

export type PushSubscriptionParams = z.infer<typeof pushSubscriptionParamsSchema>;

export function validatePushSubscriptionParams(params: unknown): PushSubscriptionParams {
  const result = pushSubscriptionParamsSchema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Invalid subscription ID');
  }
  return result.data;
}
