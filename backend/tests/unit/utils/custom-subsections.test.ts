/**
 * Custom subsections validation (subj-19).
 * @see backend/src/utils/validation.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateCreatePrescriptionBody,
  validateUpdatePrescriptionBody,
} from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECTION_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const GRANDCHILD_ID = '33333333-3333-4333-8333-333333333333';

const VALID_TREE = [
  {
    id: SECTION_ID,
    title: 'Travel history',
    body: 'Visited Kerala last month',
    children: [
      {
        id: CHILD_ID,
        title: 'Malaria prophylaxis',
        body: 'Took doxycycline',
      },
    ],
  },
];

describe('custom subsections validation (subj-19)', () => {
  it('accepts a depth-2 tree on update', () => {
    const result = validateUpdatePrescriptionBody({ customSubsections: VALID_TREE });
    expect(result.customSubsections).toHaveLength(1);
    expect(result.customSubsections![0].children).toHaveLength(1);
    expect(result.customSubsections![0].children![0].title).toBe('Malaria prophylaxis');
  });

  it('accepts a depth-2 tree on create', () => {
    const result = validateCreatePrescriptionBody({
      appointmentId: APPOINTMENT_ID,
      type: 'structured',
      customSubsections: VALID_TREE,
    });
    expect(result.customSubsections).toEqual(VALID_TREE);
  });

  it('rejects depth-3 (child-of-child children key)', () => {
    expect(() =>
      validateUpdatePrescriptionBody({
        customSubsections: [
          {
            id: SECTION_ID,
            title: 'Parent',
            children: [
              {
                id: CHILD_ID,
                title: 'Child',
                children: [{ id: GRANDCHILD_ID, title: 'Too deep' }],
              },
            ],
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('rejects more than 20 top-level sections', () => {
    const sections = Array.from({ length: 21 }, (_, i) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
      title: `Section ${i}`,
    }));
    expect(() => validateUpdatePrescriptionBody({ customSubsections: sections })).toThrow(
      ValidationError
    );
  });

  it('rejects more than 10 children per section', () => {
    const children = Array.from({ length: 11 }, (_, i) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`,
      title: `Child ${i}`,
    }));
    expect(() =>
      validateUpdatePrescriptionBody({
        customSubsections: [{ id: SECTION_ID, title: 'Parent', children }],
      })
    ).toThrow(ValidationError);
  });

  it('rejects empty section title', () => {
    expect(() =>
      validateUpdatePrescriptionBody({
        customSubsections: [{ id: SECTION_ID, title: '   ' }],
      })
    ).toThrow(ValidationError);
  });

  it('rejects body longer than history cap', () => {
    expect(() =>
      validateUpdatePrescriptionBody({
        customSubsections: [
          {
            id: SECTION_ID,
            title: 'Notes',
            body: 'x'.repeat(2001),
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('accepts empty/absent customSubsections as optional', () => {
    const result = validateUpdatePrescriptionBody({ cc: 'Headache' });
    expect(result.customSubsections).toBeUndefined();
  });

  it('accepts derived customSubsectionsText mirror within cap', () => {
    const result = validateUpdatePrescriptionBody({
      customSubsections: VALID_TREE,
      customSubsectionsText: 'Travel history\nVisited Kerala last month',
    });
    expect(result.customSubsectionsText).toBe('Travel history\nVisited Kerala last month');
  });
});
