import { describe, expect, it } from '@jest/globals';
import {
  buildConsolidatedReasonSnippetFromMessages,
  isVagueConsultationPaymentExistenceQuestion,
  parseReasonTriageConfirmYes,
  parseReasonTriageNegationForClarify,
  shouldDeferIdleFeeForReasonFirstTriage,
  userMessageSuggestsClinicalReason,
  userWantsExplicitFullFeeList,
} from '../../../src/utils/reason-first-triage';
import type { ConversationState } from '../../../src/types/conversation';

describe('reason-first-triage', () => {
  it('does not defer vague pay-existence until short ack is sent (clinical thread)', () => {
    const state: ConversationState = {};
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'okay so i have to pay?',
      recentMessages: [{ sender_type: 'patient', content: 'blood sugar 177' }],
    });
    expect(defer).toBe(false);
  });

  it('treats colloquial "so i pay" as vague pay-existence (not reason-first deferral)', () => {
    expect(isVagueConsultationPaymentExistenceQuestion('oh so i pay ?')).toBe(true);
    expect(isVagueConsultationPaymentExistenceQuestion('so i pay?')).toBe(true);
    const state: ConversationState = {};
    expect(
      shouldDeferIdleFeeForReasonFirstTriage({
        state,
        text: 'oh so i pay?',
        recentMessages: [{ sender_type: 'patient', content: 'blood sugar 198 please guide' }],
      })
    ).toBe(false);
  });

  it('defers pricing after post-medical pay ack (same vague line can route to triage)', () => {
    const state: ConversationState = { postMedicalConsultFeeAckSent: true };
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'okay so i have to pay?',
      recentMessages: [{ sender_type: 'patient', content: 'blood sugar 177' }],
    });
    expect(defer).toBe(true);
  });

  it('defers amount-seeking pricing in clinical context (reason-first, not short-ack path)', () => {
    const state: ConversationState = {};
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'how much is the consultation?',
      recentMessages: [{ sender_type: 'patient', content: 'blood sugar 177' }],
    });
    expect(defer).toBe(true);
  });

  it('shouldDefer when thread is clinical and this turn is still a clinical follow-up', () => {
    const state: ConversationState = {};
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'also I feel dizzy lately',
      recentMessages: [{ sender_type: 'patient', content: 'blood sugar 189' }],
    });
    expect(defer).toBe(true);
  });

  it('should not defer when user asks for full fee list', () => {
    const state: ConversationState = {};
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'What are all your consultation prices?',
      recentMessages: [{ sender_type: 'patient', content: 'blood sugar high' }],
    });
    expect(defer).toBe(false);
    expect(userWantsExplicitFullFeeList('What are all your consultation prices?')).toBe(true);
  });

  it('should not defer when triage phase already active', () => {
    const state: ConversationState = { reasonFirstTriagePhase: 'ask_more' };
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'nothing else',
      recentMessages: [],
    });
    expect(defer).toBe(false);
  });

  it('userMessageSuggestsClinicalReason matches common symptoms', () => {
    expect(userMessageSuggestsClinicalReason('my blood sugar is 300')).toBe(true);
    expect(userMessageSuggestsClinicalReason('how much')).toBe(false);
  });

  it('parseReasonTriageConfirmYes and negation', () => {
    expect(parseReasonTriageConfirmYes('yes')).toBe(true);
    expect(parseReasonTriageConfirmYes('haan ji')).toBe(true);
    expect(parseReasonTriageConfirmYes('okay so i have to pay?')).toBe(false);
    expect(parseReasonTriageNegationForClarify('no')).toBe(true);
    expect(parseReasonTriageNegationForClarify('not quite')).toBe(true);
  });

  it('buildConsolidatedReasonSnippetFromMessages joins patient lines and current', () => {
    const s = buildConsolidatedReasonSnippetFromMessages(
      [
        { sender_type: 'patient', content: 'fever' },
        { sender_type: 'system', content: 'bot' },
        { sender_type: 'patient', content: 'cough' },
      ],
      'nothing else'
    );
    expect(s).toContain('fever');
    expect(s).toContain('cough');
    expect(s).toContain('nothing else');
  });
});
