/**
 * rcp-07: Booking funnel stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../../src/services/patient-service', () => ({
  createPatientForBooking: jest.fn(async () => ({ id: 'new-patient', medical_record_number: null })),
  findPossiblePatientMatches: jest.fn(async () => []),
}));

jest.mock('../../../../../src/services/consent-service', () => ({
  persistPatientAfterConsent: jest.fn(async () => ({ success: true })),
  handleConsentDenied: jest.fn(async () => 'Consent denied copy'),
}));

jest.mock('../../../../../src/services/service-catalog-matcher', () => ({
  matchServiceCatalogOffering: jest.fn(async () => null),
}));

jest.mock('../../../../../src/services/collection-service', () => ({
  getCollectedData: jest.fn(async () => ({
    name: 'Jane',
    phone: '9876543210',
    reason_for_visit: 'headache',
  })),
  clearCollectedData: jest.fn(async () => undefined),
  validateAndApplyExtracted: jest.fn(async () => ({
    newState: { step: 'collecting_all', collectedFields: ['name'], updatedAt: new Date().toISOString() },
    missingFields: [],
  })),
  buildConfirmDetailsMessage: jest.fn(() => 'Please confirm your details'),
  tryRecoverAndSetFromMessages: jest.fn(async () => false),
}));

jest.mock('../../../../../src/services/ai-service', () => ({
  resolveConsentReplyForBooking: jest.fn(async () => 'granted'),
  resolveConfirmDetailsReplyForBooking: jest.fn(async () => 'confirm'),
}));

jest.mock('../../../../../src/utils/staff-service-review-dm', () => ({
  formatStaffServiceReviewStillPendingDm: jest.fn(() => 'Staff review pending copy'),
  formatAwaitingStaffServiceConfirmationDm: jest.fn(() => 'Awaiting staff confirmation'),
}));

jest.mock('../../../../../src/services/service-match-learning-autobook', () => ({
  tryApplyLearningPolicyAutobook: jest.fn(async () => ({ applied: false })),
}));

import {
  bookingFunnelStage,
  applyRecordingConsentDetourIfNeeded,
} from '../../../../../src/workers/dm/stages/booking-funnel';
import { isBookingFunnelTurn } from '../../../../../src/workers/dm/stages/booking-funnel-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';
import { buildRecordingConsentAskMessage } from '../../../../../src/utils/dm-copy';

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
    text: 'yes',
    recentMessages: [],
    intentResult: { intent: 'unknown', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: { practice_name: 'Test Clinic' },
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'unknown', confidence: 1 },
      doctorSettings: null,
      text: 'yes',
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
    runGenerateResponse: jest.fn(async () => 'AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({})),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('bookingFunnelStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recording_consent step → recording_consent_flow', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'recording_consent',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
      text: 'yes',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('recording_consent_flow');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.nextState.recordingConsent?.recordingConsentDecision).toBe(true);
  });

  it('consent granted → recording_consent_injected detour (no prior decision)', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'consent',
        collectedFields: ['name', 'phone', 'reason_for_visit'],
        updatedAt: new Date().toISOString(),
      },
      text: 'yes',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('recording_consent_injected');
    expect(result.nextState.step).toBe('recording_consent');
    expect(result.nextState.lastPromptKind).toBe('recording_consent_ask');
    expect(result.reply).toBe(
      buildRecordingConsentAskMessage({ practiceName: 'Test Clinic' })
    );
  });

  it('emergency at recording_consent step defers to legacy (emergency gate must still fire)', () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'recording_consent',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
      text: 'chest pain cannot breathe',
      intentResult: { intent: 'emergency', confidence: 1 },
      gateCtx: {
        state: { step: 'recording_consent', collectedFields: [], updatedAt: new Date().toISOString() },
        recentMessages: [],
        intentResult: { intent: 'emergency', confidence: 1 },
        doctorSettings: null,
        text: 'chest pain cannot breathe',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });
    expect(isBookingFunnelTurn(ctx)).toBe(false);
    expect(resolveStage(ctx)).toBe('ai_open_response');
  });

  it('applyRecordingConsentDetourIfNeeded mirrors persist-sink invariant', () => {
    const detoured = applyRecordingConsentDetourIfNeeded(
      {
        branch: 'consent_flow',
        reply: 'booking link copy',
        nextState: {
          step: 'awaiting_slot_selection',
          collectedFields: [],
          updatedAt: new Date().toISOString(),
        },
      },
      { practice_name: 'Clinic X' }
    );
    expect(detoured.branch).toBe('recording_consent_injected');
    expect(detoured.nextState.step).toBe('recording_consent');
  });

  it('resolveStage routes funnel steps; fresh book-intent entry stays booking_entry (rcp-08)', () => {
    expect(
      resolveStage(
        minimalTurnCtx({
          state: {
            step: 'collecting_all',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
        })
      )
    ).toBe('booking_funnel');

    expect(
      resolveStage(
        minimalTurnCtx({
          isBookIntent: true,
          justStartingCollection: true,
          inCollection: true,
          state: {
            step: 'responded',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
        })
      )
    ).toBe('booking_entry');

    expect(
      isBookingFunnelTurn(
        minimalTurnCtx({
          state: {
            step: 'confirm_details',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
        })
      )
    ).toBe(true);
  });
});
