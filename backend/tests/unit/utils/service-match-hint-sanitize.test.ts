/**
 * Plan 01 / Task 03 — "hint learning from corrections"
 *
 * Unit tests for sanitizeReasonForHintContent / sanitizeHintAppendPatch.
 * These are used when staff reassigns a service on the review inbox and the system
 * appends the sanitized reason text onto the correct service's `include_when` and
 * the originally-proposed service's `exclude_when`.
 */

import { describe, expect, it } from '@jest/globals';
import {
  HINT_CONTENT_MAX_LEN,
  sanitizeHintAppendPatch,
  sanitizeReasonForHintContent,
} from '../../../src/utils/service-match-hint-sanitize';

describe('sanitizeReasonForHintContent', () => {
  it('returns null for null / undefined / empty / whitespace input', () => {
    expect(sanitizeReasonForHintContent(null)).toBeNull();
    expect(sanitizeReasonForHintContent(undefined)).toBeNull();
    expect(sanitizeReasonForHintContent('')).toBeNull();
    expect(sanitizeReasonForHintContent('     ')).toBeNull();
    expect(sanitizeReasonForHintContent('\n\t  \r')).toBeNull();
  });

  it('returns null for non-string input (type guard)', () => {
    // @ts-expect-error intentional wrong type at runtime
    expect(sanitizeReasonForHintContent(123)).toBeNull();
    // @ts-expect-error intentional wrong type at runtime
    expect(sanitizeReasonForHintContent({})).toBeNull();
  });

  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(
      sanitizeReasonForHintContent('   Severe  ACNE   on   Back\n\n')
    ).toBe('severe acne on back');
  });

  it('redacts email addresses', () => {
    const out = sanitizeReasonForHintContent(
      'please book acne treatment for Jane.Doe+test@mail.example.com today'
    );
    expect(out).not.toContain('@');
    expect(out).not.toContain('jane.doe');
    expect(out).toMatch(/acne treatment/);
  });

  it('redacts long digit runs (phone numbers, MRNs) but keeps short numerics', () => {
    const out = sanitizeReasonForHintContent(
      'follow up for patient 9876543210 after 2 days'
    );
    expect(out).not.toMatch(/\d{6,}/);
    expect(out).toMatch(/follow up/);
    expect(out).toMatch(/2 days/);
  });

  it('keeps short digit sequences (e.g. "day 3", "7 days")', () => {
    expect(sanitizeReasonForHintContent('rash on day 3')).toBe('rash on day 3');
    expect(sanitizeReasonForHintContent('fever since 7 days')).toBe(
      'fever since 7 days'
    );
  });

  it('strips trailing punctuation that adds no routing signal', () => {
    expect(sanitizeReasonForHintContent('hair fall!!!')).toBe('hair fall');
    expect(sanitizeReasonForHintContent('want consultation...')).toBe(
      'want consultation'
    );
    expect(sanitizeReasonForHintContent('severe acne.')).toBe('severe acne');
    expect(sanitizeReasonForHintContent('itching---')).toBe('itching');
  });

  it('returns null when too short after cleanup', () => {
    expect(sanitizeReasonForHintContent('hi')).toBeNull();
    expect(sanitizeReasonForHintContent('a.')).toBeNull();
  });

  it('truncates to HINT_CONTENT_MAX_LEN', () => {
    const long = 'acne '.repeat(200); // way beyond the cap
    const out = sanitizeReasonForHintContent(long);
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(HINT_CONTENT_MAX_LEN);
  });

  it('does not include raw email even when mixed with valid content', () => {
    const out = sanitizeReasonForHintContent(
      'Booking for hair transplant — contact: patient@test.io'
    );
    expect(out).not.toContain('@');
    expect(out).toMatch(/hair transplant/);
  });
});

describe('sanitizeHintAppendPatch', () => {
  it('returns null when every field is empty / unusable', () => {
    expect(sanitizeHintAppendPatch({})).toBeNull();
    expect(
      sanitizeHintAppendPatch({
        keywords: '',
        include_when: '   ',
        exclude_when: null,
      })
    ).toBeNull();
    expect(
      sanitizeHintAppendPatch({
        keywords: 'x', // below HINT_CONTENT_MIN_LEN
      })
    ).toBeNull();
  });

  it('returns only non-empty sanitized fields', () => {
    const out = sanitizeHintAppendPatch({
      keywords: '  ACNE treatment  ',
      include_when: '',
      exclude_when: 'Not for hair!!!',
    });
    expect(out).toEqual({
      keywords: 'acne treatment',
      exclude_when: 'not for hair',
    });
    expect(out).not.toHaveProperty('include_when');
  });

  it('redacts PII across every field it processes', () => {
    const out = sanitizeHintAppendPatch({
      keywords: 'contact user@example.com',
      include_when: 'MRN 1234567890 needs follow up',
      exclude_when: 'call 9999888877',
    });
    expect(out).not.toBeNull();
    const joined = JSON.stringify(out);
    expect(joined).not.toContain('@');
    expect(joined).not.toMatch(/\d{6,}/);
  });

  it('returns null when nullable fields pass through with null/undefined', () => {
    expect(
      sanitizeHintAppendPatch({
        keywords: null,
        include_when: undefined,
        exclude_when: null,
      })
    ).toBeNull();
  });
});
