import { validateReissuePrescriptionBody } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validateReissuePrescriptionBody', () => {
  it('accepts a known preset', () => {
    expect(validateReissuePrescriptionBody({ reason: 'treatment_change' })).toEqual({
      reason: 'treatment_change',
    });
  });

  it('refuses a missing reason', () => {
    expect(() => validateReissuePrescriptionBody({})).toThrow(ValidationError);
  });

  it('refuses an unknown preset', () => {
    expect(() =>
      validateReissuePrescriptionBody({ reason: 'typo' })
    ).toThrow(ValidationError);
  });

  it('refuses the retired 2026-09-10 presets', () => {
    expect(() =>
      validateReissuePrescriptionBody({ reason: 'dose_correction' })
    ).toThrow(ValidationError);
    expect(() =>
      validateReissuePrescriptionBody({ reason: 'clarified_for_pharmacy' })
    ).toThrow(ValidationError);
  });
});
