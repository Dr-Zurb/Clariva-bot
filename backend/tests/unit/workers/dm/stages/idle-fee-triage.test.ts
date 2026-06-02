/**
 * rcp-05: Idle fee / reason-first / medical / greeting stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { idleFeeTriageStage } from '../../../../../src/workers/dm/stages/idle-fee-triage';
import { isIdleFeeTriageTurn } from '../../../../../src/workers/dm/stages/idle-fee-triage-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';

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
    feeComposerOpts: {},
    bookingFeeComposerOpts: {},
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
    expect(composeIdleFeeQuoteDmWithMetaAsync).toHaveBeenCalled();
    expect(result.nextState.step).toBe('responded');
    expect(result.nextState.triage?.activeFlow).toBe('fee_quote');
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
    expect(composeMidCollectionFeeQuoteDmWithMetaAsync).toHaveBeenCalled();
  });

  it('medical_query while idle → medical_safety', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'medical_query', confidence: 1 },
      text: 'mera pet dard ho raha hai',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('medical_safety');
    expect(result.reply.length).toBeGreaterThan(20);
    expect(result.nextState.triage?.lastMedicalDeflectionAt).toBeDefined();
  });

  it('greeting while idle → greeting_template + AI reply', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
      text: 'hi',
    });

    const result = await idleFeeTriageStage.handle(ctx);
    expect(result.branch).toBe('greeting_template');
    expect(ctx.runGenerateResponse).toHaveBeenCalled();
    expect(result.reply).toBe('AI greeting reply');
    expect(composeDmReplySegments).not.toHaveBeenCalled();
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
    expect(result.reply).toContain('AI greeting reply');
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
    expect(result.reply).toBe('AI greeting reply');
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
        firstName: 'Priya',
        recencyBucket: fixture.returningProfile.priorVisits.recencyBucket as 'within_3_months',
      })
    ).toBe(fixture.expectedWelcomeBackPrefix);
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
    expect(composeIdleFeeQuoteDmWithMetaAsync).toHaveBeenCalled();
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
