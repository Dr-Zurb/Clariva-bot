/**
 * RBH-19: Hybrid DM replies — deterministic server blocks (fees, CTAs) composed explicitly.
 * ₹ amounts and URLs must come from non-AI segments; optional short LLM bridge is gated by env.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import { detectSafetyMessageLocale } from './safety-messages';
import type { SafetyMessageLocale } from './safety-messages';
import {
  type ConsultationFeeAmbiguousStaffReview,
  type ConsultationFeeQuoteMatcherFinalize,
  type ConsultationFeesDmSettings,
  formatConsultationFeesForDmWithMeta,
  formatFeeBookingCtaForDm,
} from './consultation-fees';
import type { PatientCollectionField } from './validation';
import { REQUIRED_COLLECTION_FIELDS } from './validation';

/** Immutable segment kinds (no model-invented rupees inside these). */
export type DmSegment =
  | { kind: 'fee_body'; markdown: string }
  | { kind: 'booking_cta'; userText: string }
  | { kind: 'mid_collection_continue'; userText: string; missingFieldKeys?: PatientCollectionField[] }
  | { kind: 'markdown'; content: string };

const SEGMENT_GLUE = '\n\n';

/** Join server-owned segments in order (RBH-19). */
export function composeDmReplySegments(segments: DmSegment[], glue: string = SEGMENT_GLUE): string {
  const parts: string[] = [];
  for (const s of segments) {
    switch (s.kind) {
      case 'markdown':
        if (s.content.trim()) parts.push(s.content.trim());
        break;
      case 'fee_body':
        if (s.markdown.trim()) parts.push(s.markdown.trim());
        break;
      case 'booking_cta':
        parts.push(formatFeeBookingCtaForDm(s.userText));
        break;
      case 'mid_collection_continue':
        parts.push(
          formatMidCollectionAfterFeeBlock(s.userText, s.missingFieldKeys)
        );
        break;
      default:
        break;
    }
  }
  return parts.join(glue);
}

export function feeQuoteSettingsFromDoctorRow(
  settings: DoctorSettingsRow | null
): ConsultationFeesDmSettings {
  return {
    consultation_types: settings?.consultation_types ?? null,
    practice_name: settings?.practice_name ?? null,
    business_hours_summary: settings?.business_hours_summary ?? null,
    appointment_fee_minor: settings?.appointment_fee_minor ?? null,
    appointment_fee_currency: settings?.appointment_fee_currency ?? null,
    service_offerings_json: settings?.service_offerings_json ?? null,
  };
}

/** Idle user (not in intake): fee block + localized booking CTA. */
export function composeIdleFeeQuoteDm(
  settings: DoctorSettingsRow | null,
  userText: string,
  opts?: { catalogMatchText?: string; clinicalLedFeeThread?: boolean }
): string {
  return composeIdleFeeQuoteDmWithMeta(settings, userText, opts).reply;
}

/** e-task-dm-02: includes optional high-confidence catalog finalize from thread-aware narrowing. */
export function composeIdleFeeQuoteDmWithMeta(
  settings: DoctorSettingsRow | null,
  userText: string,
  opts?: { catalogMatchText?: string; clinicalLedFeeThread?: boolean }
): {
  reply: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
} {
  const fee = formatConsultationFeesForDmWithMeta(
    feeQuoteSettingsFromDoctorRow(settings),
    userText,
    opts?.catalogMatchText,
    opts?.clinicalLedFeeThread !== undefined
      ? { clinicalLedFeeThread: opts.clinicalLedFeeThread }
      : undefined
  );
  if (fee.feeAmbiguousStaffReview) {
    return { reply: fee.markdown.trim(), feeAmbiguousStaffReview: fee.feeAmbiguousStaffReview };
  }
  return {
    reply: composeDmReplySegments([
      { kind: 'fee_body', markdown: fee.markdown },
      { kind: 'booking_cta', userText },
    ]),
    feeQuoteMatcherFinalize: fee.feeQuoteMatcherFinalize,
  };
}

/** Mid-intake pricing: fee block + localized “continue sharing details” (+ optional missing fields). */
export function composeMidCollectionFeeQuoteDm(
  settings: DoctorSettingsRow | null,
  userText: string,
  opts?: { collectedFields?: string[] | null; catalogMatchText?: string }
): string {
  return composeMidCollectionFeeQuoteDmWithMeta(settings, userText, opts).reply;
}

