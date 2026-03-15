/**
 * Patient Collection Service (e-task-4, e-task-2)
 *
 * "All at once" collection flow: name, phone, age, gender, reason_for_visit (required); email (optional).
 * Collected values live in Redis (when available) + in-memory fallback; metadata (collectedFields, step) only in DB.
 * No PHI in conversations.metadata (COMPLIANCE C). No persistence to patients table until Task 5 consent.
 *
 * Redis-backed store ensures all workers (multi-instance) can access collected data when consent is processed.
 */

import type { ConversationState } from '../types/conversation';
import type { PatientCollectionField, CollectedPatientData } from '../utils/validation';
import {
  PATIENT_COLLECTION_FIELDS,
  REQUIRED_COLLECTION_FIELDS,
  validatePatientField,
} from '../utils/validation';
import { logPatientDataCollection } from '../utils/audit-logger';
import { getWebhookQueue, getQueueConnection, isQueueEnabled } from '../config/queue';
import { extractFieldsFromMessage, extractPhoneAndEmail, type ExtractedFields } from '../utils/extract-patient-fields';
import { extractFieldsWithAI, redactPhiForAI, type ExtractionContext } from '../services/ai-service';

// ============================================================================
// Constants (collection order and required fields)
// ============================================================================

/** Collection order: name → phone → age → gender → reason_for_visit → email */
export const COLLECTION_ORDER = PATIENT_COLLECTION_FIELDS;

/** Step name for each field (no PHI) */
const STEP_BY_FIELD: Record<PatientCollectionField, string> = {
  name: 'collecting_name',
  phone: 'collecting_phone',
  age: 'collecting_age',
  gender: 'collecting_gender',
  reason_for_visit: 'collecting_reason_for_visit',
  email: 'collecting_email',
};

