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

describe('rx template objective scope + objective_json validation (obj-16)', () => {
  it('rxTemplateScopeSchema accepts every objective scope', () => {
    for (const scope of [
      'objective_full',
      'vitals',
      'exam_systemic',
      'exam_general',
      'exam_cvs',
      'exam_resp',
      'exam_abd',
      'exam_cns',
      'objective_custom_block',
    ]) {
      expect(rxTemplateScopeSchema.parse(scope)).toBe(scope);
    }
  });

  it('accepts a vitals body with the vitals subset', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Adult baseline',
      scope: 'vitals',
      objective: { vitalsHr: 72, vitalsBpSystolic: 120, vitalsBpDiastolic: 80, vitalsSpo2: 98 },
    });
    expect(body.scope).toBe('vitals');
    expect(body.objective?.vitalsHr).toBe(72);
    expect(body.objective?.vitalsBpSystolic).toBe(120);
  });

  it('accepts an exam body with structured examinationJson', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Normal CVS',
      scope: 'exam_cvs',
      objective: {
        examinationJson: [
          { systemId: 'cvs', status: 'normal', findings: ['S1S2 heard', ''], notes: '  no murmurs ' },
        ],
        testResults: '  ECG normal  ',
      },
    });
    const exam = body.objective?.examinationJson ?? [];
    expect(exam).toHaveLength(1);
    expect(exam[0]?.systemId).toBe('cvs');
    expect(exam[0]?.findings).toEqual([{ findingId: 's1s2_heard', attributes: {} }]);
    expect(exam[0]?.notes).toBe('no murmurs');
    expect(body.objective?.testResults).toBe('ECG normal');
  });

  it('drops unknown keys from the objective payload', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Stray keys',
      scope: 'objective_full',
      objective: { vitalsHr: 80, somethingElse: 'nope', hopi: 'leak' } as never,
    });
    expect(body.objective).toEqual({ vitalsHr: 80 });
  });

  it('rejects an out-of-range vital', () => {
    expect(() =>
      validateCreateRxTemplateBody({
        name: 'Bad vital',
        scope: 'vitals',
        objective: { vitalsHr: 9999 },
      }),
    ).toThrow(ValidationError);
  });

  it('drops a malformed exam system row instead of rejecting the template', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Mixed exam',
      scope: 'exam_systemic',
      objective: {
        examinationJson: [
          { systemId: '', status: 'normal' },
          { systemId: 'resp', status: 'not_a_status' },
          { systemId: 'cns', status: 'abnormal', findings: ['power 4/5'] },
        ] as never,
      },
    });
    const exam = body.objective?.examinationJson ?? [];
    expect(exam).toHaveLength(1);
    expect(exam[0]?.systemId).toBe('cns');
  });
});

describe('rx template result scopes + testResultsJson validation (obj-23)', () => {
  it('rxTemplateScopeSchema accepts the two result scopes', () => {
    expect(rxTemplateScopeSchema.parse('test_results')).toBe('test_results');
    expect(rxTemplateScopeSchema.parse('point_of_care')).toBe('point_of_care');
  });

  it('accepts a test_results body with structured result rows', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Diabetic panel',
      scope: 'test_results',
      objective: {
        testResultsJson: [
          {
            id: 'r-1',
            source: 'patient_report',
            name: '  HbA1c  ',
            value: '7.2',
            unit: '%',
            interpretation: 'high',
          },
        ],
      },
    });
    expect(body.scope).toBe('test_results');
    const rows = body.objective?.testResultsJson ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('HbA1c');
    expect(rows[0]?.source).toBe('patient_report');
    expect(rows[0]?.interpretation).toBe('high');
  });

  it('drops a result row with an empty name / bad source rather than rejecting', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Mixed',
      scope: 'point_of_care',
      objective: {
        testResultsJson: [
          { id: 'a', source: 'in_clinic_poc', name: '' },
          { id: 'b', source: 'not_a_source', name: 'Dropped' },
          { id: 'c', source: 'in_clinic_poc', name: 'RBS', value: '180', unit: 'mg/dL' },
        ] as never,
      },
    });
    const rows = body.objective?.testResultsJson ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('RBS');
  });

  it('coerces a bad interpretation to null (tolerant) instead of dropping the row', () => {
    const body = validateCreateRxTemplateBody({
      name: 'Tolerant',
      scope: 'test_results',
      objective: {
        testResultsJson: [
          { id: 'd', source: 'patient_report', name: 'Lipid', interpretation: 'sky_high' },
        ] as never,
      },
    });
    const rows = body.objective?.testResultsJson ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.interpretation).toBeNull();
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
