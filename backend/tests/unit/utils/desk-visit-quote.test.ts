import { describe, expect, it } from '@jest/globals';
import { resolveDeskVisitQuote } from '../../../src/utils/desk-visit-quote';

describe('resolveDeskVisitQuote', () => {
  it('reads the legacy flat fee', () => {
    expect(
      resolveDeskVisitQuote({ appointment_fee_minor: 50000, appointment_fee_currency: 'INR' })
    ).toEqual({ amountMinor: 50000, currency: 'INR' });
  });

  it('returns null amount when no fee is configured', () => {
    expect(resolveDeskVisitQuote(null)).toEqual({ amountMinor: null, currency: 'INR' });
    expect(resolveDeskVisitQuote({ appointment_fee_minor: null })).toEqual({
      amountMinor: null,
      currency: 'INR',
    });
  });

  it('normalises currency', () => {
    expect(resolveDeskVisitQuote({ appointment_fee_minor: 100, appointment_fee_currency: 'inr' })).toEqual(
      { amountMinor: 100, currency: 'INR' }
    );
  });
});
