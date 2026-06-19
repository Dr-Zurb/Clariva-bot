/**
 * subj-21 — doctor_settings subjective_custom_subsections validation.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

const SECTION_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';

const VALID_DEFAULT = [
  {
    id: SECTION_ID,
    title: 'Travel history',
    body: null,
    children: [{ id: CHILD_ID, title: 'Prophylaxis', body: null }],
  },
];

describe('doctor settings subjective_custom_subsections (subj-21)', () => {
  it('accepts a depth-2 default tree on PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_custom_subsections: VALID_DEFAULT,
    });
    expect(result.subjective_custom_subsections).toHaveLength(1);
    expect(result.subjective_custom_subsections![0].children).toHaveLength(1);
  });

  it('accepts an empty default array', () => {
    const result = validatePatchDoctorSettings({ subjective_custom_subsections: [] });
    expect(result.subjective_custom_subsections).toEqual([]);
  });

  it('rejects depth-3 on the default tree', () => {
    expect(() =>
      validatePatchDoctorSettings({
        subjective_custom_subsections: [
          {
            id: SECTION_ID,
            title: 'Parent',
            children: [
              {
                id: CHILD_ID,
                title: 'Child',
                children: [{ id: '33333333-3333-4333-8333-333333333333', title: 'Too deep' }],
              },
            ],
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('rejects unknown PATCH keys (strict schema)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        subjective_custom_subsections: VALID_DEFAULT,
        customSubsections: [],
      })
    ).toThrow(ValidationError);
  });
});
