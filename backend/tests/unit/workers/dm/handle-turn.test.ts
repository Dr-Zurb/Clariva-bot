/**
 * rcp-08: executeDmTurn pipeline tests.
 *
 * Pins the rcp-08 emergency-gate promotion: emergency is a true head gate evaluated
 * BEFORE resolveStage, so an emergency turn parked at a flow-step gate (cancel choice,
 * mid-collection) routes to `emergency_safety` and never dispatches the stage. The
 * in-collection suppression of non-acute emergency intent is preserved.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

import { executeDmTurn } from '../../../../src/workers/dm/handle-turn';
import type { DmTurnContext } from '../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../src/types/database';

function minimalTurnCtx(overrides: Partial<DmTurnContext> = {}): DmTurnContext {
  const state = { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() };
  return {
    state,
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
    intentResult: { intent: 'book_appointment', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: { practice_name: 'Test Clinic' },
    gateCtx: {
      state,
      recentMessages: [],
      intentResult: { intent: 'book_appointment', confidence: 1 },
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
    runGenerateResponse: jest.fn(async () => 'AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({}) as never),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('executeDmTurn — emergency head gate (rcp-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emergency intent preempts the cancel/reschedule step gate (awaiting_cancel_choice)', async () => {
    const state = {
      step: 'awaiting_cancel_choice',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    };
    const ctx = minimalTurnCtx({
      state,
      intentResult: { intent: 'emergency', confidence: 1 },
      text: '2',
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'emergency', confidence: 1 },
        doctorSettings: null,
        text: '2',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('emergency_safety');
    expect(result.nextState.step).toBe('responded');
    expect(result.nextState.lastIntent).toBe('emergency');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('acute emergency message preempts the funnel mid-collection (collecting_all)', async () => {
    const state = {
      step: 'collecting_all',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    };
    const ctx = minimalTurnCtx({
      state,
      inCollection: true,
      text: 'i have chest pain',
      intentResult: { intent: 'book_appointment', confidence: 1 },
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'book_appointment', confidence: 1 },
        doctorSettings: null,
        text: 'i have chest pain',
        inCollection: true,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('emergency_safety');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('non-acute emergency intent during collection stays suppressed (no emergency_safety)', async () => {
    const state = { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() };
    const ctx = minimalTurnCtx({
      state,
      inCollection: true,
      text: 'i feel a bit unwell today',
      intentResult: { intent: 'emergency', confidence: 1 },
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'emergency', confidence: 1 },
        doctorSettings: null,
        text: 'i feel a bit unwell today',
        inCollection: true,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).not.toBe('emergency_safety');
    expect(result.branch).toBe('ai_open_response');
    expect(ctx.runGenerateResponse).toHaveBeenCalledTimes(1);
  });

  it('conflictRecovery forces ai_open_response body with conflict_recovery_ai branch', async () => {
    const ctx = minimalTurnCtx();

    const result = await executeDmTurn(ctx, { conflictRecovery: true });

    expect(result.branch).toBe('conflict_recovery_ai');
    expect(ctx.runGenerateResponse).toHaveBeenCalledTimes(1);
  });
});
