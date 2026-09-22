/**
 * rcp-05: Idle fee / reason-first / medical / greeting stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { idleFeeTriageStage } from '../../../../../src/workers/dm/stages/idle-fee-triage';
import { isIdleFeeTriageTurn } from '../../../../../src/workers/dm/stages/idle-fee-triage-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';

jest.mock('../../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../../src/utils/dm-reply-composer', () => ({
  composeDmReplySegments: jest.fn((segments: { kind: string; content?: string }[]) =>
    segments.map((s) => (s.kind === 'markdown' ? s.content : 'Welcome back segment')).join('\n\n')
  ),
  composeIdleFeeQuoteDmWithMetaAsync: jest.fn(async () => ({
    reply: 'Consultation fee is ₹500.',
  })),
  composeMidCollectionFeeQuoteDmWithMetaAsync: jest.fn(async () => ({
    reply: 'Consultation fee is ₹500. Please share the remaining details.',
  })),
}));

jest.mock('../../../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(),
}));

jest.mock('../../../../../src/services/instagram-connect-service', () => ({
  getConnectedInstagramDisplayName: jest.fn(async () => null),
}));

jest.mock('../../../../../src/workers/dm/returning-patient', () => ({
  extractPatientFirstName: jest.fn((name?: string | null) => {
    const trimmed = name?.trim();
    if (!trimmed || trimmed === 'Placeholder') return undefined;
    return trimmed.split(/\s+/)[0];
  }),
  shouldUseReturningPatientMemory: jest.fn(() => false),
}));

jest.mock('../../../../../src/services/ai-service', () => ({
  appendOptionalDmReplyBridge: jest.fn(async ({ baseReply }: { baseReply: string }) => baseReply),
  classifierSignalsPaymentExistence: jest.fn(() => false),
  resolvePostMedicalPaymentExistenceAck: jest.fn(async () => 'Consultations are paid services.'),
  resolveVisitReasonSnippetForTriage: jest.fn(async () => 'your symptoms'),
  userSignalsReasonFirstWrapUp: jest.fn(() => false),
}));

import {
  composeDmReplySegments,
  composeIdleFeeQuoteDmWithMetaAsync,
  composeMidCollectionFeeQuoteDmWithMetaAsync,
} from '../../../../../src/utils/dm-reply-composer';
import * as patientService from '../../../../../src/services/patient-service';
import { shouldUseReturningPatientMemory } from '../../../../../src/workers/dm/returning-patient';
import { getConnectedInstagramDisplayName } from '../../../../../src/services/instagram-connect-service';
import { readFileSync } from 'fs';
import { join } from 'path';

function minimalTurnCtx(overrides: Partial<DmTurnContext> = {}): DmTurnContext {
  return {
    state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
    conversation: {
      id: 'conv-1',
      patient_id: 'patient-1',
      doctor_id: 'doctor-1',
      platform: 'instagram',
      platform_conversation_id: 'sender-1',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Conversation,
    doctorId: 'doctor-1',
    correlationId: 'corr-1',
    text: 'hello',
    turnLanguage: 'en',
    recentMessages: [],
    intentResult: { intent: 'unknown', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: undefined,
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'unknown', confidence: 1 },
      doctorSettings: null,
      text: 'hello',
      turnLanguage: 'en',
      inCollection: false,
      conversationId: 'conv-1',
      patientId: 'patient-1',
      correlationId: 'corr-1',
    },
    inCollection: false,
    isBookIntent: false,
    justStartingCollection: false,
    signalsFeePricing: false,
    feeIdleRoutedByAnaphora: false,
    feeComposerOpts: { language: 'en' },
    bookingFeeComposerOpts: { language: 'en' },
    teleconsultCatalogRowCount: 1,
    channelReplyPick: null,
    lastBotAskedForDetails: false,
    recentDmForClinical: [],
    timing: { dmGenerateMs: 0 },
    runGenerateResponse: jest.fn(async () => 'AI greeting reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({})),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('idleFeeTriageStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('idle fee pricing → fee_deterministic_idle', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      signalsFeePricing: true,
      text: 'how much is consultation',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('fee_deterministic_idle');
    expect(result.reply).toContain('Visit prices are on this page:');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/get an appointment/i);
    expect(result.reply).not.toMatch(/Dr |Fever|hypertension|diabetes/i);
    expect(composeIdleFeeQuoteDmWithMetaAsync).not.toHaveBeenCalled();
  });

  it('fee question during collection → fee_deterministic_mid_collection', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      signalsFeePricing: true,
      inCollection: true,
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
      text: 'fee kitna hai',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('fee_deterministic_mid_collection');
    expect(result.reply).toContain('Visit prices are on this page:');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/get an appointment/i);
    expect(composeMidCollectionFeeQuoteDmWithMetaAsync).not.toHaveBeenCalled();
  });

  it('medical_query while idle → medical_safety receptionist only (no /book)', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'medical_query', confidence: 1 },
      text: 'mera pet dard ho raha hai',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('medical_safety');
    expect(result.reply).not.toContain('https://example.com/book');
    expect(result.reply).toBe("I'm the receptionist. I can help with timings, availability, or a booking link.");
    expect(result.reply).not.toMatch(/medical advice|teleconsult|doctor|medical record/i);
    expect(result.nextState.triage?.lastMedicalDeflectionAt).toBeDefined();
    expect(result.nextState.triage?.reasonFirstTriagePhase).toBeUndefined();
    expect(result.nextState.step).toBe('responded');
  });

  it('ask_question prescribe line → medical_safety receptionist only, no advice wording', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      text: 'are you a doctor? can you prescribe something for my cough?',
    });

    expect(isIdleFeeTriageTurn(ctx)).toBe(true);
    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('medical_safety');
    expect(result.reply).not.toContain('https://example.com/book');
    expect(result.reply).toContain("I'm the receptionist");
    expect(result.reply).not.toMatch(/prescribe|medical advice|cough|consultation for/i);
  });

  it('in-flight reason-first ask_more + clinical text → /book (clears phase)', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      text: 'headache since yesterday',
      state: {
        step: 'responded',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
        triage: { reasonFirstTriagePhase: 'ask_more' },
      },
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('booking_start_link_first');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.nextState.triage?.reasonFirstTriagePhase).toBeUndefined();
    expect(result.nextState.step).toBe('awaiting_slot_selection');
  });

  it('greeting-classified symptom report → medical_safety, not greeting', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'i have headache',
    });

    expect(isIdleFeeTriageTurn(ctx)).toBe(true);
    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('medical_safety');
    expect(result.reply).toBe(
      "I'm the receptionist. I can help with timings, availability, or a booking link."
    );
    expect(result.reply).not.toContain('https://example.com/book');
  });

  it('bare book after medical intent is not claimed by idle medical_safety', () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'medical_query', confidence: 1 },
      text: 'book',
      isBookIntent: true,
      state: {
        step: 'responded',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
        triage: { lastMedicalDeflectionAt: new Date().toISOString() },
      },
    });

    expect(isIdleFeeTriageTurn(ctx)).toBe(false);
    expect(resolveStage({ ...ctx, isBookIntent: true })).toBe('booking_entry');
  });

  it('greeting while idle → greeting_template + locked receptionist line', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('greeting_template');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
    expect(result.reply).toBe(
      "Hi — I'm the receptionist. I can help with availability, cancel/reschedule, or a booking link. How can I help today?"
    );
    expect(result.reply).not.toMatch(/doctor|teleconsult|medical|Dr\b/i);
    expect(composeDmReplySegments).not.toHaveBeenCalled();
  });

  it('online-only address ask does not say teleconsult', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      text: 'adress ?',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        instagram_receptionist_paused: false,
        appointment_fee_currency: 'INR',
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '00000000-0000-4000-8000-000000000001',
              service_key: 'visit',
              label: 'Visit',
              modalities: {
                video: { enabled: true, price_minor: 50000 },
              },
            },
          ],
        },
      } as never,
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toBe(
      "Appointments are online, so there isn't a street address. I can help with timings or a booking link."
    );
    expect(result.reply).not.toMatch(/teleconsult|https?:\/\//i);
    expect(result.nextState.step).toBe('responded');
  });

  it('greeting names the connected Instagram account', async () => {
    jest.mocked(getConnectedInstagramDisplayName).mockResolvedValueOnce('Halo Aid');
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toContain("I'm Halo Aid's receptionist");
  });

  it('single_fee greeting mentions fee, not a rupee amount', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        catalog_mode: 'single_fee',
        appointment_fee_minor: 50000,
        address_summary: 'Batala',
      } as never,
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toMatch(/appointment fee/i);
    expect(result.reply).toMatch(/address/i);
    expect(result.reply).not.toMatch(/₹/);
  });

  it('hours on file → quote only, no /book', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      text: 'timings?',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        business_hours_summary: 'Mon–Fri 9am–5pm',
      } as never,
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toBe('Timings: Mon–Fri 9am–5pm');
    expect(result.reply).not.toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/get an appointment/i);
  });

  it('hours missing → page link, not booking CTA', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      text: 'timings?',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toContain("I don't have timings saved. They're on this page:");
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/get an appointment/i);
    expect(result.nextState.step).toBe('responded');
  });

  it('single_fee price ask quotes ₹ without a booking CTA', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'ask_question', confidence: 1 },
      signalsFeePricing: true,
      text: 'how much is consultation',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        catalog_mode: 'single_fee',
        appointment_fee_minor: 50000,
        appointment_fee_currency: 'INR',
      } as never,
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.reply).toBe('Consult fee is ₹500.');
    expect(result.reply).not.toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/get an appointment/i);
  });

  it('consented returning greeting prepends welcome_back when flag on (rcp-21)', async () => {
    jest.mocked(shouldUseReturningPatientMemory).mockReturnValue(true);

    jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
      id: 'patient-1',
      name: 'Priya Sharma',
      phone: '+919876543210',
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
      returningProfile: {
        isReturning: true,
        hasGrantedConsent: true,
        consentStatus: 'granted',
        hasName: true,
        hasPhone: true,
        knownFieldKeys: ['name', 'phone'],
        priorVisits: {
          attendedCount: 2,
          lastServiceKey: 'follow_up',
          recencyBucket: 'within_3_months',
        },
      },
      buildAiContextForResponse: jest.fn(async () => ({
        returningPatientSummary:
          'returning patient: prior_visits=2, last_service=[follow_up], recency=[within_3_months]',
      })),
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('greeting_template');
    expect(patientService.findPatientByIdWithAdmin).toHaveBeenCalledWith('patient-1', 'corr-1');
    expect(composeDmReplySegments).toHaveBeenCalled();
    expect(result.reply).toContain('Welcome back segment');
    expect(result.reply).toContain("I'm the receptionist");
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('revoked/pending consent — no welcome_back even when profile has prior visits (rcp-24)', async () => {
    jest.mocked(shouldUseReturningPatientMemory).mockReturnValue(false);

    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
      returningProfile: {
        isReturning: true,
        hasGrantedConsent: false,
        consentStatus: 'revoked',
        hasName: true,
        hasPhone: true,
        knownFieldKeys: ['name', 'phone'],
        priorVisits: { attendedCount: 2, lastServiceKey: 'follow_up' },
      },
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('greeting_template');
    expect(composeDmReplySegments).not.toHaveBeenCalled();
    expect(result.reply).toContain("I'm the receptionist");
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('returning-greeting fixture pins welcome-back copy shape (rcp-21)', () => {
    const raw = readFileSync(
      join(__dirname, '../../../../fixtures/dm-transcripts/returning-greeting.json'),
      'utf-8'
    );
    const fixture = JSON.parse(raw) as {
      expectedWelcomeBackPrefix: string;
      returningProfile: { priorVisits: { recencyBucket: string } };
    };
    const { formatWelcomeBackSegment } = jest.requireActual<
      typeof import('../../../../../src/utils/dm-reply-composer')
    >('../../../../../src/utils/dm-reply-composer');
    expect(
      formatWelcomeBackSegment({
        language: 'en',
        firstName: 'Priya',
        recencyBucket: fixture.returningProfile.priorVisits.recencyBucket as 'within_3_months',
      })
    ).toBe(fixture.expectedWelcomeBackPrefix);
  });

  it('insurance / cash-or-UPI → page link, not a consult-fee quote', async () => {
    const insurance = await idleFeeTriageStage.handle(
      minimalTurnCtx({
        intentResult: { intent: 'ask_question', confidence: 1 },
        signalsFeePricing: true,
        text: 'do you take insurance',
      })
    );
    expect(isIdleFeeTriageTurn(
      minimalTurnCtx({
        intentResult: { intent: 'ask_question', confidence: 1 },
        signalsFeePricing: true,
        text: 'do you take insurance',
      })
    )).toBe(true);
    expect(insurance.reply).toContain("I don't have payment details saved");
    expect(insurance.reply).toContain('https://example.com/book');
    expect(insurance.reply).not.toMatch(/get an appointment|₹|Consult fee/i);

    const upi = await idleFeeTriageStage.handle(
      minimalTurnCtx({
        intentResult: { intent: 'ask_question', confidence: 1 },
        signalsFeePricing: true,
        text: 'cash or UPI',
      })
    );
    expect(upi.reply).toContain("I don't have payment details saved");
    expect(upi.reply).not.toMatch(/get an appointment|₹|Consult fee/i);
  });

  it('misclassified book + pricing → idle stage quotes fee (legacy order: idle before book_misclassified branch)', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'book_appointment', confidence: 1 },
      isBookIntent: true,
      justStartingCollection: true,
      signalsFeePricing: true,
      text: 'how much for consultation',
    });

    expect(isIdleFeeTriageTurn(ctx)).toBe(true);
    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('fee_deterministic_idle');
    expect(result.reply).toContain('Visit prices are on this page:');
    expect(result.reply).not.toMatch(/get an appointment/i);
    expect(composeIdleFeeQuoteDmWithMetaAsync).not.toHaveBeenCalled();
  });

  it('resolveStage routes idle/fee/medical/greeting here; collection-only book still legacy', () => {
    expect(
      resolveStage(
        minimalTurnCtx({
          intentResult: { intent: 'greeting', confidence: 1 },
          text: 'hello',
        })
      )
    ).toBe('idle_fee_triage');

    expect(
      resolveStage(
        minimalTurnCtx({
          signalsFeePricing: true,
          text: 'how much is the consultation',
        })
      )
    ).toBe('idle_fee_triage');

    expect(
      resolveStage(
        minimalTurnCtx({
          intentResult: { intent: 'book_appointment', confidence: 1 },
          isBookIntent: true,
          justStartingCollection: true,
          inCollection: true,
          lastBotAskedForDetails: true,
          text: 'book appointment',
        })
      )
    ).toBe('booking_entry');

    expect(isIdleFeeTriageTurn(minimalTurnCtx({ intentResult: { intent: 'greeting', confidence: 1 } }))).toBe(
      true
    );
  });
});
