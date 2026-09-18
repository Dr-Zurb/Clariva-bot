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

import { bookingFunnelStage } from '../../../../../src/workers/dm/stages/booking-funnel';
import { isBookingFunnelTurn } from '../../../../../src/workers/dm/stages/booking-funnel-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';
import { persistPatientAfterConsent } from '../../../../../src/services/consent-service';
import { readConversationState } from '../../../../../src/types/conversation-state-io';
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
    text: 'yes',
    turnLanguage: 'en',
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

  it('rec-09: persisted recording_consent hydrates to awaiting_slot_selection and sends the booking link', async () => {
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../fixtures/conversation-state/legacy/recording-consent.json'),
        'utf-8'
      )
    ) as Record<string, unknown>;
    const hydrated = readConversationState(fixture);
    expect(hydrated.step).toBe('awaiting_slot_selection');

    const ctx = minimalTurnCtx({
      state: hydrated,
      text: 'ok',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.nextState).not.toHaveProperty('recordingConsent');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toContain('audio-recorded as part of the medical record');
    expect(result.reply).not.toMatch(/are you ok with this consult being recorded/i);
  });

  it('consent granted → awaiting_slot_selection with booking link (no recording ask)', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'consent',
        collectedFields: ['name', 'phone', 'reason_for_visit'],
        updatedAt: new Date().toISOString(),
      },
      text: 'yes',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toContain('audio-recorded as part of the medical record');
    expect(result.reply).not.toMatch(/are you ok with this consult being recorded/i);
  });

  it('mca-16: lastBotAskedForDetails with no step hands /book (no extract)', async () => {
    const ctx = minimalTurnCtx({
      state: {
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
      lastBotAskedForDetails: true,
      text: 'Ravi Kumar, 34, male, 9876543210, knee pain',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/Ravi|9876543210|full name|reason for visit/i);
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('mca-16: implicit confirm_details prompt hands /book', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'responded',
        lastPromptKind: 'confirm_details',
        collectedFields: ['name', 'phone'],
        updatedAt: new Date().toISOString(),
      },
      text: 'yes looks good',
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/please confirm|i agree/i);
  });

  it('mca-15: collecting_all hands the owned-page link instead of asking for details', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'collecting_all',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
      text: 'I want to book',
      inCollection: true,
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/full name|reason for visit|i agree/i);
    expect(persistPatientAfterConsent).not.toHaveBeenCalled();
  });

  it('mca-11: awaiting_slot_selection does not restart in-thread intake', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'awaiting_slot_selection',
        collectedFields: [],
        booking: { bookingLinkSentAt: new Date().toISOString() },
        bookingForOther: { pendingSelfBooking: true },
        updatedAt: new Date().toISOString(),
      },
      text: 'book for myself',
      isBookIntent: true,
    });

    const result = await bookingFunnelStage.handle(ctx);
    expect(result.branch).toBe('slot_selection');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.reply).toContain('https://example.com/book');
    expect(result.reply).not.toMatch(/full name|reason for visit|i agree/i);
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('emergency at folded-forward recording_consent (now awaiting_slot_selection) still defers to the emergency gate', () => {
    const folded = readConversationState({
      step: 'recording_consent',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    });
    const ctx = minimalTurnCtx({
      state: folded,
      text: 'chest pain cannot breathe',
      intentResult: { intent: 'emergency', confidence: 1 },
      gateCtx: {
        state: folded,
        recentMessages: [],
        intentResult: { intent: 'emergency', confidence: 1 },
        doctorSettings: null,
        text: 'chest pain cannot breathe',
        turnLanguage: 'en',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });
    expect(isBookingFunnelTurn(ctx)).toBe(false);
    expect(resolveStage(ctx)).toBe('ai_open_response');
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
