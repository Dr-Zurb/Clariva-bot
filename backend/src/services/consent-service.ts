/**
 * Consent Service (e-task-5)
 *
 * Parses user consent replies, persists patient data after consent granted,
 * and handles consent denied. No PHI in logs; audit metadata only.
 */

import { getCollectedData, clearCollectedData } from './collection-service';
import { updatePatient, findPatientById } from './patient-service';
import type { UpdatePatient } from '../types';
import { logConsentEvent } from '../utils/audit-logger';

export type ConsentParseResult = 'granted' | 'denied' | 'unclear';

/** Keywords that indicate consent granted (case-insensitive) */
const GRANT_KEYWORDS = ['yes', 'yeah', 'yep', 'agree', 'ok', 'okay', 'sure', 'i agree', 'i consent'];

/** Keywords that indicate consent denied (case-insensitive) */
const DENY_KEYWORDS = ['no', 'nope', 'deny', 'decline', 'revoke', 'delete', 'don\'t', 'dont', 'never'];

/**
 * Parse user reply for consent (deterministic keyword matching).
 * Returns granted, denied, or unclear.
 */
export function parseConsentReply(text: string): ConsentParseResult {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return 'unclear';
  const words = trimmed.split(/\s+/);
  const firstWord = words[0];
  const fullLower = trimmed;

  for (const kw of GRANT_KEYWORDS) {
    if (firstWord === kw || fullLower === kw || fullLower.startsWith(kw + ' ') || fullLower.includes(' ' + kw)) {
      return 'granted';
    }
  }
  for (const kw of DENY_KEYWORDS) {
    if (firstWord === kw || fullLower === kw || fullLower.startsWith(kw + ' ') || fullLower.includes(' ' + kw)) {
      return 'denied';
    }
  }
  return 'unclear';
}

/**
 * Persist collected patient data to database after consent granted.
 * Updates placeholder patient with name, phone, date_of_birth, gender.
 * reason_for_visit is not a patients column—omitted here; hold for appointment.notes at booking.
 * Calls clearCollectedData after persist. Idempotent: safe to call multiple times.
 *
 * @returns Reply text to send to user
 */
export async function persistPatientAfterConsent(
  conversationId: string,
  patientId: string,
  consentMethod: string,
  correlationId: string
): Promise<string> {
  const collected = getCollectedData(conversationId);
  if (!collected || (!collected.name && !collected.phone)) {
    clearCollectedData(conversationId);
    return "I didn't receive your information. Please start over with 'book appointment' if you'd like to schedule.";
  }

  const name = collected.name ?? 'Unknown';
  const phone = collected.phone ?? '';
  if (!phone) {
    clearCollectedData(conversationId);
    return "We need your phone number to complete registration. Please start over with 'book appointment'.";
  }

  const now = new Date();
  const updateData = {
    name,
    phone,
    consent_status: 'granted' as const,
    consent_granted_at: now,
    consent_method: consentMethod,
    ...(collected.date_of_birth && { date_of_birth: new Date(collected.date_of_birth) }),
    ...(collected.gender && { gender: collected.gender }),
  };

  await updatePatient(patientId, updateData as UpdatePatient, correlationId);

  void logConsentEvent({
    correlationId,
    patientId,
    status: 'granted',
    method: consentMethod,
  });

  clearCollectedData(conversationId);

  return "Thanks! I've saved your details. How can I help you next—would you like to book an appointment or check availability?";
}

/**
 * Handle consent denied: clear pre-consent store, audit, return confirmation message.
 */
export async function handleConsentDenied(
  conversationId: string,
  patientId: string,
  correlationId: string
): Promise<string> {
  clearCollectedData(conversationId);

  void logConsentEvent({
    correlationId,
    patientId,
    status: 'denied',
    method: 'instagram_dm',
  });

  return "No problem. I haven't saved any of your information. Say 'book appointment' anytime if you'd like to try again.";
}

/**
 * Handle consent revocation: update status, anonymize PHI per COMPLIANCE F, audit.
 * Idempotent: safe to call when already revoked.
 *
 * @returns Reply text to send to user
 */
export async function handleRevocation(
  conversationId: string,
  patientId: string,
  correlationId: string
): Promise<string> {
  clearCollectedData(conversationId);

  const patient = await findPatientById(patientId, correlationId);
  if (!patient) {
    return "I couldn't find your record. If you had shared information before, it may already have been removed.";
  }

  if (patient.consent_status === 'revoked') {
    return "Your data has already been removed. Is there anything else I can help with?";
  }

  if (patient.consent_status !== 'granted') {
    return "We don't have any stored personal information to remove. Say 'book appointment' if you'd like to schedule.";
  }

  const now = new Date();
  const anonymizedUpdate = {
    name: '[Anonymized]',
    phone: `revoked-${patientId}`,
    date_of_birth: null as Date | null,
    gender: null as string | null,
    consent_status: 'revoked' as const,
    consent_revoked_at: now,
  };

  await updatePatient(patientId, anonymizedUpdate as UpdatePatient, correlationId);

  void logConsentEvent({
    correlationId,
    patientId,
    status: 'revoked',
    method: 'instagram_dm',
  });

  return "Done. I've removed your personal information from our records. Is there anything else I can help with?";
}
