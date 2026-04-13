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
    const optionalExtrasPrompt =
      "Anything else you'd like the doctor to know before your visit? (optional) Reply with your extras, or say Yes to continue.";

    it('grants on keyword yes', async () => {
      expect(await resolveConsentReplyForBooking('yes', 'consent?', 't4')).toBe('granted');
    });

    it('denies on keyword no for bare consent question', async () => {
      expect(await resolveConsentReplyForBooking('no thanks', 'consent?', 't5')).toBe('denied');
    });

    it('grants no thats it when assistant asked optional extras (context before keywords)', async () => {
      expect(await resolveConsentReplyForBooking('no thats it', optionalExtrasPrompt, 't6')).toBe(
        'granted'
      );
    });

    it('grants yes on optional extras without requiring semantic', async () => {
      expect(await resolveConsentReplyForBooking('yes', optionalExtrasPrompt, 't7')).toBe(
        'granted'
      );
    });

    it('grants nahi bas / bas as skip-extras (Hinglish) without denying consent', async () => {
      expect(await resolveConsentReplyForBooking('nahi bas', optionalExtrasPrompt, 't8')).toBe(
        'granted'
      );
      expect(await resolveConsentReplyForBooking('bas', optionalExtrasPrompt, 't9')).toBe('granted');
    });
  });
});
