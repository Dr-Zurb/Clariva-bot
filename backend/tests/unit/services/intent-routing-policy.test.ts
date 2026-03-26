/**
 * RBH-14: Context-aware intent — post-classification policy + classify context builder
 */

import { describe, expect, it } from '@jest/globals';
import {
  applyIntentPostClassificationPolicy,
  buildClassifyIntentContext,
} from '../../../src/services/ai-service';
import type { ConversationState } from '../../../src/types/conversation';

describe('RBH-14 intent routing', () => {
  describe('applyIntentPostClassificationPolicy', () => {
    it('downgrades book_appointment to ask_question in fee thread for consultation follow-up', () => {
      const state: Pick<ConversationState, 'activeFlow' | 'lastPromptKind'> = {
        activeFlow: 'fee_quote',
      };
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.95 },
        'general consultation please',
        state
      );
      expect(out.intent).toBe('ask_question');
      expect(out.confidence).toBeLessThanOrEqual(0.88);
    });

    it('keeps book_appointment when user explicitly books', () => {
      const state: Pick<ConversationState, 'activeFlow' | 'lastPromptKind'> = {
        lastPromptKind: 'fee_quote',
      };
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.95 },
        'I want to book an appointment',
        state
      );
      expect(out.intent).toBe('book_appointment');
      expect(out.confidence).toBe(0.95);
    });

    it('does not downgrade outside fee thread', () => {
      const state: Pick<ConversationState, 'activeFlow' | 'lastPromptKind'> = {};
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.9 },
        'general consultation',
        state
      );
      expect(out.intent).toBe('book_appointment');
    });

    it('does not downgrade when message has no fee/consultation cues', () => {
      const state: Pick<ConversationState, 'activeFlow' | 'lastPromptKind'> = {
        activeFlow: 'fee_quote',
      };
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.9 },
        'tomorrow afternoon',
        state
      );
      expect(out.intent).toBe('book_appointment');
    });
  });

  describe('buildClassifyIntentContext', () => {
    it('returns fee_quote goal and redacted turns', () => {
      const state: ConversationState = {
        activeFlow: 'fee_quote',
        step: 'responded',
      };
      const ctx = buildClassifyIntentContext(state, [
        { sender_type: 'patient', content: 'How much is the fee?' },
        {
          sender_type: 'system',
          content: 'Here are the fees for **Clinic**...',
        },
      ]);
      expect(ctx?.conversationGoal).toBe('fee_quote');
      expect(ctx?.recentTurns?.length).toBe(2);
      expect(ctx?.recentTurns?.[0].role).toBe('user');
      expect(ctx?.recentTurns?.[1].role).toBe('assistant');
    });

    it('returns undefined when no fee thread and no messages', () => {
      const state: ConversationState = { step: 'responded' };
      const ctx = buildClassifyIntentContext(state, []);
      expect(ctx).toBeUndefined();
    });
  });
});
