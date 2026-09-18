/**
 * Locale invariants: LANG3-D6 protected tokens + LANG6-D1/D8 arm status.
 * lang-26 §1 inverted the English-lock tests (no longer asserts hi === en forever).
 */

import {
  buildAbandonedBookingReminderMessage,
  buildConfirmDetailsMessage,
  buildConsultationReadyDm,
  buildIntakeRequestMessage,
  buildNonTextAckMessage,
  buildPaymentConfirmationMessage,
  buildRefundFailedDm,
  buildRefundProcessingDm,
} from '../../../src/utils/dm-copy';
import { formatReasonFirstAskMoreQuestion } from '../../../src/utils/reason-first-triage';
import {
  LOCALE_ARM_MANIFEST,
  type LocaleArmManifestEntry,
} from '../../../src/utils/locale-arm-manifest';
import type { ConversationLanguage } from '../../../src/utils/conversation-language';
import type { CollectedPatientData } from '../../../src/utils/validation';

const PRACTICE = "Dr Zurb's Clinic";
const LOCALES: ConversationLanguage[] = ['en', 'hi', 'hi-Latn', 'pa', 'pa-Latn', 'other'];

const ENGLISH_SENTINELS = ['Thanks for sharing', 'Welcome back', 'Please share'] as const;

/** Extract ₹ amounts, bare digit runs (≥2), and http(s) URLs for cross-locale compare. */
function extractProtectedTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/₹\s*[\d,]+(?:\.\d+)?/g)) {
    tokens.add(m[0].replace(/\s+/g, ''));
  }
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    tokens.add(m[0]);
  }
  for (const m of text.matchAll(/\b\d{2,}\b/g)) {
    tokens.add(m[0]);
  }
  return [...tokens].sort();
}

function bulletStructure(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.startsWith('- **'))
    .map((l) => l.replace(/\*\*[^*]+\*\*/g, '**LABEL**'))
    .join('\n');
}

const FULL_FIXTURE: CollectedPatientData = {
  name: 'Abhishek Sahil',
  age: 35,
  gender: 'male',
  phone: '8264602737',
  reason_for_visit: 'headache',
  email: 'abhishek@example.com',
};

function manifestEntry(familyId: string): LocaleArmManifestEntry {
  const e = LOCALE_ARM_MANIFEST.find((x) => x.familyId === familyId);
  if (!e) {
    throw new Error(`LOCALE_ARM_MANIFEST missing familyId=${familyId}`);
  }
  return e;
}

/**
 * LANG6-D1 / LANG6-D8: non-en arms are either a reviewed translation or
 * deliberate English (enByPolicy). Byte-identical hi===en is only OK for enByPolicy.
 */
function expectReviewedOrDeliberateEnglish(
  familyId: string,
  en: string,
  hi: string,
  pa: string
): void {
  const entry = manifestEntry(familyId);
  if (entry.status === 'enByPolicy') {
    expect(hi).toBe(en);
    expect(pa).toBe(en);
    expect(entry.enByPolicyReason?.trim().length).toBeGreaterThan(5);
    return;
  }
  expect(entry.status).toBe('translated');
  expect(hi).not.toBe(en);
  expect(pa).not.toBe(en);
  for (const sentinel of ENGLISH_SENTINELS) {
    expect(hi).not.toContain(sentinel);
    expect(pa).not.toContain(sentinel);
  }
}

