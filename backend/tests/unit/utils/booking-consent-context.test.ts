import { describe, it, expect } from '@jest/globals';
import {
  isOptionalExtrasConsentPrompt,
  isSkipExtrasReply,
} from '../../../src/utils/booking-consent-context';

describe('booking-consent-context', () => {
  describe('isOptionalExtrasConsentPrompt', () => {
    it('detects current (2026-04-18) optional doctor extras copy', () => {
      expect(
        isOptionalExtrasConsentPrompt(
          [
            'Thanks, **Abhishek**.',
            "We'll use **8264602737** to confirm your appointment by call or text.",
            '',
            'Any notes for the doctor? _(allergies, current medicines, anything else — optional)_',
            '',
            "Reply **Yes** when you're ready to pick a time.",
          ].join('\n')
        )
      ).toBe(true);
    });

    it('detects previous "special notes" copy (backward compat for in-flight conversations)', () => {
      expect(
        isOptionalExtrasConsentPrompt(
          "Got it! Any special notes for the doctor — like allergies, medications, or preferences? (optional) Or just say Yes to continue."
        )
      ).toBe(true);
    });

    it('returns false for bare consent question', () => {
      expect(isOptionalExtrasConsentPrompt('Do I have your consent to use these details?')).toBe(
        false
      );
    });
  });

  describe('isSkipExtrasReply', () => {
    it('treats no thats it as skip (not consent denial)', () => {
      expect(isSkipExtrasReply('no thats it')).toBe(true);
      expect(isSkipExtrasReply("no that's it")).toBe(true);
    });

    it('treats bare no as no extra notes', () => {
      expect(isSkipExtrasReply('no')).toBe(true);
    });
  });
});
