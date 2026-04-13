import { describe, expect, it } from '@jest/globals';
import {
  resolveConfirmDetailsReplyForBooking,
  resolveConsentReplyForBooking,
} from '../../../src/services/ai-service';

describe('booking turn classifiers (deterministic fast path)', () => {
  describe('resolveConfirmDetailsReplyForBooking', () => {
    it('confirms yes correct without calling unclear', async () => {
      expect(
        await resolveConfirmDetailsReplyForBooking('yes correct', 'Is this correct?', 't1')
      ).toBe('confirm');
    });

    it('confirms yes, correct', async () => {
      expect(
        await resolveConfirmDetailsReplyForBooking('yes, correct', 'summary?', 't2')
      ).toBe('confirm');
    });

    it('detects correction from no', async () => {
      expect(await resolveConfirmDetailsReplyForBooking('no, wrong name', 'summary?', 't3')).toBe(
        'correction'
      );
    });
  });

  describe('resolveConsentReplyForBooking', () => {
    it('grants on keyword yes', async () => {
      expect(await resolveConsentReplyForBooking('yes', 'consent?', 't4')).toBe('granted');
    });

    it('denies on keyword no', async () => {
      expect(await resolveConsentReplyForBooking('no thanks', 'consent?', 't5')).toBe('denied');
    });
  });
});
