import { describe, expect, it } from '@jest/globals';
import { BOOKING_RELATION_KIN_PATTERN } from '../../../src/utils/booking-relation-terms';

describe('booking-relation-terms', () => {
  it('retains core kin tokens (snapshot for accidental regressions)', () => {
    for (const term of ['mother', 'father', 'nani', 'boss', 'cousin']) {
      expect(BOOKING_RELATION_KIN_PATTERN).toContain(term);
    }
  });
});
