/**
 * rcp-08: Book-intent entry stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../../src/config/env', () => ({
  env: {
    RETURNING_PATIENT_MEMORY_ENABLED: false,
    BOOKING_RELATION_LLM_ENABLED: false,
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
  },
}));

jest.mock('../../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(async () => ({
    name: 'Test Patient',
    phone: '5550001234',
    consent_status: 'granted',
    medical_record_number: null,
  })),
}));

jest.mock('../../../../../src/services/collection-service', () => ({
  clearCollectedData: jest.fn(async () => undefined),
  getInitialCollectionStep: jest.fn(() => 'collecting_all'),
  seedCollectedReasonFromStateIfValid: jest.fn(async () => []),
}));

jest.mock('../../../../../src/workers/dm/returning-patient-audit', () => ({
  auditCollectionSkipped: jest.fn(async () => undefined),
}));

jest.mock('../../../../../src/utils/dm-reply-composer', () => ({
  composeIdleFeeQuoteDmWithMetaAsync: jest.fn(async () => ({ reply: 'fee quote' })),
}));

import { bookingEntryStage } from '../../../../../src/workers/dm/stages/booking-entry';
import { isReturningPatientReadyToSkipCollection } from '../../../../../src/workers/dm/booking-entry-ready-path';
import { isBookingEntryTurn } from '../../../../../src/workers/dm/stages/booking-entry-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as patientService from '../../../../../src/services/patient-service';
import { seedCollectedReasonFromStateIfValid } from '../../../../../src/services/collection-service';

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
    text: 'book appointment',
    recentMessages: [],
    intentResult: { intent: 'book_appointment', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: { practice_name: 'Test Clinic' },
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'book_appointment', confidence: 1 },
      doctorSettings: null,
      text: 'book appointment',
      inCollection: false,
      conversationId: 'conv-1',
      patientId: 'patient-1',
      correlationId: 'corr-1',
    },
    inCollection: false,
    isBookIntent: true,
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
    runGenerateResponse: jest.fn(async () => 'AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({})),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('bookingEntryStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('book_responded on responded step with ready patient', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'responded',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await bookingEntryStage.handle(ctx);
    expect(result.branch).toBe('book_responded');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
  });

  it('book_for_someone_else on responded', async () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'book_for_someone_else', confidence: 1 },
      isBookIntent: false,
      text: 'book for my mother',
      state: {
        step: 'responded',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await bookingEntryStage.handle(ctx);
    expect(result.branch).toBe('book_for_someone_else');
    expect(result.nextState.step).toBe('collecting_all');
    expect(result.nextState.bookingForOther?.bookingForSomeoneElse).toBe(true);
  });

  it('resolveStage routes book entry; collecting_all in-flight stays booking_funnel', () => {
    expect(
      resolveStage(
        minimalTurnCtx({
          state: {
            step: 'responded',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
        })
      )
    ).toBe('booking_entry');

    expect(
      resolveStage(
        minimalTurnCtx({
          state: {
            step: 'collecting_all',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
          inCollection: true,
        })
      )
    ).toBe('booking_funnel');

    expect(
      isBookingEntryTurn(
        minimalTurnCtx({
          state: {
            step: 'collecting_all',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
          inCollection: true,
        })
      )
    ).toBe(false);
  });

  it('justStartingCollection + returning ready + no reason → booking_start_returning_reason (rcp-22)', async () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;

    jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
      id: 'patient-1',
      name: 'Priya Sharma',
      phone: '+919876543210',
      consent_status: 'granted',
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    jest.mocked(seedCollectedReasonFromStateIfValid).mockResolvedValue([]);

    const ctx = minimalTurnCtx({
      justStartingCollection: true,
      inCollection: false,
      state: { collectedFields: [], updatedAt: new Date().toISOString() },
      returningProfile: {
        isReturning: true,
        hasGrantedConsent: true,
        consentStatus: 'granted',
        hasName: true,
        hasPhone: true,
        knownFieldKeys: ['name', 'phone', 'age', 'gender'],
        priorVisits: { attendedCount: 2 },
      },
    });

    expect(isReturningPatientReadyToSkipCollection(ctx.returningProfile, {
      name: 'Priya Sharma',
      phone: '+919876543210',
      consent_status: 'granted',
    } as never)).toBe(true);

    const result = await bookingEntryStage.handle(ctx);
    expect(result.branch).toBe('booking_start_returning_reason');
    expect(result.nextState.step).toBe('collecting_all');
    expect(result.nextState.collectedFields).toEqual(['name', 'phone', 'age', 'gender']);
    expect(result.reply).toMatch(/reason for visit/i);
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });

  it('justStartingCollection + returning ready + reason known → booking_start_returning_ready (rcp-22)', async () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;

    jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
      id: 'patient-1',
      name: 'Priya Sharma',
      phone: '+919876543210',
      consent_status: 'granted',
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    jest.mocked(seedCollectedReasonFromStateIfValid).mockResolvedValue(['reason_for_visit']);

    const result = await bookingEntryStage.handle(
      minimalTurnCtx({
        justStartingCollection: true,
        inCollection: false,
        state: {
          collectedFields: [],
          booking: { reasonForVisit: 'headache' },
          updatedAt: new Date().toISOString(),
        },
        returningProfile: {
          isReturning: true,
          hasGrantedConsent: true,
          consentStatus: 'granted',
          hasName: true,
          hasPhone: true,
          knownFieldKeys: ['name', 'phone'],
          priorVisits: { attendedCount: 1 },
        },
      })
    );

    expect(result.branch).toBe('booking_start_returning_ready');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });

  it('book_for_someone_else is not short-circuited by returning profile (rcp-22)', async () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;

    const result = await bookingEntryStage.handle(
      minimalTurnCtx({
        intentResult: { intent: 'book_for_someone_else', confidence: 1 },
        isBookIntent: false,
        text: 'book for my mother',
        returningProfile: {
          isReturning: true,
          hasGrantedConsent: true,
          consentStatus: 'granted',
          hasName: true,
          hasPhone: true,
          knownFieldKeys: ['name', 'phone'],
          priorVisits: { attendedCount: 1 },
        },
      })
    );

    expect(result.branch).toBe('book_for_someone_else');
    expect(result.nextState.step).toBe('collecting_all');
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });

  it('returning-book fixtures pin expected branches (rcp-22)', () => {
    for (const file of ['returning-book-skip-collection.json', 'returning-book-reason-known.json']) {
      const fixture = JSON.parse(
        readFileSync(join(__dirname, '../../../../fixtures/dm-transcripts', file), 'utf-8')
      ) as { expectedBranch: string };
      expect(fixture.expectedBranch).toMatch(/^booking_start_returning_/);
    }
  });

  it('revoked consent + prior visits → normal collection start, not returning skip (rcp-24)', async () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;

    jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
      id: 'patient-1',
      name: 'Priya Sharma',
      phone: '+919876543210',
      consent_status: 'revoked',
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await bookingEntryStage.handle(
      minimalTurnCtx({
        justStartingCollection: true,
        inCollection: false,
        state: { collectedFields: [], updatedAt: new Date().toISOString() },
        returningProfile: {
          isReturning: true,
          hasGrantedConsent: false,
          consentStatus: 'revoked',
          hasName: true,
          hasPhone: true,
          knownFieldKeys: ['name', 'phone'],
          priorVisits: { attendedCount: 2, lastServiceKey: 'follow_up' },
        },
      })
    );

    expect(result.branch).toBe('booking_start_ai');
    expect(result.branch).not.toBe('booking_start_returning_reason');
    expect(result.branch).not.toBe('booking_start_returning_ready');
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });
});