/** User-facing labels for validation error messages */
const FIELD_LABELS: Record<PatientCollectionField, string> = {
  name: 'full name',
  phone: 'phone number',
  age: 'age',
  gender: 'gender',
  reason_for_visit: 'reason for visit',
  email: 'email',
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
  if (field === 'age') {
    const ageMatch = trimmed.match(/(?:age|i'?m|i am)\s*:?\s*(\d{1,3})\b/i);
    if (ageMatch) return ageMatch[1];
  }
  if (field === 'email' && lower.startsWith('email')) {
    return trimmed.replace(/^email\s*:?\s*/i, '').trim();
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
    if (field === 'age') updates.age = validated as number;
    if (field === 'gender') updates.gender = validated as string;
    if (field === 'reason_for_visit') updates.reason_for_visit = validated as string;
    if (field === 'email') updates.email = validated as string;
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
 * e-task-2: Use collecting_all for "all at once" flow.
 */
export function getInitialCollectionStep(): string {
  return 'collecting_all';
}

/**
 * Build the confirm_details message (read-back summary).
 */
export function buildConfirmDetailsMessage(collected: CollectedPatientData): string {
  const parts: string[] = [];
  if (collected.name) parts.push(`**${collected.name}**`);
  if (collected.age !== undefined) parts.push(`**${collected.age}**`);
  if (collected.gender) parts.push(`**${collected.gender}**`);
  if (collected.phone) parts.push(`**${collected.phone}**`);
  const reason = collected.reason_for_visit || 'not provided';
  parts.push(`reason: ${reason}`);
  const email = collected.email ? collected.email : 'not provided';
  parts.push(`Email: ${email}`);
  return (
    `Let me confirm: ${parts.join(', ')}. ` +
    'Is this correct? Reply Yes to see available slots, or tell me what to change.'
  );
}

export interface ValidateAndApplyExtractedResult {
  success: boolean;
  newState: ConversationState;
  missingFields: PatientCollectionField[];
  replyOverride?: string;
}

/** Trivial single-value replies — skip AI extraction (regex is enough). */
function isTrivialSingleValue(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 30) return false;
  if (/^(yes|no|yeah|nope|ok|okay)$/i.test(t)) return true;
  if (/^(male|female|m|f)$/i.test(t)) return true;
  if (/^\d{10}$/.test(t.replace(/\D/g, '')) && t.replace(/\D/g, '').length === 10) return true;
  if (/^\d{1,3}$/.test(t) && parseInt(t, 10) >= 1 && parseInt(t, 10) <= 120) return true;
  return false;
}

export interface ValidateAndApplyExtractedOptions {
  lastBotMessage?: string;
  recentMessages?: { sender_type: string; content: string }[];
}

/**
 * Extract fields from message, validate each, merge into store.
 * Returns new state with collectedFields; if all required present, step = 'confirm_details'.
 * AI Receptionist: When we have narrow context (1–2 missing fields) and message is not simple, use AI-first.
 */
export async function validateAndApplyExtracted(
  conversationId: string,
  text: string,
  currentState: ConversationState,
  correlationId: string,
  options?: ValidateAndApplyExtractedOptions
): Promise<ValidateAndApplyExtractedResult> {
  const missingFields = REQUIRED_COLLECTION_FIELDS.filter(
    (f) => !currentState.collectedFields?.includes(f)
  );
  const isTrivial = isTrivialSingleValue(text);
  const isShortReply = /^(yes|no|yeah|nope|my\s+sister\?|sister\s+first)$/i.test(text.trim());
  const isSubstantive = text.trim().length > 15 && !isShortReply && !isTrivial;

  // LLM-first: Use AI for name/age/gender/reason when message is substantive. Regex only for phone/email (structured).
  const phoneEmail = extractPhoneAndEmail(text);

  let extracted: Partial<CollectedPatientData> = { ...phoneEmail };

  if (isSubstantive) {
    const allFields = ['name', 'phone', 'age', 'gender', 'reason_for_visit', 'email'] as const;
    const collectedSummary = allFields
      .map((f) => `${f}: ${currentState.collectedFields?.includes(f) ? 'provided' : 'missing'}`)
      .join(', ');
    const recentTurns = options?.recentMessages
      ?.slice(-6)
      .map((m) => ({
        role: (m.sender_type === 'patient' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: redactPhiForAI(m.content ?? ''),
      }))
      .filter((t) => t.content.trim().length > 0);

    const extractionContext: Partial<ExtractionContext> = {
      lastBotMessage: options?.lastBotMessage?.trim(),
      missingFields,
      collectedSummary,
      relation: currentState.bookingForSomeoneElse ? currentState.relation : undefined,
      recentTurns: recentTurns && recentTurns.length > 0 ? recentTurns : undefined,
    };

    const aiExtracted = await extractFieldsWithAI(
      redactPhiForAI(text),
      missingFields,
      correlationId,
      extractionContext
    );
    if (Object.keys(aiExtracted).length > 0) {
      Object.assign(extracted, aiExtracted);
    } else {
      // AI returned nothing — fallback to regex for name/age/gender/reason
      const regexFallback = extractFieldsFromMessage(text) as Partial<CollectedPatientData>;
      if (regexFallback.name) extracted.name = regexFallback.name;
      if (regexFallback.age !== undefined) extracted.age = regexFallback.age;
      if (regexFallback.gender) extracted.gender = regexFallback.gender;
      if (regexFallback.reason_for_visit) extracted.reason_for_visit = regexFallback.reason_for_visit;
    }
  } else {
    // Trivial or short — regex only (phone/email already in extracted)
    const regexResult = extractFieldsFromMessage(text) as Partial<CollectedPatientData>;
    Object.assign(extracted, regexResult);
  }

  const existing = (await getCollectedData(conversationId)) ?? {};
  const merged: Partial<CollectedPatientData> = { ...existing };
  const updates: Partial<CollectedPatientData> = {};

  /** Never overwrite valid name with symptom-like text (e.g. "i have stomach pain") */
  const isSymptomLike = (s: string) =>
    /^\s*(i\s+have|i've\s+got|i\s+got|having|suffering\s+from)\b/i.test(s.trim()) ||
    /\b(pain|ache|fever|cough|stomach|head|chest)\b/i.test(s);
  /** Never use relationship/gender clarifications as name or reason (e.g. "he is my father he is male obviously") */
  const isRelationshipOrGenderLike = (s: string) =>
    /^(?:he|she|him|her)\s+is\s+(?:my\s+)?(?:father|mother|dad|mom|brother|sister)\b/i.test(s.trim()) ||
    /^(?:he|she|him|her)\s+is\s+(?:male|female)\b/i.test(s.trim()) ||
    /\b(?:my\s+)?(?:father|mother|dad|mom)\s+.*\s+(?:male|female)/i.test(s.trim()) ||
    /\b(?:male|female)\s+obviously\s*$/i.test(s.trim());
  /** Never use standalone gender as name (e.g. user said "male" for gender, not name) */
  const isGenderOnly = (s: string) => /^(male|female|m|f)$/i.test(s.trim());

  for (const [key, value] of Object.entries(extracted)) {
    if (value === undefined || value === '') continue;
    const field = key as keyof ExtractedFields;
    if (field === 'name' && typeof value === 'string') {
      if (isSymptomLike(value) || isRelationshipOrGenderLike(value) || isGenderOnly(value)) continue;
      try {
        const v = validatePatientField('name', value);
        if (v) updates.name = v as string;
      } catch {
        // skip invalid
      }
    } else if (field === 'phone' && typeof value === 'string') {
      try {
        const v = validatePatientField('phone', value);
        if (v) updates.phone = v as string;
      } catch {
        // skip invalid
      }
    } else if (field === 'age' && typeof value === 'number') {
      try {
        const v = validatePatientField('age', String(value));
        if (v !== undefined) updates.age = v as number;
      } catch {
        // skip invalid
      }
    } else if (field === 'gender' && typeof value === 'string') {
      try {
        const v = validatePatientField('gender', value);
        if (v !== undefined && typeof v === 'string') updates.gender = v;
      } catch {
        // skip invalid
      }
    } else if (field === 'reason_for_visit' && typeof value === 'string') {
      if (isRelationshipOrGenderLike(value)) continue; // Never use "he is my father he is male" as reason
      try {
        const v = validatePatientField('reason_for_visit', value);
        if (v !== undefined && typeof v === 'string') updates.reason_for_visit = v;
      } catch {
        // skip invalid
      }
    } else if (field === 'email' && typeof value === 'string') {
      try {
        const v = validatePatientField('email', value);
        if (v !== undefined && typeof v === 'string') updates.email = v;
      } catch {
        // skip invalid
      }
    }
  }

  // Merge into store
  Object.assign(merged, updates);
  await setCollectedData(conversationId, merged);

  // Compute collectedFields
  const collectedSet = new Set<string>();
  for (const f of COLLECTION_ORDER) {
    const val = merged[f as keyof CollectedPatientData];
    if (val !== undefined && (typeof val !== 'string' || val !== '')) collectedSet.add(f);
  }
  const collectedFields = Array.from(collectedSet);

  // Check required
  const remainingMissingFields = REQUIRED_COLLECTION_FIELDS.filter((f) => !collectedFields.includes(f));
  const hasAllRequired = remainingMissingFields.length === 0;

  void logPatientDataCollection({
    correlationId,
    conversationId,
    fieldName: 'extracted',
    status: 'collected',
  });

  return {
    success: true,
    newState: {
      ...currentState,
      collectedFields,
      step: hasAllRequired ? 'confirm_details' : 'collecting_all',
      updatedAt: new Date().toISOString(),
    },
    missingFields: remainingMissingFields,
  };
}

/** Greeting phrases that should not be used as patient name. */
const GREETING_PATTERNS =
  /^(hello|hi|hey)(\s+how are you|\s+how\s+are\s+you)?\s*[?!.]*$|^how are you\s*[?!.]*$|^howdy\s*[?!.]*$|^good (morning|afternoon|evening)\s*[?!.]*$/i;

/**
 * Fallback when Redis/in-memory lost collected data: try to extract from recent user messages
 * and set it. Used when persistPatientAfterConsent fails due to empty getCollectedData.
 * Prefers messages with name+phone (details) over greetings like "hello how are you".
 *
 * @param conversationId - Conversation ID
 * @param recentMessages - Recent messages (sender_type, content)
 * @param correlationId - For audit
 * @returns true if we extracted and set name+phone (minimum for persist)
 */
export async function tryRecoverAndSetFromMessages(
  conversationId: string,
  recentMessages: { sender_type: string; content: string }[],
  correlationId: string
): Promise<boolean> {
  const userTexts: string[] = [];
  for (let i = 0; i < recentMessages.length; i++) {
    if (recentMessages[i].sender_type === 'patient') {
      const c = (recentMessages[i].content ?? '').trim();
      if (c.length >= 5) userTexts.push(c);
    }
  }
  if (userTexts.length === 0) return false;

  /** Never use symptom-like text as name */
  const isSymptomLike = (s: string) =>
    /^\s*(i\s+have|i've\s+got|i\s+got|having|suffering\s+from)\b/i.test(s.trim()) ||
    /\b(pain|ache|fever|cough|stomach|head|chest)\b/i.test(s);

  // Prefer messages that have BOTH name and phone (details message); skip greetings and symptom-as-name
  let best: Partial<CollectedPatientData> = {};
  for (const t of userTexts) {
    if (GREETING_PATTERNS.test(t.trim())) continue;
    const extracted = extractFieldsFromMessage(t);
    if (!extracted.name || !extracted.phone || isSymptomLike(extracted.name)) continue;
    best = { ...best, ...extracted };
  }

  if (!best.name || !best.phone) {
    // Fallback: merge from any message with useful data, but never use name from greeting-only
    let merged: Partial<CollectedPatientData> = {};
    for (const t of userTexts) {
      if (GREETING_PATTERNS.test(t.trim())) continue;
      const extracted = extractFieldsFromMessage(t);
      if (extracted.name && !isSymptomLike(extracted.name)) merged.name = extracted.name;
      if (extracted.phone) merged.phone = extracted.phone;
      if (extracted.age !== undefined) merged.age = extracted.age;
      if (extracted.gender) merged.gender = extracted.gender;
      if (extracted.reason_for_visit) merged.reason_for_visit = extracted.reason_for_visit;
      if (extracted.email) merged.email = extracted.email;
    }
    if (!merged.name || !merged.phone) return false;
    best = merged;
  }

  await setCollectedData(conversationId, best);
  void logPatientDataCollection({
    correlationId,
    conversationId,
    fieldName: 'recovered',
    status: 'collected',
  });
  return true;
}
