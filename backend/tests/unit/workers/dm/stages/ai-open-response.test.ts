/**
 * rcp-08: Default AI open-response stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { aiOpenResponseStage } from '../../../../../src/workers/dm/stages/ai-open-response';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';

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
    text: 'what are your hours?',
    recentMessages: [],
    intentResult: { intent: 'unknown', confidence: 1 },
    doctorSettings: null,
    doctorContext: undefined,
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'unknown', confidence: 1 },
      doctorSettings: null,
      text: 'what are your hours?',
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
    runGenerateResponse: jest.fn(async () => 'Open AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'Open AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({})),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('aiOpenResponseStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ai_open_response branch', async () => {
    const ctx = minimalTurnCtx();
    const result = await aiOpenResponseStage.handle(ctx);
    expect(result.branch).toBe('ai_open_response');
    expect(result.reply).toBe('Open AI reply');
  });

  it('resolveStage default is ai_open_response when no earlier stage claims', () => {
    expect(resolveStage(minimalTurnCtx())).toBe('ai_open_response');
  });
});
