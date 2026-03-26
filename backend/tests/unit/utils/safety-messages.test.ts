import { describe, expect, it } from '@jest/globals';
import {
  detectSafetyMessageLocale,
  isEmergencyUserMessage,
  resolveSafetyMessage,
} from '../../../src/utils/safety-messages';

describe('safety-messages (RBH-15)', () => {
  describe('detectSafetyMessageLocale', () => {
    it('detects Gurmukhi as Punjabi', () => {
      expect(detectSafetyMessageLocale('ਮੇਨੂੰ ਬੁਖ਼ਾਰ ਹੈ')).toBe('pa');
    });

    it('detects Devanagari as Hindi', () => {
      expect(detectSafetyMessageLocale('मुझे बुखार है')).toBe('hi');
    });

    it('detects Latin Punjabi markers', () => {
      expect(detectSafetyMessageLocale('Menu tin din to bukhar hai')).toBe('pa');
    });

    it('detects Hinglish as Hindi', () => {
      expect(detectSafetyMessageLocale('Mujhe pet dard hai')).toBe('hi');
    });

    it('detects informal yar / goli as Hindi (Hinglish)', () => {
      expect(detectSafetyMessageLocale('yar ek goli batado')).toBe('hi');
    });

    it('defaults to English', () => {
      expect(detectSafetyMessageLocale('I have a headache')).toBe('en');
    });
  });

  describe('resolveSafetyMessage', () => {
    it('returns Gurmukhi medical copy for Gurmukhi input', () => {
      const msg = resolveSafetyMessage('medical_query', 'ਮੇਨੂੰ ਬੁਖਾਰ ਹੈ');
      expect(msg).toContain('ਸਹਾਇਕ');
      expect(msg).not.toContain('scheduling assistant');
    });

    it('returns Roman Punjabi medical for Latin Punjabi', () => {
      const msg = resolveSafetyMessage('medical_query', 'Menu bukhar hai');
      expect(msg.toLowerCase()).toContain('appointment');
      expect(msg.toLowerCase()).toContain('main');
    });

    it('returns Hindi Devanagari medical when script is Devanagari', () => {
      const msg = resolveSafetyMessage('medical_query', 'मुझे सिर दर्द है');
      expect(msg).toMatch(/[\u0900-\u097F]/);
    });

    it('returns emergency in Punjabi script for Gurmukhi chest pain', () => {
      const msg = resolveSafetyMessage(
        'emergency',
        'ਮੇਰੀ ਛਾਤੀ ਵਿੱਚ ਦਰਦ ਤੇ ਸਾਸ ਨਹੀਂ ਆ ਰਹੀ'
      );
      expect(msg).toContain('112');
      expect(msg).toMatch(/[\u0A00-\u0A7F]/);
    });

    it('returns Roman Hindi emergency for Latin Hindi emergency phrase', () => {
      const msg = resolveSafetyMessage('emergency', 'Saans nahi aa rahi bahut');
      expect(msg).toContain('112');
      expect(msg.toLowerCase()).toMatch(/bharat|call|hospital/);
    });

    it('returns Roman Hindi medical_query for yar / goli (not English)', () => {
      const msg = resolveSafetyMessage('medical_query', 'yar ek goli batado please');
      expect(msg.toLowerCase()).toContain('main');
      expect(msg.toLowerCase()).toMatch(/appointment|clinic/);
      expect(msg).not.toContain("I'm the scheduling assistant");
    });
  });

  describe('isEmergencyUserMessage', () => {
    it('matches English chest pain', () => {
      expect(isEmergencyUserMessage("Chest pain and can't breathe")).toBe(true);
    });

    it('matches Punjabi Latin chest pain phrase from checklist', () => {
      expect(
        isEmergencyUserMessage(
          'Meri chhati vich dard te saas nahi aa rahi'
        )
      ).toBe(true);
    });

    it('matches poison / zehar (Punjabi)', () => {
      expect(isEmergencyUserMessage('Kise ne zahar kha lia')).toBe(true);
    });

    it('does not match emergency appointment booking phrase', () => {
      expect(isEmergencyUserMessage('I need an emergency appointment tomorrow')).toBe(
        false
      );
    });

    it('does not match urgent appointment', () => {
      expect(isEmergencyUserMessage('Need urgent appointment slot')).toBe(false);
    });
  });
});
