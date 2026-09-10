/**
 * SAFETY ratchet invariant: acute emergency phrases escalate across funnel steps.
 * Conversation state (inCollection / collecting_*) must never suppress eligibility.
 */

import { describe, expect, it } from '@jest/globals';
import {
  applyEmergencyNumberFloor,
  assistantMessageIsEmergencyEscalationCopy,
  EMERGENCY_REAFFIRM_RESPONSE_EN,
  EMERGENCY_RESPONSE_EN,
  isEmergencyUserMessage,
  resolveSafetyMessage,
} from '../../../src/utils/safety-messages';
import {
  emergencyGate,
  markEmergencyCrisisOpen,
  openCrisisGate,
  type DmGateContext,
} from '../../../src/workers/dm/control-gates';
import {
  isOpenEmergencyCrisis,
  type ConversationState,
} from '../../../src/types/conversation';

const ACUTE_PHRASES = [
  'wife collapsed can\'t wake her',
  'chest pain and can\'t breathe',
  'mild chest discomfort after gym',
  'emergency',
  'saans nahi aa rahi behosh ho gayi',
  'kisi ne zahar kha liya',
  'I need emergency help',
] as const;

const FUNNEL_STEPS: Array<{ step: ConversationState['step']; inCollection: boolean }> = [
  { step: undefined, inCollection: false },
  { step: 'responded', inCollection: false },
  { step: 'collecting_all', inCollection: true },
  { step: 'confirm_details', inCollection: true },
  { step: 'consent', inCollection: true },
  { step: 'awaiting_slot_selection', inCollection: false },
  { step: 'awaiting_complaint_clarification', inCollection: true },
];

function gateCtx(overrides: Partial<DmGateContext> = {}): DmGateContext {
  const state: ConversationState = {
    step: 'responded',
    collectedFields: [],
    updatedAt: new Date().toISOString(),
    ...overrides.state,
  };
  return {
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
    ...overrides,
  };
}

describe('emergency SAFETY ratchet invariant', () => {
  it('acute corpus matches isEmergencyUserMessage', () => {
    for (const phrase of ACUTE_PHRASES) {
      expect(isEmergencyUserMessage(phrase)).toBe(true);
    }
  });

  it('regex-hit phrases fire emergencyGate across funnel steps (inCollection irrelevant)', () => {
    for (const phrase of ACUTE_PHRASES) {
      for (const funnel of FUNNEL_STEPS) {
        const ctx = gateCtx({
          text: phrase,
          inCollection: funnel.inCollection,
          intentResult: { intent: 'greeting', confidence: 0.5 },
          state: {
            step: funnel.step,
            collectedFields: funnel.inCollection ? ['name'] : [],
            updatedAt: new Date().toISOString(),
          },
        });
        expect(emergencyGate.fires(ctx)).toBe(true);
      }
    }
  });

  it('LLM-only emergency intent fires mid-collection without acute regex', () => {
    const ctx = gateCtx({
      text: 'help my father seems unresponsive after falling',
      inCollection: true,
      intentResult: { intent: 'emergency', confidence: 0.91 },
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
    });
    // May or may not be regex; intent alone must suffice.
    expect(emergencyGate.fires(ctx)).toBe(true);
  });

  it('first escalation uses hospital-capable copy; reaffirm uses call-dispatch copy', async () => {
    const first = await emergencyGate.handle(
      gateCtx({
        text: 'wife collapsed can\'t wake her',
        intentResult: { intent: 'emergency', confidence: 1 },
      })
    );
    expect(first).toMatchObject({ branch: 'emergency_safety' });
    expect(first.reply).toBe(EMERGENCY_RESPONSE_EN);
    expect(assistantMessageIsEmergencyEscalationCopy(first.reply)).toBe(true);

    const reaffirm = await emergencyGate.handle(
      gateCtx({
        text: 'no hospital nearby',
        intentResult: { intent: 'emergency', confidence: 0.9 },
        recentMessages: [
          { sender_type: 'patient', content: 'wife collapsed' },
          { sender_type: 'system', content: EMERGENCY_RESPONSE_EN },
        ],
      })
    );
    expect(reaffirm.reply).toBe(EMERGENCY_REAFFIRM_RESPONSE_EN);
    expect(reaffirm.reply.toLowerCase()).not.toContain('nearest hospital');
    expect(assistantMessageIsEmergencyEscalationCopy(reaffirm.reply)).toBe(true);
  });

  it('localized reaffirm + first copies are recognized as escalation', () => {
    for (const lang of ['en', 'hi', 'pa', 'hi-Latn', 'pa-Latn'] as const) {
      const first = resolveSafetyMessage('emergency', lang, { emergencyVariant: 'first' });
      const reaffirm = resolveSafetyMessage('emergency', lang, { emergencyVariant: 'reaffirm' });
      expect(assistantMessageIsEmergencyEscalationCopy(first)).toBe(true);
      expect(assistantMessageIsEmergencyEscalationCopy(reaffirm)).toBe(true);
    }
  });

  it('emergencyGate persists safety.escalatedAt', async () => {
    const result = await emergencyGate.handle(
      gateCtx({
        text: 'papa behosh padhe hain floor pe',
        intentResult: { intent: 'greeting', confidence: 0.4 },
      })
    );
    expect(result.nextState.safety?.escalatedAt).toBeTruthy();
    expect(isOpenEmergencyCrisis(result.nextState)).toBe(true);
  });

  it('openCrisisGate reaffirms vague follow-ups while crisis is open (kuch batao)', async () => {
    const ctx = gateCtx({
      text: 'kuch batao',
      intentResult: { intent: 'medical_query', confidence: 0.8 },
      state: {
        step: 'responded',
        safety: { escalatedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      },
    });
    expect(emergencyGate.fires(ctx)).toBe(false);
    expect(openCrisisGate.fires(ctx)).toBe(true);
    const result = await openCrisisGate.handle(ctx);
    expect(result.branch).toBe('emergency_safety');
    expect(result.reply).toBe(EMERGENCY_REAFFIRM_RESPONSE_EN);
    expect(isOpenEmergencyCrisis(result.nextState)).toBe(true);
  });

  it('openCrisisGate does not fire on positive stability (booking resume allowlist)', () => {
    const ctx = gateCtx({
      text: 'I am stable now, can I book?',
      intentResult: { intent: 'medical_query', confidence: 0.85 },
      state: {
        step: 'responded',
        safety: { escalatedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      },
    });
    expect(openCrisisGate.fires(ctx)).toBe(false);
  });

  it('number floor + markEmergencyCrisisOpen enables open-crisis reaffirm on follow-up', () => {
    const improvised =
      "I'm really sorry you're dealing with an emergency. Please call your local emergency number " +
      'right now or go to the nearest emergency department.';
    const floored = applyEmergencyNumberFloor(improvised, 'en');
    expect(floored.applied).toBe(true);
    expect(assistantMessageIsEmergencyEscalationCopy(floored.reply)).toBe(true);

    const afterFloor = markEmergencyCrisisOpen({
      step: 'responded',
      updatedAt: new Date().toISOString(),
    });
    expect(isOpenEmergencyCrisis(afterFloor)).toBe(true);

    const followUp = gateCtx({
      text: 'listen first please',
      intentResult: { intent: 'ask_question', confidence: 0.5 },
      state: afterFloor,
    });
    expect(openCrisisGate.fires(followUp)).toBe(true);
  });
});
