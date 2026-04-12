import { describe, expect, it } from '@jest/globals';
import {
  assistantMessageIsEmergencyEscalationCopy,
  MEDICAL_QUERY_RESPONSE_EN,
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

    it('does not treat English “doc” (doctor) as Hinglish — regression (DM English message → Hindi deflection)', () => {
      const msg =
        'hello how are you doc , so i checked my blood sugar today on empty stomach , its high , 199 , how do i manage , please guide me';
      expect(detectSafetyMessageLocale(msg)).toBe('en');
    });

    it('still treats sans nahi as Hinglish breath distress', () => {
      expect(detectSafetyMessageLocale('sans nahi aa rahi')).toBe('hi');
    });

    it('does not treat typography “sans” alone as Hindi', () => {
      expect(detectSafetyMessageLocale('Use Comic Sans for the poster')).toBe('en');
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
      expect(msg.toLowerCase()).toMatch(/appointment|doctor|book|teleconsult|visit/);
      expect(msg).not.toContain("I'm the scheduling assistant");
    });

    it('returns English medical_query when user writes English including “doc”', () => {
      const userText =
        'hello how are you doc , so i checked my blood sugar today on empty stomach , its high , 199 , how do i manage , please guide me';
      const msg = resolveSafetyMessage('medical_query', userText);
      expect(msg).toBe(MEDICAL_QUERY_RESPONSE_EN);
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

    it('matches getting worse as escalation cue', () => {
      expect(isEmergencyUserMessage('It is getting worse')).toBe(true);
    });
  });

  describe('assistantMessageIsEmergencyEscalationCopy', () => {
    it('matches canonical EN emergency line', () => {
      expect(
        assistantMessageIsEmergencyEscalationCopy(
          'Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.'
        )
      ).toBe(true);
    });

    it('rejects generic assistant text', () => {
      expect(
        assistantMessageIsEmergencyEscalationCopy(
          "I'm the scheduling assistant. Book a teleconsult through this chat."
        )
      ).toBe(false);
    });
  });
});
