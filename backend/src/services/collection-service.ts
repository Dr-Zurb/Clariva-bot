/**
 * Patient Collection Service (e-task-4)
 *
 * Field-by-field collection flow: name, phone, DOB (optional), gender (optional), reason_for_visit.
 * Collected values live in Redis (when available) + in-memory fallback; metadata (collectedFields, step) only in DB.
 * No PHI in conversations.metadata (COMPLIANCE C). No persistence to patients table until Task 5 consent.
 *
 * Redis-backed store ensures all workers (multi-instance) can access collected data when consent is processed.
 */

import type { ConversationState } from '../types/conversation';
import type { PatientCollectionField, CollectedPatientData } from '../utils/validation';
import {
  PATIENT_COLLECTION_FIELDS,
  validatePatientField,
} from '../utils/validation';
import { logPatientDataCollection } from '../utils/audit-logger';
import { getWebhookQueue, getQueueConnection, isQueueEnabled } from '../config/queue';

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
  consultation_type: 'collecting_consultation_type',
  date_of_birth: 'collecting_date_of_birth',
  gender: 'collecting_gender',
  reason_for_visit: 'collecting_reason_for_visit',
};

/** User-facing labels for validation error messages */
const FIELD_LABELS: Record<PatientCollectionField, string> = {
  name: 'full name',
  phone: 'phone number',
  consultation_type: 'consultation type (Video or In-clinic)',
  date_of_birth: 'date of birth',
  gender: 'gender',
  reason_for_visit: 'reason for visit',
};

// ============================================================================
// Pre-consent store: Redis (multi-worker) + in-memory fallback
// ============================================================================

const preConsentStore = new Map<string, CollectedPatientData>();
const REDIS_KEY_PREFIX = 'preconsent:';
const PRE_CONSENT_TTL_SEC = 3600; // 1 hour

/** Ensure queue/Redis is initialized (call before getQueueConnection). */
function ensureRedis(): ReturnType<typeof getQueueConnection> {
  if (!isQueueEnabled()) return null;
  getWebhookQueue();
  return getQueueConnection();
}

export async function setCollectedData(
  conversationId: string,
  data: Partial<CollectedPatientData>
): Promise<void> {
  const existing = (await getCollectedData(conversationId)) ?? {};
  const merged = { ...existing, ...data };
  preConsentStore.set(conversationId, merged);

  const conn = ensureRedis();
  if (conn) {
    try {
      const key = REDIS_KEY_PREFIX + conversationId;
      await conn.set(key, JSON.stringify(merged), 'EX', PRE_CONSENT_TTL_SEC);
    } catch {
      // Fail-open: in-memory still has data
    }
  }
}

export async function getCollectedData(conversationId: string): Promise<CollectedPatientData | null> {
  const conn = ensureRedis();
  if (conn) {
    try {
      const key = REDIS_KEY_PREFIX + conversationId;
      const raw = await conn.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as CollectedPatientData;
        preConsentStore.set(conversationId, parsed);
        return parsed;
      }
    } catch {
      // Fall through to in-memory
    }
  }
  return preConsentStore.get(conversationId) ?? null;
}

export async function clearCollectedData(conversationId: string): Promise<void> {
  preConsentStore.delete(conversationId);
  const conn = ensureRedis();
  if (conn) {
    try {
      await conn.del(REDIS_KEY_PREFIX + conversationId);
    } catch {
      // Best-effort
    }
  }
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
  if (field === 'consultation_type') {
    const after = trimmed
      .replace(/^(i'?d?\s+)?(prefer|want|like|choose)\s+/i, '')
      .replace(/\s+(please|thanks|thank you)\.?$/i, '')
      .trim();
    return after || trimmed;
  }
  return trimmed;
}

export interface ValidateAndApplyResult {
  success: boolean;
  newState: ConversationState;
  replyOverride?: string;
}

/**
 * Validate value for field, update store and return new state (metadata only).
 * On success: updates store, returns newState with collectedFields and step.
 * On failure: returns replyOverride (deterministic prompt); no store update.
 * When all required collected, newState.step = 'consent'.
 */
export async function validateAndApply(
  conversationId: string,
  field: PatientCollectionField,
  value: string,
  currentState: ConversationState,
  correlationId: string
): Promise<ValidateAndApplyResult> {
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

    const existing = (await getCollectedData(conversationId)) ?? {};
    const updates: Partial<CollectedPatientData> = {};
    if (field === 'name') updates.name = validated as string;
    if (field === 'phone') updates.phone = validated as string;
    if (field === 'consultation_type') updates.consultation_type = validated as 'video' | 'in_clinic';
    if (field === 'date_of_birth') updates.date_of_birth = validated as string;
    if (field === 'gender') updates.gender = validated;
    if (field === 'reason_for_visit') updates.reason_for_visit = validated as string;
    await setCollectedData(conversationId, { ...existing, ...updates });

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
