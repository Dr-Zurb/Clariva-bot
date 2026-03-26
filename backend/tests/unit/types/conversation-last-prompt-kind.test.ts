import { describe, expect, it } from '@jest/globals';
import { conversationLastPromptKindForStep } from '../../../src/types/conversation';

describe('conversationLastPromptKindForStep (RBH-07)', () => {
  it('maps gating steps to prompt kinds', () => {
    expect(conversationLastPromptKindForStep('collecting_all')).toBe('collect_details');
    expect(conversationLastPromptKindForStep('collecting_name')).toBe('collect_details');
    expect(conversationLastPromptKindForStep('confirm_details')).toBe('confirm_details');
    expect(conversationLastPromptKindForStep('consent')).toBe('consent');
    expect(conversationLastPromptKindForStep('awaiting_match_confirmation')).toBe('match_pick');
    expect(conversationLastPromptKindForStep('awaiting_cancel_confirmation')).toBe('cancel_confirm');
  });

  it('clears for non-gating or terminal steps', () => {
    expect(conversationLastPromptKindForStep(undefined)).toBeUndefined();
    expect(conversationLastPromptKindForStep('responded')).toBeUndefined();
    expect(conversationLastPromptKindForStep('awaiting_slot_selection')).toBeUndefined();
    expect(conversationLastPromptKindForStep('awaiting_cancel_choice')).toBeUndefined();
    expect(conversationLastPromptKindForStep('awaiting_reschedule_slot')).toBeUndefined();
  });

  it('RBH-13: fee_quote when activeFlow is fee_quote and step is responded', () => {
    expect(conversationLastPromptKindForStep('responded', 'fee_quote')).toBe('fee_quote');
    expect(conversationLastPromptKindForStep(undefined, 'fee_quote')).toBe('fee_quote');
  });
});
