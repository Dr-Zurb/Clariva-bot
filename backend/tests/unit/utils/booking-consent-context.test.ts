import { describe, it, expect } from '@jest/globals';
import {
  isOptionalExtrasConsentPrompt,
  isSkipExtrasReply,
} from '../../../src/utils/booking-consent-context';

describe('booking-consent-context', () => {
  describe('isOptionalExtrasConsentPrompt', () => {
    it('detects optional doctor extras copy', () => {
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
