import { describe, expect, it } from '@jest/globals';
import {
  isConversationStage,
  normalizePersistedStep,
  setStage,
  stageOf,
  type ConversationState,
} from '../../../src/types/conversation';
import { readConversationState } from '../../../src/types/conversation-state-io';

describe('stageOf / setStage (rcp-18/19)', () => {
  it('stageOf maps deprecated slot steps to awaiting_slot_selection on read', () => {
    expect(stageOf(readConversationState({ step: 'confirming_slot' }))).toBe(
      'awaiting_slot_selection'
    );
    expect(stageOf(readConversationState({ step: 'selecting_slot' }))).toBe(
      'awaiting_slot_selection'
    );
    expect(stageOf(readConversationState({ step: 'responded' }))).toBe('responded');
  });

  it('setStage writes step; undefined removes step', () => {
    const base: ConversationState = { lastIntent: 'book_appointment' };
    const withStep = setStage(base, 'collecting_all');
    expect(stageOf(withStep)).toBe('collecting_all');
    const cleared = setStage(withStep, undefined);
    expect(stageOf(cleared)).toBeUndefined();
    expect(cleared).not.toHaveProperty('step');
  });

  it('normalizePersistedStep folds unknown legacy strings to responded', () => {
    expect(normalizePersistedStep('custom_legacy_step_value')).toBe('responded');
    expect(isConversationStage('awaiting_cancel_choice')).toBe(true);
    expect(isConversationStage('custom_legacy_step_value')).toBe(false);
  });
});
