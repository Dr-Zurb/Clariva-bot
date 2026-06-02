/**
 * RBH-06 / rcp-19: legacy selecting_slot / confirming_slot normalized on read
 */

import { describe, expect, it } from '@jest/globals';
import { readConversationState } from '../../../src/types/conversation-state-io';

describe('legacy slot steps on read (RBH-06 / rcp-19)', () => {
  it('maps selecting_slot to awaiting_slot_selection and drops slotSelectionDate', () => {
    const state = readConversationState({
      step: 'selecting_slot',
      slotSelectionDate: '2026-05-30',
    });
    expect(state.step).toBe('awaiting_slot_selection');
    expect(state.booking?.slotSelectionDate).toBeUndefined();
  });

  it('maps confirming_slot to awaiting_slot_selection and drops slotToConfirm', () => {
    const state = readConversationState({
      step: 'confirming_slot',
      slotToConfirm: { start: '2026-05-30T09:00:00.000Z', end: '2026-05-30T09:30:00.000Z' },
    });
    expect(state.step).toBe('awaiting_slot_selection');
    expect(state.booking?.slotToConfirm).toBeUndefined();
  });
});
