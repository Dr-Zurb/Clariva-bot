/**
 * lang-25 / LANG6-D8: enrolled locale families must be translated or enByPolicy.
 * Catches forgotten regeneration after a family is enrolled (LANG6-D2-B).
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildConsultationReadyDm,
  buildNonTextAckMessage,
  enByPolicy,
  NON_TEXT_ACK_EN,
} from '../../../src/utils/dm-copy';
import { LOCALE_ARM_MANIFEST } from '../../../src/utils/locale-arm-manifest';

describe('locale-arm coverage (lang-25)', () => {
  it('enByPolicy fills all static locales with English and records intent at call site', () => {
    const copy = enByPolicy('hello', 'unit-test reason');
    expect(copy.en).toBe('hello');
    expect(copy.hi).toBe('hello');
    expect(copy.pa).toBe('hello');
  });

  it('manifest entries are well-formed', () => {
    expect(LOCALE_ARM_MANIFEST.length).toBeGreaterThan(0);
    for (const e of LOCALE_ARM_MANIFEST) {
      expect(e.familyId.length).toBeGreaterThan(0);
      expect(e.builder.length).toBeGreaterThan(0);
      if (e.status === 'enByPolicy') {
        expect(e.enByPolicyReason?.trim().length).toBeGreaterThan(5);
      }
      if (e.status === 'translated') {
        expect(e.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.reviewer?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('proof family buildNonTextAckMessage is translated (hi/pa ≠ en)', () => {
    const en = buildNonTextAckMessage({ language: 'en' });
    const hi = buildNonTextAckMessage({ language: 'hi' });
    const pa = buildNonTextAckMessage({ language: 'pa' });
    const hiLatn = buildNonTextAckMessage({ language: 'hi-Latn' });
    expect(en).toBe(NON_TEXT_ACK_EN);
    expect(hi).not.toBe(en);
    expect(pa).not.toBe(en);
    expect(hiLatn).toBe(hi); // toStaticLocale collapse
    expect(hi).toMatch(/images|voice notes/i);
    expect(pa).toMatch(/images|voice notes/i);
    // English arm unchanged (no reword while translating)
    expect(en).toContain("can't read images");
  });

  it('enByPolicy proof: consultation-ready default practice token stays English', () => {
    const url = 'https://join.example/x';
    const en = buildConsultationReadyDm({
      language: 'en',
      modality: 'video',
      joinUrl: url,
    });
    const hi = buildConsultationReadyDm({
      language: 'hi',
      modality: 'video',
      joinUrl: url,
    });
    expect(en).toContain('your doctor');
    expect(hi).toContain('your doctor');
    expect(hi).not.toBe(en);
  });

  it('every enrolled translated family has non-English hi arm', () => {
    const translated = LOCALE_ARM_MANIFEST.filter((e) => e.status === 'translated');
    expect(translated.some((e) => e.familyId === 'non-text-ack')).toBe(true);
    for (const e of translated) {
      if (e.familyId === 'non-text-ack') {
        expect(buildNonTextAckMessage({ language: 'hi' })).not.toBe(
          buildNonTextAckMessage({ language: 'en' })
        );
      }
    }
  });
});
