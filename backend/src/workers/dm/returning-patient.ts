/**
 * rcp-20: Returning-patient profile read seam (dormant scaffold).
 * Channel-free; doctor-scoped visit history via listAppointmentsForPatient only.
 */

import { env } from '../../config/env';
import { listAppointmentsForPatient } from '../../services/appointment-service';
import { findPatientByIdWithAdmin } from '../../services/patient-service';
import type { Appointment, AppointmentStatus, Patient } from '../../types/database';
import type {
  ReturningPatientProfile,
  ReturningRecencyBucket,
} from '../../types/returning-patient';
import type { PatientCollectionField } from '../../utils/validation';
import {
  isPlaceholderPatientName,
  isPlaceholderPatientPhone,
} from '../../utils/patient-placeholder';

export { isPlaceholderPatientName, isPlaceholderPatientPhone };

export interface LoadReturningPatientProfileInput {
  doctorId: string;
  patientId: string;
  correlationId: string;
}

const ATTENDED_STATUSES: ReadonlySet<AppointmentStatus> = new Set(['completed', 'confirmed']);

const MS_PER_DAY = 86_400_000;

export function emptyReturningPatientProfile(): ReturningPatientProfile {
  return {
    isReturning: false,
    hasGrantedConsent: false,
    consentStatus: 'pending',
    hasName: false,
    hasPhone: false,
    knownFieldKeys: [],
    priorVisits: { attendedCount: 0 },
  };
}

function resolveConsentStatus(
  patient: Patient
): 'pending' | 'granted' | 'revoked' {
  return patient.consent_status ?? 'pending';
}

function buildKnownFieldKeys(patient: Patient, hasName: boolean, hasPhone: boolean): PatientCollectionField[] {
  const keys: PatientCollectionField[] = [];
  if (hasName) keys.push('name');
  if (hasPhone) keys.push('phone');
  if (patient.age != null && patient.age >= 1) keys.push('age');
  if (patient.gender?.trim()) keys.push('gender');
  if (patient.email?.trim()) keys.push('email');
  return keys;
}

function isAttendedVisit(appointment: Appointment, nowMs: number): boolean {
  if (!ATTENDED_STATUSES.has(appointment.status)) return false;
  if (appointment.status === 'completed') return true;
  return new Date(appointment.appointment_date).getTime() <= nowMs;
}

function normalizeModality(
  consultationType: string | null | undefined
): 'video' | 'in_clinic' | 'text' | 'voice' | undefined {
  switch (consultationType) {
    case 'video':
    case 'in_clinic':
    case 'text':
    case 'voice':
      return consultationType;
    default:
      return undefined;
  }
}

export function deriveRecencyBucket(lastVisitAt: string, nowMs: number): ReturningRecencyBucket {
  const daysSince = (nowMs - new Date(lastVisitAt).getTime()) / MS_PER_DAY;
  if (daysSince <= 30) return 'within_1_month';
  if (daysSince <= 90) return 'within_3_months';
  if (daysSince <= 365) return 'within_1_year';
  return 'over_1_year';
}

function derivePriorVisits(
  appointments: Appointment[],
  nowMs: number
): ReturningPatientProfile['priorVisits'] {
  const attended = appointments.filter((appt) => isAttendedVisit(appt, nowMs));
  if (attended.length === 0) {
    return { attendedCount: 0 };
  }

  const lastAttended = attended.reduce((latest, appt) => {
    const ts = new Date(appt.appointment_date).getTime();
    if (!latest || ts > new Date(latest.appointment_date).getTime()) return appt;
    return latest;
  });

  const lastVisitAt = new Date(lastAttended.appointment_date).toISOString();
  const lastServiceKey = lastAttended.catalog_service_key?.trim() || undefined;
  const lastModality = normalizeModality(lastAttended.consultation_type);

  return {
    attendedCount: attended.length,
    lastVisitAt,
    lastServiceKey,
    lastModality,
    recencyBucket: deriveRecencyBucket(lastVisitAt, nowMs),
  };
}

export async function loadReturningPatientProfile(
  input: LoadReturningPatientProfileInput
): Promise<ReturningPatientProfile> {
  if (!env.RETURNING_PATIENT_MEMORY_ENABLED) {
    return emptyReturningPatientProfile();
  }

  const patient = await findPatientByIdWithAdmin(input.patientId, input.correlationId);
  if (!patient) {
    return emptyReturningPatientProfile();
  }

  const hasName = !isPlaceholderPatientName(patient.name);
  const hasPhone = !isPlaceholderPatientPhone(patient.phone);
  const consentStatus = resolveConsentStatus(patient);
  const hasGrantedConsent = consentStatus === 'granted';

  const appointments = await listAppointmentsForPatient(
    input.patientId,
    input.doctorId,
    input.correlationId
  );
  const nowMs = Date.now();
  const priorVisits = derivePriorVisits(appointments, nowMs);

  return {
    isReturning: priorVisits.attendedCount > 0,
    hasGrantedConsent,
    consentStatus,
    hasName,
    hasPhone,
    knownFieldKeys: buildKnownFieldKeys(patient, hasName, hasPhone),
    priorVisits,
  };
}

/** First token of a real patient name — never from metadata; caller reads patients row. */
export function extractPatientFirstName(name: string | null | undefined): string | undefined {
  if (isPlaceholderPatientName(name)) return undefined;
  const first = name!.trim().split(/\s+/)[0];
  return first || undefined;
}

/** PHI-safe structured hint for model tone (opaque keys + enums only). */
export function buildReturningPatientSummary(profile: ReturningPatientProfile): string {
  const parts = [`prior_visits=${profile.priorVisits.attendedCount}`];
  if (profile.priorVisits.lastServiceKey) {
    parts.push(`last_service=[${profile.priorVisits.lastServiceKey}]`);
  }
  if (profile.priorVisits.recencyBucket) {
    parts.push(`recency=[${profile.priorVisits.recencyBucket}]`);
  }
  if (profile.priorVisits.lastServiceKey) {
    parts.push('follow_up_offer_eligible=true');
  }
  return `returning patient: ${parts.join(', ')}`;
}

export function shouldUseReturningPatientMemory(
  profile: ReturningPatientProfile | undefined
): profile is ReturningPatientProfile {
  return env.RETURNING_PATIENT_MEMORY_ENABLED === true &&
    profile?.isReturning === true &&
    profile.hasGrantedConsent === true;
}