export function composeMidCollectionFeeQuoteDmWithMeta(
  settings: DoctorSettingsRow | null,
  userText: string,
  opts?: {
    collectedFields?: string[] | null;
    catalogMatchText?: string;
    clinicalLedFeeThread?: boolean;
  }
): {
  reply: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
} {
  const fee = formatConsultationFeesForDmWithMeta(
    feeQuoteSettingsFromDoctorRow(settings),
    userText,
    opts?.catalogMatchText,
    opts?.clinicalLedFeeThread !== undefined
      ? { clinicalLedFeeThread: opts.clinicalLedFeeThread }
      : undefined
  );
  if (fee.feeAmbiguousStaffReview) {
    return { reply: fee.markdown.trim(), feeAmbiguousStaffReview: fee.feeAmbiguousStaffReview };
  }
  const missing = computeMissingCollectionFields(opts?.collectedFields);
  return {
    reply: composeDmReplySegments([
      { kind: 'fee_body', markdown: fee.markdown },
      {
        kind: 'mid_collection_continue',
        userText,
        missingFieldKeys: missing.length > 0 ? missing : undefined,
      },
    ]),
    feeQuoteMatcherFinalize: fee.feeQuoteMatcherFinalize,
  };
}

function computeMissingCollectionFields(
  collectedFields: string[] | null | undefined
): PatientCollectionField[] {
  const have = new Set((collectedFields ?? []).map((x) => x.trim().toLowerCase()));
  return REQUIRED_COLLECTION_FIELDS.filter((f) => !have.has(f));
}

const FIELD_LABEL_EN: Record<PatientCollectionField, string> = {
  name: 'full name',
  phone: 'mobile number',
  age: 'age',
  gender: 'gender',
  reason_for_visit: 'reason for visit',
  email: 'email (optional)',
};

const FIELD_LABEL_HI_LATIN: Record<PatientCollectionField, string> = {
  name: 'poora naam',
  phone: 'mobile number',
  age: 'umar',
  gender: 'gender',
  reason_for_visit: 'visit ki wajah',
  email: 'email (optional)',
};

const FIELD_LABEL_PA_LATIN: Record<PatientCollectionField, string> = {
  name: 'poora naam',
  phone: 'mobile number',
  age: 'umar',
  gender: 'gender',
  reason_for_visit: 'visit di wajah',
  email: 'email (optional)',
};

function localeBucket(
  userText: string
): { base: SafetyMessageLocale; hasDevanagari: boolean; hasGurmukhi: boolean } {
  const loc = detectSafetyMessageLocale(userText || '');
  return {
    base: loc,
    hasDevanagari: /[\u0900-\u097F]/.test(userText || ''),
    hasGurmukhi: /[\u0A00-\u0A7F]/.test(userText || ''),
  };
}

function humanizeMissingFields(
  fields: PatientCollectionField[],
  loc: SafetyMessageLocale,
  hasDevanagari: boolean,
  hasGurmukhi: boolean
): string {
  if (fields.length === 0) return '';
  const pick = (row: Record<PatientCollectionField, string>) =>
    fields.map((f) => row[f]).join(', ');

  if (loc === 'pa' && !hasGurmukhi) {
    return `Haje eh chaahide: ${pick(FIELD_LABEL_PA_LATIN)}.`;
  }
  if (loc === 'hi' && !hasDevanagari) {
    return `Abhi yeh details chahiye: ${pick(FIELD_LABEL_HI_LATIN)}.`;
  }
  if (loc === 'hi' && hasDevanagari) {
    return `कृपया ये जानकारी भेजें: ${pick(FIELD_LABEL_EN)}।`;
  }
  if (loc === 'pa' && hasGurmukhi) {
    return `ਕਿਰਪਾ ਕਰਕੇ ਇਹ ਵੇਰਵੇ ਭੇਜੋ: ${pick(FIELD_LABEL_EN)}।`;
  }
  return `Still needed: ${pick(FIELD_LABEL_EN)}.`;
}

/**
 * Footer after fee block when user is mid–booking (RBH-18/19). ASCII `---` separator (RBH-16).
 */
export function formatMidCollectionAfterFeeBlock(
  userText: string,
  missingFieldKeys?: PatientCollectionField[]
): string {
  const { base, hasDevanagari, hasGurmukhi } = localeBucket(userText);
  const missingLine =
    missingFieldKeys?.length ?
      `\n\n${humanizeMissingFields(missingFieldKeys, base, hasDevanagari, hasGurmukhi)}`
    : '';

  if (base === 'hi' && !hasDevanagari) {
    return `---\n\nBooking complete karne ke liye jo bhi details abhi baaki hain, woh yahan bhejte rahein.${missingLine}`;
  }
  if (base === 'hi' && hasDevanagari) {
    return `---\n\nबुकिंग पूरी करने के लिए बची जानकारी यहाँ भेजें।${missingLine}`;
  }
  if (base === 'pa' && !hasGurmukhi) {
    return `---\n\nBooking poori karan layi jo v vi gaya hai, oh ite bhejde raho.${missingLine}`;
  }
  if (base === 'pa' && hasGurmukhi) {
    return `---\n\nਬੁਕਿੰਗ ਪੂਰੀ ਕਰਨ ਲਈ ਬਾਕੀ ਵੇਰਵੇ ਇੱਥੇ ਭੇਜਦੇ ਰਹੋ।${missingLine}`;
  }
  return `---\n\nPlease continue sharing any booking details we still need so we can finish scheduling.${missingLine}`;
}
