/**
 * rcp-08 / SAFETY-01: executeDmTurn pipeline tests.
 *
 * Emergency is in HEAD_CONTROL_GATES before pause and before resolveStage, so an
 * emergency turn parked at a flow-step gate (or while the doctor is paused) routes
 * to `emergency_safety`. Classified emergency intent escalates mid-collection too.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

import { executeDmTurn } from '../../../../src/workers/dm/handle-turn';
import type { DmTurnContext } from '../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../src/types/database';
import type { ConversationState } from '../../../../src/types/conversation';

function minimalTurnCtx(overrides: Partial<DmTurnContext> = {}): DmTurnContext {
  const state: ConversationState = {
    step: 'responded',
    collectedFields: [],
    updatedAt: new Date().toISOString(),
  };
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
    turnLanguage: 'en',
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
    const state: ConversationState = {
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
        turnLanguage: 'en',
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
    const state: ConversationState = {
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
        turnLanguage: 'en',
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

  it('open crisis: vague medical_query follow-up reaffirms instead of medical deflection', async () => {
    const state: ConversationState = {
      step: 'responded',
      collectedFields: [],
      safety: { escalatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    };
    const ctx = minimalTurnCtx({
      state,
      text: 'kuch batao',
      intentResult: { intent: 'medical_query', confidence: 0.88 },
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'medical_query', confidence: 0.88 },
        doctorSettings: null,
        text: 'kuch batao',
        turnLanguage: 'en',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('emergency_safety');
    expect(result.reply.toLowerCase()).toContain('112');
    expect(result.reply.toLowerCase()).not.toContain('scheduling assistant');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('LLM emergency intent during collection escalates to emergency_safety', async () => {
    const state: ConversationState = {
      step: 'collecting_all',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    };
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
        turnLanguage: 'en',
        inCollection: true,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('emergency_safety');
    expect(result.nextState.lastIntent).toBe('emergency');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('conflictRecovery forces ai_open_response body with conflict_recovery_ai branch', async () => {
    const ctx = minimalTurnCtx();

    const result = await executeDmTurn(ctx, { conflictRecovery: true });

    expect(result.branch).toBe('conflict_recovery_ai');
    expect(ctx.runGenerateResponse).toHaveBeenCalledTimes(1);
  });

  it('SAFETY-01: acute emergency preempts receptionist pause', async () => {
    const state: ConversationState = {
      step: 'responded',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    };
    const paused = {
      timezone: 'Asia/Kolkata',
      instagram_receptionist_paused: true,
    } as never;
    const ctx = minimalTurnCtx({
      state,
      doctorSettings: paused,
      text: 'chest pain and cant breathe',
      intentResult: { intent: 'book_appointment', confidence: 1 },
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'book_appointment', confidence: 1 },
        doctorSettings: paused,
        text: 'chest pain and cant breathe',
        turnLanguage: 'en',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('emergency_safety');
    expect(result.nextState.lastIntent).toBe('emergency');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });

  it('SAFETY-01: paused non-emergency still receptionist_paused', async () => {
    const state: ConversationState = {
      step: 'responded',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    };
    const paused = {
      timezone: 'Asia/Kolkata',
      instagram_receptionist_paused: true,
    } as never;
    const ctx = minimalTurnCtx({
      state,
      doctorSettings: paused,
      text: 'book me for tomorrow',
      intentResult: { intent: 'book_appointment', confidence: 1 },
      gateCtx: {
        state,
        recentMessages: [],
        intentResult: { intent: 'book_appointment', confidence: 1 },
        doctorSettings: paused,
        text: 'book me for tomorrow',
        turnLanguage: 'en',
        inCollection: false,
        conversationId: 'conv-1',
        patientId: 'patient-1',
        correlationId: 'corr-1',
      },
    });

    const result = await executeDmTurn(ctx);

    expect(result.branch).toBe('receptionist_paused');
    expect(ctx.runGenerateResponse).not.toHaveBeenCalled();
  });
});