describe('dm-copy locale invariants (lang-09 / lang-12 / lang-26)', () => {
  const baseInput = {
    variant: 'initial' as const,
    language: 'en' as const,
    practiceName: PRACTICE,
    missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'] as const,
  };

  it('practice name is byte-identical across all ConversationLanguage arms', () => {
    for (const language of LOCALES) {
      const out = buildIntakeRequestMessage({ ...baseInput, language });
      expect(out).toContain(`**${PRACTICE}**`);
    }
  });

  it('protected tokens (digits / ₹ / URLs) match across static locales — intake', () => {
    const en = buildIntakeRequestMessage({ ...baseInput, language: 'en' });
    const hi = buildIntakeRequestMessage({ ...baseInput, language: 'hi' });
    const pa = buildIntakeRequestMessage({ ...baseInput, language: 'pa' });
    expect(extractProtectedTokens(hi)).toEqual(extractProtectedTokens(en));
    expect(extractProtectedTokens(pa)).toEqual(extractProtectedTokens(en));
  });

  it('bullet markdown structure matches across en / hi / pa', () => {
    const en = buildIntakeRequestMessage({ ...baseInput, language: 'en' });
    const hi = buildIntakeRequestMessage({ ...baseInput, language: 'hi' });
    const pa = buildIntakeRequestMessage({ ...baseInput, language: 'pa' });
    expect(bulletStructure(hi)).toBe(bulletStructure(en));
    expect(bulletStructure(pa)).toBe(bulletStructure(en));
  });

  it("language: 'other' renders the English arm (LANG-D7)", () => {
    const en = buildIntakeRequestMessage({ ...baseInput, language: 'en' });
    const other = buildIntakeRequestMessage({ ...baseInput, language: 'other' });
    expect(other).toBe(en);
  });

  it('requires language on the typed input (lang-10)', () => {
    const explicit = buildIntakeRequestMessage({ ...baseInput, language: 'en' });
    expect(explicit).toContain("Dr Zurb's Clinic");
  });

  it('confirm-details is reviewed translation or deliberate English (LANG6-D1/D8)', () => {
    const en = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'en' });
    const hi = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'hi' });
    const pa = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'pa' });
    expectReviewedOrDeliberateEnglish('confirm-details', en, hi, pa);
    expect(extractProtectedTokens(hi)).toEqual(extractProtectedTokens(en));
  });

  it('payment confirmation preserves MRN + date digits across locales (LANG3-D6)', () => {
    const input = {
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
    };
    const en = buildPaymentConfirmationMessage({ language: 'en', ...input });
    const hi = buildPaymentConfirmationMessage({ language: 'hi', ...input });
    const pa = buildPaymentConfirmationMessage({ language: 'pa', ...input });
    expect(en).toContain('CLR-00123');
    expect(extractProtectedTokens(hi)).toEqual(extractProtectedTokens(en));
    expect(extractProtectedTokens(pa)).toEqual(extractProtectedTokens(en));
  });

  it('consultation-ready preserves join URL across locales (LANG3-D6)', () => {
    const url = 'https://app.clariva.test/join/abc';
    const en = buildConsultationReadyDm({
      language: 'en',
      modality: 'video',
      practiceName: PRACTICE,
      joinUrl: url,
    });
    const hi = buildConsultationReadyDm({
      language: 'hi',
      modality: 'video',
      practiceName: PRACTICE,
      joinUrl: url,
    });
    const pa = buildConsultationReadyDm({
      language: 'pa',
      modality: 'video',
      practiceName: PRACTICE,
      joinUrl: url,
    });
    expect(hi).toContain(url);
    expect(extractProtectedTokens(hi)).toEqual(extractProtectedTokens(en));
    expect(hi).toContain(`**${PRACTICE}**`);
    expectReviewedOrDeliberateEnglish('consultation-ready', en, hi, pa);
  });

  it('refund DMs are reviewed or deliberate English; ₹ preserved (LANG6-D1/D8 + LANG3-D6)', () => {
    const enProc = buildRefundProcessingDm({ language: 'en', amountInr: 499, expectedDays: 3 });
    const hiProc = buildRefundProcessingDm({ language: 'hi', amountInr: 499, expectedDays: 3 });
    const paProc = buildRefundProcessingDm({ language: 'pa', amountInr: 499, expectedDays: 3 });
    expectReviewedOrDeliberateEnglish('refund-processing', enProc, hiProc, paProc);
    expect(enProc).toContain('₹499');

    const enFail = buildRefundFailedDm({ language: 'en', amountInr: 750 });
    const hiFail = buildRefundFailedDm({ language: 'hi', amountInr: 750 });
    const paFail = buildRefundFailedDm({ language: 'pa', amountInr: 750 });
    expectReviewedOrDeliberateEnglish('refund-failed', enFail, hiFail, paFail);
    expect(enFail).toContain('₹750');
  });

  it('abandoned-booking reminder preserves URL across locales (LANG3-D6)', () => {
    const bookingUrl = 'https://book.clariva.app/pick-slot?token=abc123';
    const en = buildAbandonedBookingReminderMessage({ language: 'en', bookingUrl });
    const hi = buildAbandonedBookingReminderMessage({ language: 'hi', bookingUrl });
    expect(hi).toContain(bookingUrl);
    expect(extractProtectedTokens(hi)).toEqual(extractProtectedTokens(en));
    expectReviewedOrDeliberateEnglish('abandoned-booking-reminder', en, hi, buildAbandonedBookingReminderMessage({ language: 'pa', bookingUrl }));
  });
});

describe('non-en arms must not leak English sentinels (LANG6-D1/D8)', () => {
  it('formatReasonFirstAskMoreQuestion is reviewed or deliberate English (LANG6-D1/D8)', () => {
    const en = formatReasonFirstAskMoreQuestion('en');
    const hi = formatReasonFirstAskMoreQuestion('hi');
    const pa = formatReasonFirstAskMoreQuestion('pa');
    expectReviewedOrDeliberateEnglish('reason-first-ask-more', en, hi, pa);
  });

  it('translated arms must not contain English sentinels; enByPolicy may match en', () => {
    const samples: Array<{
      familyId: string;
      language: ConversationLanguage;
      text: string;
      enPeer: string;
    }> = [
      {
        familyId: 'confirm-details',
        language: 'hi',
        text: buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'hi' }),
        enPeer: buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'en' }),
      },
      {
        familyId: 'non-text-ack',
        language: 'hi',
        text: buildNonTextAckMessage({ language: 'hi' }),
        enPeer: buildNonTextAckMessage({ language: 'en' }),
      },
      {
        familyId: 'payment-confirmation',
        language: 'pa',
        text: buildPaymentConfirmationMessage({
          language: 'pa',
          appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
          patientMrn: 'CLR-00123',
        }),
        enPeer: buildPaymentConfirmationMessage({
          language: 'en',
          appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
          patientMrn: 'CLR-00123',
        }),
      },
    ];

    for (const { familyId, text, enPeer } of samples) {
      const entry = manifestEntry(familyId);
      if (entry.status === 'enByPolicy') {
        expect(text).toBe(enPeer);
        continue;
      }
      // Translated: matching English is a bug; sentinels must not leak.
      expect(text).not.toBe(enPeer);
      for (const sentinel of ENGLISH_SENTINELS) {
        expect(text).not.toContain(sentinel);
      }
    }
  });
});
