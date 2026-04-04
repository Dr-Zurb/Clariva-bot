import { describe, expect, it } from '@jest/globals';
import {
  isRecentMedicalDeflectionWindow,
  MEDICAL_DEFLECTION_CONTEXT_TTL_MS,
} from '../../../src/types/conversation';

describe('isRecentMedicalDeflectionWindow (e-task-dm-03)', () => {
  it('returns false when field missing', () => {
    expect(isRecentMedicalDeflectionWindow({}, 1_700_000_000_000)).toBe(false);
  });

  it('returns false for invalid ISO', () => {
    expect(isRecentMedicalDeflectionWindow({ lastMedicalDeflectionAt: 'not-a-date' }, 1_700_000_000_000)).toBe(
      false
    );
  });

  it('returns true within TTL', () => {
    const t = Date.now();
    const iso = new Date(t - MEDICAL_DEFLECTION_CONTEXT_TTL_MS + 60_000).toISOString();
    expect(isRecentMedicalDeflectionWindow({ lastMedicalDeflectionAt: iso }, t)).toBe(true);
  });

  it('returns false after TTL', () => {
    const t = Date.now();
    const iso = new Date(t - MEDICAL_DEFLECTION_CONTEXT_TTL_MS - 60_000).toISOString();
    expect(isRecentMedicalDeflectionWindow({ lastMedicalDeflectionAt: iso }, t)).toBe(false);
  });
});
