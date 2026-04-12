import { describe, expect, it } from '@jest/globals';
import {
  bookingShouldDeferToReasonFirstTriage,
  buildConsolidatedReasonSnippetFromMessages,
  clinicalLedFeeThread,
  distillPatientReasonLinesFromMessage,
  feeFollowUpAnaphora,
  formatReasonFirstFeePatienceBridgeWhileAskMore,
  isAmountSeekingPricingQuestion,
  isVagueConsultationPaymentExistenceQuestion,
  lastAssistantDmContent,
  lastBotAskedAnythingElseBeforeFee,
  parseReasonFirstAskMoreAmbiguousYes,
  parseReasonTriageConfirmYes,
  parseReasonTriageNegationForClarify,
  shouldDeferIdleFeeForReasonFirstTriage,
  userMessageSuggestsClinicalReason,
  userWantsExplicitFullFeeList,
  parseNothingElseOrSameOnly,
} from '../../../src/utils/reason-first-triage';
import type { ConversationState } from '../../../src/types/conversation';

describe('reason-first-triage', () => {
  describe('lastBotAskedAnythingElseBeforeFee + parseReasonFirstAskMoreAmbiguousYes', () => {
    it('detects the pre-fee anything-else prompt', () => {
      expect(
        lastBotAskedAnythingElseBeforeFee(
          'Anything else before we share the fee for this visit?'
        )
      ).toBe(true);
      expect(lastBotAskedAnythingElseBeforeFee('How can I help?')).toBe(false);
    });

    it('bare yes/yep means more to add, not confirm', () => {
      expect(parseReasonFirstAskMoreAmbiguousYes('yes')).toBe(true);
      expect(parseReasonFirstAskMoreAmbiguousYes('yeah!')).toBe(true);
      expect(parseReasonFirstAskMoreAmbiguousYes('yes please book')).toBe(false);
    });
  });

  describe('parseNothingElseOrSameOnly', () => {
    it('treats "thats it thanks" and "that\'s it" as wrap-up (closed dialog acts)', () => {
      expect(parseNothingElseOrSameOnly('thats it thanks')).toBe(true);
      expect(parseNothingElseOrSameOnly("that's it")).toBe(true);
      expect(parseNothingElseOrSameOnly('thats it.')).toBe(true);
    });
  });

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
    expect(userMessageSuggestsClinicalReason('hypertension follow-up')).toBe(true);
    expect(userMessageSuggestsClinicalReason('how much')).toBe(false);
  });

  it('bookingShouldDeferToReasonFirstTriage when clinical in thread and reason not finalized', () => {
    expect(
      bookingShouldDeferToReasonFirstTriage({
        state: {},
        text: 'please book',
        recentMessages: [{ sender_type: 'patient', content: 'fasting blood sugar 208' }],
      })
    ).toBe(true);
  });

  it('bookingShouldDeferToReasonFirstTriage false when reasonForVisit already set', () => {
    expect(
      bookingShouldDeferToReasonFirstTriage({
        state: { reasonForVisit: 'diabetes follow-up' },
        text: 'book now',
        recentMessages: [{ sender_type: 'patient', content: 'fasting blood sugar 208' }],
      })
    ).toBe(false);
  });

  it('bookingShouldDeferToReasonFirstTriage false when triage phase active', () => {
    expect(
      bookingShouldDeferToReasonFirstTriage({
        state: { reasonFirstTriagePhase: 'ask_more' },
        text: 'book',
        recentMessages: [],
      })
    ).toBe(false);
  });

  it('bookingShouldDeferToReasonFirstTriage true when current line is clinical', () => {
    expect(
      bookingShouldDeferToReasonFirstTriage({
        state: {},
        text: 'blood sugar 180 and I want to book',
        recentMessages: [],
      })
    ).toBe(true);
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
    expect(s.toLowerCase()).toContain('fever');
    expect(s.toLowerCase()).toContain('cough');
    expect(s).toMatch(/1\)\s*fever/i);
    expect(s).toMatch(/2\)\s*cough/i);
    expect(s).not.toContain('nothing else');
    const withPay = buildConsolidatedReasonSnippetFromMessages(
      [
        { sender_type: 'patient', content: 'blood sugar 199' },
        { sender_type: 'patient', content: 'okay how much do i pay?' },
      ],
      ''
    );
    expect(withPay.toLowerCase()).toContain('blood sugar');
    expect(withPay).not.toContain('how much');
  });

  it('fallback snippet: one line per patient bubble, light strips only (LLM owns splitting)', () => {
    const snippet = buildConsolidatedReasonSnippetFromMessages(
      [
        {
          sender_type: 'patient',
          content:
            'hello doc, today i checked my blood sugar to be 199 , how do i fix it , it was fasting',
        },
        { sender_type: 'patient', content: 'how muc' },
        {
          sender_type: 'patient',
          content: 'i also have hypertension , burning sensation in my stomach',
        },
      ],
      ''
    );
    expect(snippet.toLowerCase()).toMatch(/199/);
    expect(snippet.toLowerCase()).toMatch(/blood\s*sugar/);
    expect(snippet.toLowerCase()).toMatch(/fasting/);
    expect(snippet.toLowerCase()).toContain('hypertension');
    expect(snippet.toLowerCase()).toContain('burning');
    expect(snippet).not.toContain('hello doc');
    expect(snippet).not.toContain('how do i fix');
    expect(snippet).not.toMatch(/how\s+muc/i);
    expect(snippet).toMatch(/1\)\s*.+199/is);
    expect(snippet.toLowerCase()).toMatch(/2\)\s*.+hypertension/s);
  });

  it('feeFollowUpAnaphora treats typo how muc as fee follow-up', () => {
    const bot = 'Yes — there is a consultation fee for this visit.';
    expect(feeFollowUpAnaphora('how muc', bot)).toBe(true);
  });

  it('merges current patient bubble with history (fee-bridge must pass current text, not empty string)', () => {
    const recent = [
      {
        sender_type: 'patient',
        content:
          'hello doc, my blood sugar today came out to be 208, guide me towards managing it, this was fasting sugar',
      },
    ];
    const followUp =
      'i have hypertension too and sometimes there is burning feel in my stomach i feel lethargic often too';
    const withoutCurrent = buildConsolidatedReasonSnippetFromMessages(recent, '');
    const withCurrent = buildConsolidatedReasonSnippetFromMessages(recent, followUp);
    expect(withoutCurrent.toLowerCase()).toContain('208');
    expect(withoutCurrent.toLowerCase()).not.toContain('hypertension');
    expect(withCurrent.toLowerCase()).toContain('208');
    expect(withCurrent.toLowerCase()).toContain('hypertension');
    expect(withCurrent.toLowerCase()).toMatch(/burn|stomach/);
    expect(withCurrent.toLowerCase()).toMatch(/lethargy|lethargic|lethagic|fatigue|tired/);
  });

  it('fallback keeps clinical wording; strips greeting and small talk only', () => {
    const snippet = buildConsolidatedReasonSnippetFromMessages(
      [
        {
          sender_type: 'patient',
          content:
            'hello doc how are you ? i checked my blood sugar today it came out to be 199 , how do i fix it ?',
        },
      ],
      ''
    );
    expect(snippet.toLowerCase()).toMatch(/199/);
    expect(snippet.toLowerCase()).toMatch(/blood\s*sugar/);
    expect(snippet).not.toMatch(/how are you/i);
    expect(snippet).not.toContain('how do i fix');
  });

  it('strips embedded pricing typo from a single clinical message', () => {
    const oneBubble = buildConsolidatedReasonSnippetFromMessages(
      [
        {
          sender_type: 'patient',
          content:
            'hello doc, today i checked my blood sugar to be 199 , it was fasting how muc',
        },
        { sender_type: 'patient', content: 'i also have hypertension' },
      ],
      ''
    );
    expect(oneBubble.toLowerCase()).toMatch(/199/);
    expect(oneBubble.toLowerCase()).toMatch(/fasting|blood\s*sugar/);
    expect(oneBubble.toLowerCase()).toContain('hypertension');
    expect(oneBubble).not.toMatch(/how\s+muc/i);
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

  it('fallback: single bubble stays one line (LLM splits multi-clause text when enabled)', () => {
    const raw =
      "sometimes i also feels burning sensation in my stomach, uh yes, i would like to discuss my hypertension, i have fast also, there is sometimes there's burning feeling in my stomach, i also often feel lethagic too";
    const lines = distillPatientReasonLinesFromMessage(raw);
    expect(lines.length).toBe(1);
    const flat = lines[0].toLowerCase();
    expect(flat).toContain('hypertension');
    expect(flat).toMatch(/burning/);
    expect(flat).toMatch(/lethagic/);
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
