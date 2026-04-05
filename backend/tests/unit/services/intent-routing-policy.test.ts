/**
 * RBH-14: Context-aware intent — post-classification policy + classify context builder
 */

import { describe, expect, it } from '@jest/globals';
import {
  applyIntentPostClassificationPolicy,
  buildClassifyIntentContext,
  classifierSignalsAmountSeeking,
  classifierSignalsFeeThreadContinuation,
  classifierSignalsPaymentExistence,
  intentSignalsFeeOrPricing,
} from '../../../src/services/ai-service';
import type { ConversationState } from '../../../src/types/conversation';

describe('RBH-14 intent routing', () => {
  describe('applyIntentPostClassificationPolicy', () => {
    it('downgrades book_appointment to ask_question in fee thread for consultation follow-up', () => {
      const state: Pick<
        ConversationState,
        'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'
      > = {
        activeFlow: 'fee_quote',
      };
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.95 },
        'general consultation please',
        state
      );
      expect(out.intent).toBe('ask_question');
      expect(out.confidence).toBeLessThanOrEqual(0.88);
      expect(out.is_fee_question).toBe(true);
      expect(out.topics).toContain('pricing');
    });

    it('downgrades book_appointment during reason-first triage for pricing-shaped follow-up', () => {
      const state: Pick<
        ConversationState,
        'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'
      > = {
        reasonFirstTriagePhase: 'confirm',
      };
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.95 },
        'how much for video',
        state
      );
      expect(out.intent).toBe('ask_question');
    });

    it('keeps book_appointment when user explicitly books', () => {
      const state: Pick<
        ConversationState,
        'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'
      > = {
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
      const state: Pick<
        ConversationState,
        'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'
      > = {};
      const out = applyIntentPostClassificationPolicy(
        { intent: 'book_appointment', confidence: 0.9 },
        'general consultation',
        state
      );
      expect(out.intent).toBe('book_appointment');
    });

    it('does not downgrade when message has no fee/consultation cues', () => {
      const state: Pick<
        ConversationState,
        'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'
      > = {
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

    it('returns post_medical_deflection goal when lastMedicalDeflectionAt is recent', () => {
      const state: ConversationState = {
        step: 'responded',
        lastMedicalDeflectionAt: new Date().toISOString(),
      };
      const ctx = buildClassifyIntentContext(state, []);
      expect(ctx?.conversationGoal).toBe('post_medical_deflection');
    });

    it('prefers fee_quote over post_medical_deflection when both apply', () => {
      const state: ConversationState = {
        step: 'responded',
        activeFlow: 'fee_quote',
        lastMedicalDeflectionAt: new Date().toISOString(),
      };
      const ctx = buildClassifyIntentContext(state, []);
      expect(ctx?.conversationGoal).toBe('fee_quote');
    });

    it('prefers reason_first_triage over post_medical_deflection and fee_quote', () => {
      const state: ConversationState = {
        step: 'responded',
        reasonFirstTriagePhase: 'ask_more',
        activeFlow: 'fee_quote',
        lastMedicalDeflectionAt: new Date().toISOString(),
      };
      const ctx = buildClassifyIntentContext(state, []);
      expect(ctx?.conversationGoal).toBe('reason_first_triage');
    });

    it('omits post_medical_deflection when deflection timestamp is older than TTL', () => {
      const stale = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
      const state: ConversationState = {
        step: 'responded',
        lastMedicalDeflectionAt: stale,
      };
      const ctx = buildClassifyIntentContext(state, []);
      expect(ctx).toBeUndefined();
    });
  });

  describe('intentSignalsFeeOrPricing (RBH-18)', () => {
    it('uses classifier is_fee_question without fee keywords in text', () => {
      expect(
        intentSignalsFeeOrPricing(
          { intent: 'book_appointment', confidence: 0.9, is_fee_question: true },
          'phone pe ho jayega consultation?'
        )
      ).toBe(true);
    });

    it('uses topics pricing from classifier', () => {
      expect(
        intentSignalsFeeOrPricing(
          { intent: 'ask_question', confidence: 0.9, topics: ['pricing'] },
          'random words no money'
        )
      ).toBe(true);
    });

    it('falls back to keyword helper when classifier omits fee fields', () => {
      expect(
        intentSignalsFeeOrPricing(
          { intent: 'ask_question', confidence: 0.9 },
          'how much is the consultation fee'
        )
      ).toBe(true);
    });
  });

  describe('e-task-dm-06 classifier pricing sub-signals', () => {
    it('classifierSignalsPaymentExistence when confident and kind matches', () => {
      expect(
        classifierSignalsPaymentExistence({
          intent: 'ask_question',
          confidence: 0.85,
          pricing_signal_kind: 'payment_existence',
        })
      ).toBe(true);
    });

    it('classifierSignalsPaymentExistence false when confidence below threshold', () => {
      expect(
        classifierSignalsPaymentExistence({
          intent: 'ask_question',
          confidence: 0.4,
          pricing_signal_kind: 'payment_existence',
        })
      ).toBe(false);
    });

    it('classifierSignalsAmountSeeking when confident', () => {
      expect(
        classifierSignalsAmountSeeking({
          intent: 'ask_question',
          confidence: 0.9,
          pricing_signal_kind: 'amount_seeking',
        })
      ).toBe(true);
    });

    it('classifierSignalsFeeThreadContinuation requires fee-thread flag and fee bot line', () => {
      expect(
        classifierSignalsFeeThreadContinuation(
          { intent: 'ask_question', confidence: 0.88, fee_thread_continuation: true },
          'Video consult is ₹400.'
        )
      ).toBe(true);
      expect(
        classifierSignalsFeeThreadContinuation(
          { intent: 'ask_question', confidence: 0.88, fee_thread_continuation: true },
          'Hello — how can I help?'
        )
      ).toBe(false);
      expect(
        classifierSignalsFeeThreadContinuation(
          { intent: 'ask_question', confidence: 0.88, fee_thread_continuation: false },
          'Consultation fee applies.'
        )
      ).toBe(false);
    });
  });
});
