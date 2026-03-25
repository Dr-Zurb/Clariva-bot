/**
 * RBH-06: normalize legacy selecting_slot / confirming_slot
 */

import { describe, it, expect } from '@jest/globals';
import { normalizeLegacySlotConversationSteps } from '../../../src/services/conversation-service';
import type { ConversationState } from '../../../src/types/conversation';

describe('normalizeLegacySlotConversationSteps (RBH-06)', () => {
  it('returns same reference when step is not legacy', () => {
    const s: ConversationState = { step: 'awaiting_slot_selection' };
    expect(normalizeLegacySlotConversationSteps(s)).toBe(s);
  });

  it('maps selecting_slot to awaiting_slot_selection and drops slotSelectionDate', () => {
    const s: ConversationState = {
      step: 'selecting_slot',
      slotSelectionDate: '2026-04-01',
      lastIntent: 'book_appointment',
    };
    const out = normalizeLegacySlotConversationSteps(s);
    expect(out).not.toBe(s);
    expect(out.step).toBe('awaiting_slot_selection');
    expect(out.slotSelectionDate).toBeUndefined();
    expect(out.lastIntent).toBe('book_appointment');
  });

  it('maps confirming_slot to awaiting_slot_selection and drops slotToConfirm', () => {
    const s: ConversationState = {
      step: 'confirming_slot',
      slotToConfirm: { start: 'x', end: 'y', dateStr: 'z' },
    };
    const out = normalizeLegacySlotConversationSteps(s);
    expect(out.step).toBe('awaiting_slot_selection');
    expect(out.slotToConfirm).toBeUndefined();
  });
});
