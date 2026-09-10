import { validateReissuePrescriptionBody } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validateReissuePrescriptionBody', () => {
  it('accepts a known preset', () => {
    expect(validateReissuePrescriptionBody({ reason: 'dose_correction' })).toEqual({
      reason: 'dose_correction',
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
});
