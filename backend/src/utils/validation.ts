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
    freeOfCost: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      if (data.patientId) return true;
      return !!data.patientName && !!data.patientPhone;
    },
    { message: 'Either patientId or both patientName and patientPhone are required for walk-in' }
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

export const opdQueueSessionQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export type OpdQueueSessionQuery = z.infer<typeof opdQueueSessionQuerySchema>;

export function validateOpdQueueSessionQuery(
  query: Record<string, string | undefined>
): OpdQueueSessionQuery {
  const result = opdQueueSessionQuerySchema.safeParse(query);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid query parameters';
    throw new ValidationError(message);
  }
  return result.data;
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
const PRESCRIPTION_MEDICINE_NAME_MAX = 200;
const PRESCRIPTION_MEDICINE_FIELD_MAX = 100;

const prescriptionMedicineSchema = z.object({
  medicineName: z.string().min(1).max(PRESCRIPTION_MEDICINE_NAME_MAX).trim(),
  dosage: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  route: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  frequency: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  duration: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  instructions: z.string().max(PRESCRIPTION_MEDICINE_FIELD_MAX).trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createPrescriptionBodySchema = z.object({
  appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
  patientId: z.string().uuid().nullable().optional(),
  type: z.enum(['structured', 'photo', 'both']),
  cc: z.string().max(PRESCRIPTION_CC_MAX).trim().optional().nullable(),
  hopi: z.string().max(PRESCRIPTION_HOPI_MAX).trim().optional().nullable(),
  provisionalDiagnosis: z.string().max(PRESCRIPTION_DIAGNOSIS_MAX).trim().optional().nullable(),
  investigations: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
  clinicalNotes: z.string().max(5000).trim().optional().nullable(),
  medicines: z.array(prescriptionMedicineSchema).optional(),
});

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
    followUp: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    patientEducation: z.string().max(PRESCRIPTION_FIELD_MAX).trim().optional().nullable(),
    clinicalNotes: z.string().max(5000).trim().optional().nullable(),
    medicines: z.array(prescriptionMedicineSchema).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field required');

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

/** Same shape as practice catalog `matcher_hints` (replace on reassign). */
const reassignMatcherHintsSchema = z
  .object({
    keywords: z.string().max(400),
    include_when: z.string().max(800),
    exclude_when: z.string().max(800),
  })
  .strict();

export const reassignServiceStaffReviewBodySchema = z
  .object({
    catalogServiceKey: z.string().min(1).max(64).trim(),
    catalogServiceId: z.string().uuid().optional(),
    consultationModality: z.enum(['text', 'voice', 'video']).optional(),
    matcherHints: reassignMatcherHintsSchema,
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
