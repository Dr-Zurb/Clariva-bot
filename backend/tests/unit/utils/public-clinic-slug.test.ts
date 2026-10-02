import { describe, expect, it } from '@jest/globals';
import {
  fallbackPublicSlug,
  resolvePublicSlug,
} from '../../../src/utils/public-clinic-slug';

const DOCTOR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DOCTOR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('resolvePublicSlug', () => {
  it('builds a slug from the practice name when the row has none', () => {
    const decision = resolvePublicSlug({
      doctorId: DOCTOR_A,
      practiceName: 'City Clinic',
      currentSlug: null,
      requested: undefined,
      takenByOthers: new Set(),
    });
    expect(decision).toEqual({ ok: true, slug: 'city-clinic', changed: true });
  });

  it('suffixes when another practice already has that slug', () => {
    const decision = resolvePublicSlug({
      doctorId: DOCTOR_B,
      practiceName: 'City Clinic',
      currentSlug: null,
      requested: undefined,
      takenByOthers: new Set(['city-clinic']),
    });
    expect(decision).toEqual({ ok: true, slug: 'city-clinic-2', changed: true });
  });

  it('rejects a requested slug that another practice owns, and leaves that slug unchanged', () => {
    const decision = resolvePublicSlug({
      doctorId: DOCTOR_B,
      practiceName: 'Other Clinic',
      currentSlug: 'other-clinic',
      requested: 'city-clinic',
      takenByOthers: new Set(['city-clinic']),
    });
    expect(decision).toEqual({ ok: false, reason: 'taken' });
  });

  it('keeps the first practice slug when a second practice asks for a new one', () => {
    const first = resolvePublicSlug({
      doctorId: DOCTOR_A,
      practiceName: 'City Clinic',
      currentSlug: 'city-clinic',
      requested: undefined,
      takenByOthers: new Set(),
    });
    const second = resolvePublicSlug({
      doctorId: DOCTOR_B,
      practiceName: 'City Clinic',
      currentSlug: null,
      requested: undefined,
      takenByOthers: new Set(['city-clinic']),
    });
    expect(first).toEqual({ ok: true, slug: 'city-clinic', changed: false });
    expect(second).toEqual({ ok: true, slug: 'city-clinic-2', changed: true });
  });

  it('uses a practice-id fallback when the name cannot make a slug', () => {
    const decision = resolvePublicSlug({
      doctorId: DOCTOR_A,
      practiceName: '  ---  ',
      currentSlug: null,
      requested: undefined,
      takenByOthers: new Set(),
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.slug).toBe(fallbackPublicSlug(DOCTOR_A));
      expect(decision.slug.startsWith('clinic-')).toBe(true);
      expect(decision.slug).not.toMatch(/patient/);
    }
  });

  it('rejects a slug that is not url-safe', () => {
    const decision = resolvePublicSlug({
      doctorId: DOCTOR_A,
      practiceName: 'City Clinic',
      currentSlug: 'city-clinic',
      requested: 'City Clinic!',
      takenByOthers: new Set(),
    });
    expect(decision).toEqual({ ok: false, reason: 'invalid' });
  });
});
