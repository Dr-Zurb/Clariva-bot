import { describe, expect, it } from '@jest/globals';
import {
  buildConsolidatedReasonSnippetFromMessages,
  parseReasonTriageConfirmYes,
  parseReasonTriageNegationForClarify,
  shouldDeferIdleFeeForReasonFirstTriage,
  userMessageSuggestsClinicalReason,
  userWantsExplicitFullFeeList,
} from '../../../src/utils/reason-first-triage';
import type { ConversationState } from '../../../src/types/conversation';

describe('reason-first-triage', () => {
  it('shouldDefer when thread has clinical reason and no phase yet', () => {
    const state: ConversationState = {};
    const defer = shouldDeferIdleFeeForReasonFirstTriage({
      state,
      text: 'how much for video',
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
