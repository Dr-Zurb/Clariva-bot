/**
 * Patient Collection Service (e-task-4)
 *
 * Field-by-field collection flow: name, phone, DOB (optional), gender (optional), reason_for_visit.
 * Collected values live in memory (keyed by conversation_id); metadata (collectedFields, step) only in DB.
 * No PHI in conversations.metadata (COMPLIANCE C). No persistence to patients table until Task 5 consent.
 */

import type { ConversationState } from '../types/conversation';
import type { PatientCollectionField, CollectedPatientData } from '../utils/validation';
import {
  PATIENT_COLLECTION_FIELDS,
  validatePatientField,
} from '../utils/validation';
import { logPatientDataCollection } from '../utils/audit-logger';

// ============================================================================
// Constants (collection order and required fields)
// ============================================================================

/** Collection order: name → phone → date_of_birth → gender → reason_for_visit */
export const COLLECTION_ORDER = PATIENT_COLLECTION_FIELDS;

/** Required fields before transitioning to consent (Task 5) */
export const REQUIRED_COLLECTION_FIELDS: readonly PatientCollectionField[] = [
  'name',
  'phone',
];

/** Step name for each field (no PHI) */
const STEP_BY_FIELD: Record<PatientCollectionField, string> = {
  name: 'collecting_name',
  phone: 'collecting_phone',
  date_of_birth: 'collecting_date_of_birth',
  gender: 'collecting_gender',
  reason_for_visit: 'collecting_reason_for_visit',
};

/** User-facing labels for validation error messages */
const FIELD_LABELS: Record<PatientCollectionField, string> = {
  name: 'full name',
  phone: 'phone number',
  date_of_birth: 'date of birth',
  gender: 'gender',
  reason_for_visit: 'reason for visit',
};

// ============================================================================
// In-memory store (pre-consent PHI; single-worker). Key = conversation_id.
// ============================================================================

const preConsentStore = new Map<string, CollectedPatientData>();

/** TTL not implemented for in-memory MVP; document Redis + TTL for multi-worker (e-task-4 Notes). */

export function setCollectedData(
  conversationId: string,
  data: Partial<CollectedPatientData>
): void {
  const existing = preConsentStore.get(conversationId) ?? {};
  preConsentStore.set(conversationId, { ...existing, ...data });
}

export function getCollectedData(conversationId: string): CollectedPatientData | null {
  return preConsentStore.get(conversationId) ?? null;
}

export function clearCollectedData(conversationId: string): void {
  preConsentStore.delete(conversationId);
}

// ============================================================================
// Flow logic
// ============================================================================

/**
 * Returns the next field to collect, or null if all required are done (then step = consent).
 */
export function getNextCollectionField(
  collectedFields: string[] = []
): PatientCollectionField | null {
  const set = new Set(collectedFields);
  for (const field of COLLECTION_ORDER) {
    if (!set.has(field)) return field;
  }
  return null;
}

/**
 * Whether all required fields are collected (ready for consent step).
 */
export function hasAllRequiredFields(collectedFields: string[] = []): boolean {
  return REQUIRED_COLLECTION_FIELDS.every((f) => collectedFields.includes(f));
}

/**
 * Parse user message for a given field. Handles "My name is X" or plain "X".
 */
export function parseMessageForField(
  message: string,
  field: PatientCollectionField
): string {
  const trimmed = message.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (field === 'name' && (lower.startsWith('my name is ') || lower.startsWith("i'm ") || lower.startsWith("i am "))) {
    const after = trimmed.replace(/^(my name is |i'm |i am )/i, '').trim();
    return after;
  }
  if (field === 'phone' && lower.startsWith('my phone is ')) {
    return trimmed.replace(/^my phone is /i, '').trim();
  }
  return trimmed;
}

export interface ValidateAndApplyResult {
  success: boolean;
  newState: ConversationState;
  replyOverride?: string;
}

/**
 * Validate value for field, update in-memory store and return new state (metadata only).
 * On success: updates store, returns newState with collectedFields and step.
 * On failure: returns replyOverride (deterministic prompt); no store update.
 * When all required collected, newState.step = 'consent'.
 */
export function validateAndApply(
  conversationId: string,
  field: PatientCollectionField,
  value: string,
  currentState: ConversationState,
  correlationId: string
): ValidateAndApplyResult {
  const collected = currentState.collectedFields ?? [];
  const normalized = parseMessageForField(value, field);
  if (!normalized) {
    return {
      success: false,
      newState: currentState,
      replyOverride: `Please provide your ${FIELD_LABELS[field]}.`,
    };
  }

  try {
    const validated = validatePatientField(field, normalized);
    if (validated === undefined && field !== 'gender') {
      return {
        success: false,
        newState: currentState,
        replyOverride: `Please provide your ${FIELD_LABELS[field]}.`,
      };
    }

    const existing = getCollectedData(conversationId) ?? {};
    const updates: Partial<CollectedPatientData> = {};
    if (field === 'name') updates.name = validated as string;
    if (field === 'phone') updates.phone = validated as string;
    if (field === 'date_of_birth') updates.date_of_birth = validated as string;
    if (field === 'gender') updates.gender = validated;
    if (field === 'reason_for_visit') updates.reason_for_visit = validated as string;
    setCollectedData(conversationId, { ...existing, ...updates });

    const newCollected = [...collected, field];
    const nextField = getNextCollectionField(newCollected);
    const step = nextField ? STEP_BY_FIELD[nextField] : 'consent';

    void logPatientDataCollection({
      correlationId,
      conversationId,
      fieldName: field,
      status: 'collected',
    });

    return {
      success: true,
      newState: {
        ...currentState,
        collectedFields: newCollected,
        step,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch {
    void logPatientDataCollection({
      correlationId,
      conversationId,
      fieldName: field,
      status: 'validation_failed',
    });
    return {
      success: false,
      newState: currentState,
      replyOverride: `Please provide a valid ${FIELD_LABELS[field]}.`,
    };
  }
}

/**
 * Returns step to use when entering collection (e.g. first "book_appointment" message).
 */
export function getInitialCollectionStep(): string {
  return STEP_BY_FIELD[COLLECTION_ORDER[0]];
}
