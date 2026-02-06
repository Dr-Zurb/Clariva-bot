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

// ============================================================================
// Field name type and validation map
// ============================================================================

export const PATIENT_COLLECTION_FIELDS = [
  'name',
  'phone',
  'date_of_birth',
  'gender',
  'reason_for_visit',
] as const;

export type PatientCollectionField = (typeof PATIENT_COLLECTION_FIELDS)[number];

const fieldSchemas: Record<PatientCollectionField, z.ZodType<string | undefined>> = {
  name: patientNameSchema,
  phone: patientPhoneSchema,
  date_of_birth: patientDobSchema,
  gender: patientGenderSchema,
  reason_for_visit: patientReasonForVisitSchema,
};

/**
 * Partial collected patient data (PHI). Used only in memory/Redis until Task 5 consent.
 * Not stored in conversations.metadata.
 */
export interface CollectedPatientData {
  name?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  reason_for_visit?: string;
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
): string | undefined {
  const schema = fieldSchemas[field];
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Invalid value';
    throw new ValidationError(message);
  }
  return result.data as string | undefined;
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

const NOTES_MAX_LEN = 500;

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
  notes: z
    .string()
    .max(NOTES_MAX_LEN, `Notes must be at most ${NOTES_MAX_LEN} characters`)
    .transform((s) => s.trim() || undefined)
    .optional(),
});

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

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
