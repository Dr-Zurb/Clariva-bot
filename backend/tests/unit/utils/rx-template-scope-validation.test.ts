/**
 * Rx template scope validation — unit tests (subjective-tab · subj-15).
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateCreateRxTemplateBody,
  validateListRxTemplatesQuery,
  rxTemplateScopeSchema,
} from '../../../src/utils/validation';
import { RX_TEMPLATE_SCOPE_VALUES } from '../../../src/types/rx-template';
import { ValidationError } from '../../../src/utils/errors';

describe('rx template scope validation (subj-15)', () => {
  it('rxTemplateScopeSchema accepts all scopes', () => {
    for (const scope of RX_TEMPLATE_SCOPE_VALUES) {
      expect(rxTemplateScopeSchema.parse(scope)).toBe(scope);
    }
  });

  it('rxTemplateScopeSchema accepts custom_block (subj-39)', () => {
    expect(rxTemplateScopeSchema.parse('custom_block')).toBe('custom_block');
  });

  it('rxTemplateScopeSchema rejects unknown scope', () => {
    expect(() => rxTemplateScopeSchema.parse('unknown_scope')).toThrow();
  });

  it('validateCreateRxTemplateBody defaults scope to subjective_full', () => {
    const body = validateCreateRxTemplateBody({ name: 'My preset' });
    expect(body.scope).toBe('subjective_full');
  });

  it('validateCreateRxTemplateBody accepts explicit scope', () => {
    const body = validateCreateRxTemplateBody({
      name: 'CC bundle',
      scope: 'chief_complaints',
    });
    expect(body.scope).toBe('chief_complaints');
  });

  it('validateListRxTemplatesQuery accepts optional scope filter', () => {
    expect(validateListRxTemplatesQuery({ scope: 'past_medical' })).toEqual({
      scope: 'past_medical',
    });
    expect(validateListRxTemplatesQuery({})).toEqual({});
  });

  it('validateListRxTemplatesQuery rejects invalid scope', () => {
    expect(() => validateListRxTemplatesQuery({ scope: 'not_a_scope' })).toThrow(
      ValidationError,
    );
  });
});

describe('rx template server-backed JSON validation (subj-17)', () => {
  it('accepts a past_medical body with pmh snapshot', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Diabetic baseline',
      scope: 'past_medical',
      pmh: {
        conditions: [{ condition: 'Diabetes', status: 'active', note: 'on metformin' }],
        medications: [{ drugName: 'Metformin', strength: '500mg', status: 'active' }],
      },
    });
    expect(body.scope).toBe('past_medical');
    expect(body.pmh?.conditions?.[0]?.condition).toBe('Diabetes');
    expect(body.pmh?.medications?.[0]?.drugName).toBe('Metformin');
  });

  it('accepts an allergies body with allergies snapshot', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Common allergies',
      scope: 'allergies',
      allergies: { allergies: [{ allergen: 'Penicillin', severity: 'severe', reaction: 'rash' }] },
    });
    expect(body.allergies?.allergies?.[0]?.allergen).toBe('Penicillin');
  });

  it('rejects a pmh condition without a name', () => {
    expect(() =>
      validateCreateRxTemplateBody({
        name: 'Bad',
        scope: 'past_medical',
        pmh: { conditions: [{ condition: '' }] },
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an allergy with an invalid severity', () => {
    expect(() =>
      validateCreateRxTemplateBody({
        name: 'Bad',
        scope: 'allergies',
        allergies: { allergies: [{ allergen: 'X', severity: 'lethal' }] },
      }),
    ).toThrow(ValidationError);
  });
});

describe('rx template custom_block subjective.customSubsections validation (subj-39)', () => {
  const VALID_ID = '11111111-1111-4111-8111-111111111111';
  const CHILD_ID = '22222222-2222-4222-8222-222222222222';

  it('accepts a custom_block body with a well-formed customSubsections array', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Diet advice',
      scope: 'custom_block',
      subjective: {
        customSubsections: [
          {
            id: VALID_ID,
            title: '  Diet  ',
            body: '  Low salt  ',
            children: [{ id: CHILD_ID, title: 'Breakfast', body: 'Oats' }],
          },
        ],
      },
    });
    expect(body.scope).toBe('custom_block');
    const sections = body.subjective?.customSubsections ?? [];
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      id: VALID_ID,
      title: 'Diet',
      body: 'Low salt',
      children: [{ id: CHILD_ID, title: 'Breakfast', body: 'Oats' }],
    });
  });

  it('drops malformed entries instead of rejecting the whole template', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Mixed',
      scope: 'custom_block',
      subjective: {
        customSubsections: [
          { id: 'not-a-uuid', title: 'Bad id' },
          { id: VALID_ID, title: '' },
          { id: VALID_ID, title: 'Keep me' },
          'totally wrong',
        ],
      },
    });
    const sections = body.subjective?.customSubsections ?? [];
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Keep me');
  });

  it('drops a malformed child while keeping its section', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Child filter',
      scope: 'custom_block',
      subjective: {
        customSubsections: [
          {
            id: VALID_ID,
            title: 'Parent',
            children: [
              { id: 'bad', title: 'dropped' },
              { id: CHILD_ID, title: 'kept' },
            ],
          },
        ],
      },
    });
    const children = body.subjective?.customSubsections?.[0]?.children ?? [];
    expect(children).toHaveLength(1);
    expect(children[0]?.title).toBe('kept');
  });
});
