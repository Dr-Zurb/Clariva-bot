import { describe, expect, it } from '@jest/globals';
import {
  buildConsolidatedReasonSnippetFromMessages,
  clinicalLedFeeThread,
  feeFollowUpAnaphora,
  formatReasonFirstFeePatienceBridgeWhileAskMore,
  isAmountSeekingPricingQuestion,
  isVagueConsultationPaymentExistenceQuestion,
  lastAssistantDmContent,
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

  it('treats “there is payment” / typos / “no free advice” as vague pay-existence (post-deflection)', () => {
    const line =
      'oh so there is payemnt ? no free advice ?';
    expect(isVagueConsultationPaymentExistenceQuestion(line)).toBe(true);
    expect(
      isVagueConsultationPaymentExistenceQuestion(
        'so there is a payment for this visit?'
      )
    ).toBe(true);
    expect(isVagueConsultationPaymentExistenceQuestion('no free advice here?')).toBe(true);
    const state: ConversationState = {};
    expect(
      shouldDeferIdleFeeForReasonFirstTriage({
        state,
        text: line,
        recentMessages: [
          { sender_type: 'patient', content: 'blood sugar was 199 fasting' },
        ],
      })
    ).toBe(false);
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

  it('buildConsolidatedReasonSnippetFromMessages joins clinical patient lines; omits triage fillers and payment lines', () => {
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
    expect(s).not.toContain('nothing else');
    const withPay = buildConsolidatedReasonSnippetFromMessages(
      [
        { sender_type: 'patient', content: 'blood sugar 199' },
        { sender_type: 'patient', content: 'okay how much do i pay?' },
      ],
      ''
    );
    expect(withPay).toContain('blood sugar');
    expect(withPay).not.toContain('how much');
  });

  it('lastAssistantDmContent returns latest non-patient message with text', () => {
    expect(
      lastAssistantDmContent([
        { sender_type: 'patient', content: 'fever' },
        { sender_type: 'system', content: 'Consultation fee applies.' },
      ])
    ).toBe('Consultation fee applies.');
  });

  it('isAmountSeekingPricingQuestion detects how-much without requiring book intent', () => {
    expect(isAmountSeekingPricingQuestion('okay how much do i pay?')).toBe(true);
    expect(isAmountSeekingPricingQuestion('so i have to pay first?')).toBe(false);
  });

  it('feeFollowUpAnaphora after fee-themed bot turn', () => {
    const bot = 'Yes — there is a consultation fee for this visit.';
    expect(feeFollowUpAnaphora('what is it?', bot)).toBe(true);
    expect(feeFollowUpAnaphora("what's that?", bot)).toBe(true);
    expect(feeFollowUpAnaphora('how much?', bot)).toBe(true);
    expect(feeFollowUpAnaphora('what is it then ? the fee?', bot)).toBe(true);
    expect(feeFollowUpAnaphora('what is it?', 'Hello — how can I help?')).toBe(false);
    expect(feeFollowUpAnaphora('book appointment', bot)).toBe(false);
  });

  it('fee patience bridge embeds reason snippet and short head after post-med ack', () => {
    const snippet = 'hello doc , so i check my blood sugar today it came out to be 199 , how do i fix it';
    const out = formatReasonFirstFeePatienceBridgeWhileAskMore('so what is it then ? the fee ?', {
      reasonSnippet: snippet,
      recentPostMedicalFeeAck: true,
    });
    expect(out).toContain('**So far we\'ve noted:**');
    expect(out).toContain('199');
    expect(out).toContain('**Understood**');
    expect(out).toContain('before we share the fee');
    expect(out).not.toMatch(/Absolutely — we share the \*\*fee\*\* as soon as we've \*\*confirmed your reason for visit\*\*/);
  });

  it('fee patience bridge uses longer preamble when no post-med ack flag', () => {
    const out = formatReasonFirstFeePatienceBridgeWhileAskMore('how much is consult', {
      reasonSnippet: 'knee pain',
      recentPostMedicalFeeAck: false,
    });
    expect(out).toContain('**Absolutely**');
    expect(out).toContain('**knee pain**');
  });

  it('clinicalLedFeeThread when triage, clinical patient line, or related state flags', () => {
    expect(
      clinicalLedFeeThread({ state: { reasonFirstTriagePhase: 'ask_more' }, recentMessages: [] })
    ).toBe(true);
    expect(
      clinicalLedFeeThread({
        state: {},
        recentMessages: [{ sender_type: 'patient', content: 'blood sugar 220' }],
      })
    ).toBe(true);
    expect(
      clinicalLedFeeThread({ state: {}, recentMessages: [{ sender_type: 'patient', content: 'hi' }] })
    ).toBe(false);
  });
});
