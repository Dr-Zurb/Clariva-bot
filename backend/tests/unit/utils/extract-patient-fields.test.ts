/**
 * extract-patient-fields: fallback regex path (when AI returns empty).
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectFieldComplaint,
  extractFieldsFromMessage,
} from '../../../src/utils/extract-patient-fields';

describe('extractFieldsFromMessage (fallback)', () => {
  it('extracts reason from i took ... on a composite one-line intake', () => {
    const msg =
      'Abhishek Sahil 46 male 8264602737 i took amlodipine 5mg and telmisartan 40mg';
    const r = extractFieldsFromMessage(msg);
    expect(r.reason_for_visit).toBeDefined();
    expect(r.reason_for_visit).toMatch(/amlodipine|Taking/i);
    expect(r.phone).toBe('8264602737');
  });

  it('extracts i took reason without composite name swallowing reason', () => {
    const msg = 'Firstname Lastname 30 male 9876543210 i took metformin';
    const r = extractFieldsFromMessage(msg);
    expect(r.reason_for_visit).toMatch(/metformin|Taking/i);
  });

  it('does not capture booking-intent phrasings as name or reason', () => {
    // DM bug 2026-04-18: "i'd like to book an appointment" was captured as both
    // `name` and `reason_for_visit`, then the bot later confirmed
    // "Let me confirm: i d like to book an appoinment ..." instead of the user's real name.
    for (const msg of [
      "i'd like to book an appointment",
      'id like to book an appoinment',
      'i would like to book',
      'i want to book an appointment',
      'please book an appointment',
      'can you book me an appointment',
    ]) {
      const r = extractFieldsFromMessage(msg);
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // Plan: "bot copy bugs 2026-04-27" — corrections at confirm_details
  // -------------------------------------------------------------------------
  //
  // Repro from the IG screenshots: patient is at confirm_details, replies
  // with one of the strings below. Pre-fix the regex fallback put the wrong
  // value into `name` and/or `reason_for_visit`. Post-fix the only thing
  // that may legitimately come out is the email — `name` and `reason` must
  // stay untouched so the handler can ask "what's the correct X?".

  describe('correction-context complaints (no field overwrite)', () => {
    it('"my email - X@Y.com" extracts only email — not name', () => {
      const r = extractFieldsFromMessage('my email - as.sahilabhi2937@gmail.com');
      expect(r.email).toBe('as.sahilabhi2937@gmail.com');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('"my email is X@Y.com" extracts only email — not name', () => {
      const r = extractFieldsFromMessage('my email is alice@example.com');
      expect(r.email).toBe('alice@example.com');
      expect(r.name).toBeUndefined();
    });

    it('"you got my name wrong" extracts nothing (no name=wrong, no reason)', () => {
      const r = extractFieldsFromMessage('you got my name wrong');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('"my name is wrong" extracts nothing', () => {
      const r = extractFieldsFromMessage('my name is wrong');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('"name is wrong" extracts nothing', () => {
      const r = extractFieldsFromMessage('name is wrong');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('"wrong number" extracts nothing as name/reason', () => {
      const r = extractFieldsFromMessage('wrong number');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('"got my phone wrong" extracts nothing as name/reason', () => {
      const r = extractFieldsFromMessage('got my phone wrong');
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    });

    it('legitimate "my name is Abhishek Sahil" still extracts the name', () => {
      const r = extractFieldsFromMessage('my name is Abhishek Sahil');
      expect(r.name).toBe('Abhishek Sahil');
    });
  });

  describe('detectFieldComplaint', () => {
    it('"you got my name wrong" → name', () => {
      expect(detectFieldComplaint('you got my name wrong')).toBe('name');
    });
    it('"got my name wrong" → name', () => {
      expect(detectFieldComplaint('got my name wrong')).toBe('name');
    });
    it('"my name is wrong" → name', () => {
      expect(detectFieldComplaint('my name is wrong')).toBe('name');
    });
    it('"name is wrong" → name', () => {
      expect(detectFieldComplaint('name is wrong')).toBe('name');
    });
    it('"wrong number" → phone', () => {
      expect(detectFieldComplaint('wrong number')).toBe('phone');
    });
    it('"my mobile is wrong" → phone', () => {
      expect(detectFieldComplaint('my mobile is wrong')).toBe('phone');
    });
    it('"my phone is incorrect" → phone', () => {
      expect(detectFieldComplaint('my phone is incorrect')).toBe('phone');
    });
    it('"email is wrong" → email', () => {
      expect(detectFieldComplaint('email is wrong')).toBe('email');
    });
    it('"got my age wrong" → age', () => {
      expect(detectFieldComplaint('got my age wrong')).toBe('age');
    });
    it('"my gender is wrong" → gender', () => {
      expect(detectFieldComplaint('my gender is wrong')).toBe('gender');
    });
    it('"reason is incorrect" → reason_for_visit', () => {
      expect(detectFieldComplaint('reason is incorrect')).toBe('reason_for_visit');
    });
    it('plain valid input is not a complaint', () => {
      expect(detectFieldComplaint('Abhishek Sahil')).toBeNull();
      expect(detectFieldComplaint('my email is alice@example.com')).toBeNull();
      expect(detectFieldComplaint('yes')).toBeNull();
      expect(detectFieldComplaint('')).toBeNull();
    });
  });
});
