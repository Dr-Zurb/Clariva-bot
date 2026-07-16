/**
 * Prescription SOAP field validation (cv2-07).
 * @see backend/src/utils/validation.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateCreatePrescriptionBody,
  validateUpdatePrescriptionBody,
  validateCreateUploadUrlBody,
  labReportsJsonSchema,
} from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('prescription SOAP validation (cv2-07)', () => {
  describe('validateUpdatePrescriptionBody', () => {
    it('accepts vitalsBpSystolic within range', () => {
      const result = validateUpdatePrescriptionBody({ vitalsBpSystolic: 130 });
      expect(result.vitalsBpSystolic).toBe(130);
    });

    it('rejects vitalsBpSystolic above CHECK max with 400-class error', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsBpSystolic: 500 })
      ).toThrow(ValidationError);
    });

    it('accepts differentialDiagnosis array', () => {
      const ddx = ['Pharyngitis', 'Tonsillitis'];
      const result = validateUpdatePrescriptionBody({ differentialDiagnosis: ddx });
      expect(result.differentialDiagnosis).toEqual(ddx);
    });

    it('accepts assessmentNote (trimmed) + a valid assessmentAcuity (asmt-02)', () => {
      const result = validateUpdatePrescriptionBody({
        assessmentNote: '  Likely viral URI  ',
        assessmentAcuity: 'improving',
      });
      expect(result.assessmentNote).toBe('Likely viral URI');
      expect(result.assessmentAcuity).toBe('improving');
    });

    it('coerces a blank assessmentNote to null (asmt-02)', () => {
      const result = validateUpdatePrescriptionBody({ assessmentNote: '   ' });
      expect(result.assessmentNote).toBeNull();
    });

    it('degrades an unknown assessmentAcuity to null instead of rejecting (asmt-02)', () => {
      const result = validateUpdatePrescriptionBody({
        assessmentAcuity: 'critical' as unknown as 'stable',
      });
      expect(result.assessmentAcuity).toBeNull();
    });

    it('accepts diagnosesJson and defaults unknown enums (asmt-03)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'Viral URI',
            kind: 'primary',
            certainty: 'confirmed',
            status: 'new',
          },
          {
            id: 'dx-2',
            label: 'GERD',
            kind: 'maybe' as 'secondary',
            certainty: 'weird' as 'provisional',
            status: 'nope' as 'new',
          },
        ],
      });
      expect(result.diagnosesJson).toHaveLength(2);
      expect(result.diagnosesJson![0]).toMatchObject({
        id: 'dx-1',
        label: 'Viral URI',
        kind: 'primary',
        certainty: 'confirmed',
      });
      expect(result.diagnosesJson![1]).toMatchObject({
        id: 'dx-2',
        label: 'GERD',
        kind: 'secondary',
        certainty: 'provisional',
        status: 'new',
      });
    });

    it('drops malformed diagnosesJson rows instead of rejecting (asmt-03)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          { id: '', label: 'Bad' },
          { id: 'ok', label: 'Good', kind: 'primary' },
          null,
        ] as unknown as [],
      });
      expect(result.diagnosesJson).toEqual([
        expect.objectContaining({ id: 'ok', label: 'Good', kind: 'primary' }),
      ]);
    });

    it('demotes a second primary in diagnosesJson (asmt-03)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          { id: 'a', label: 'A', kind: 'primary' },
          { id: 'b', label: 'B', kind: 'primary' },
        ],
      });
      expect(result.diagnosesJson!.map((r) => r.kind)).toEqual([
        'primary',
        'secondary',
      ]);
    });

    it('accepts conditionId on a diagnosis row and collapses bad ids to null (asmt-04)', () => {
      const goodId = '550e8400-e29b-41d4-a716-446655440099';
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'HTN',
            kind: 'primary',
            conditionId: goodId,
          },
          {
            id: 'dx-2',
            label: 'DM',
            kind: 'secondary',
            conditionId: 'not-a-uuid',
          },
        ],
      });
      expect(result.diagnosesJson![0].conditionId).toBe(goodId);
      expect(result.diagnosesJson![1].conditionId).toBeNull();
      // Bad conditionId must not drop the row.
      expect(result.diagnosesJson![1].label).toBe('DM');
    });

    it('accepts differential + excluded and clears conditionId on differentials (asmt-05)', () => {
      const goodId = '550e8400-e29b-41d4-a716-446655440099';
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'URI',
            kind: 'primary',
          },
          {
            id: 'ddx-1',
            label: 'Pneumonia',
            kind: 'differential',
            certainty: 'excluded',
            conditionId: goodId,
          },
        ],
      });
      expect(result.diagnosesJson).toHaveLength(2);
      expect(result.diagnosesJson![1]).toMatchObject({
        id: 'ddx-1',
        kind: 'differential',
        certainty: 'excluded',
        conditionId: null,
      });
    });

    it('accepts investigationsOrdersJson basket members (inv-lib-05 / INV-D11)', () => {
      const result = validateUpdatePrescriptionBody({
        investigationsOrdersJson: [
          {
            id: 'iron_studies',
            label: 'Anemia workup',
            kind: 'panel',
            sourcePanelId: 'iron_studies',
            members: [
              { id: 'ferritin', label: 'Ferritin', kind: 'analyte' },
              { id: 'cbc', label: 'CBC', kind: 'panel' },
            ],
          },
        ],
      });
      expect(result.investigationsOrdersJson).toEqual([
        {
          id: 'iron_studies',
          label: 'Anemia workup',
          kind: 'panel',
          sourcePanelId: 'iron_studies',
          members: [
            { id: 'ferritin', label: 'Ferritin', kind: 'analyte' },
            { id: 'cbc', label: 'CBC', kind: 'panel' },
          ],
        },
      ]);
    });

    it('accepts investigationsOrdersJson and defaults an unknown kind to custom (inv-lib-05)', () => {
      const result = validateUpdatePrescriptionBody({
        investigationsOrdersJson: [
          { id: 'lft', label: 'LFT', kind: 'panel' },
          { id: 'custom:foo', label: 'Foo assay', kind: 'weird' as unknown as 'custom' },
        ],
      });
      expect(result.investigationsOrdersJson).toEqual([
        { id: 'lft', label: 'LFT', kind: 'panel' },
        { id: 'custom:foo', label: 'Foo assay', kind: 'custom' },
      ]);
    });

    it('drops malformed investigationsOrdersJson rows instead of rejecting (inv-lib-05)', () => {
      const result = validateUpdatePrescriptionBody({
        investigationsOrdersJson: [
          { id: '', label: 'Missing id' },
          { id: 'cbc', label: 'CBC', kind: 'panel' },
          { id: 'no-label', label: '   ' },
        ],
      });
      expect(result.investigationsOrdersJson).toEqual([
        { id: 'cbc', label: 'CBC', kind: 'panel' },
      ]);
    });

    it('dedupes investigationsOrdersJson by identity, first wins (inv-lib-05)', () => {
      const result = validateUpdatePrescriptionBody({
        investigationsOrdersJson: [
          { id: 'hb', label: 'Haemoglobin', kind: 'analyte' },
          { id: 'hb', label: 'Hb', kind: 'analyte' },
        ],
      });
      expect(result.investigationsOrdersJson).toEqual([
        { id: 'hb', label: 'Haemoglobin', kind: 'analyte' },
      ]);
    });

    it('maps deprecated rule_out certainty to provisional on ingest', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'URI',
            kind: 'primary',
            certainty: 'rule_out',
          },
        ],
      });
      expect(result.diagnosesJson![0].certainty).toBe('provisional');
    });

    it('accepts per-diagnosis acuity and clears it on differentials', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'URI',
            kind: 'primary',
            acuity: 'improving',
          },
          {
            id: 'ddx-1',
            label: 'Pneumonia',
            kind: 'differential',
            acuity: 'stable',
          },
          {
            id: 'dx-2',
            label: 'GERD',
            kind: 'secondary',
            acuity: 'critical' as 'stable',
          },
        ],
      });
      expect(result.diagnosesJson![0].acuity).toBe('improving');
      expect(result.diagnosesJson![1]).toMatchObject({
        kind: 'differential',
        acuity: null,
      });
      expect(result.diagnosesJson![2].acuity).toBeNull();
    });

    it('does not demote a differential when a primary already exists (asmt-05)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          { id: 'a', label: 'A', kind: 'primary' },
          { id: 'd', label: 'DDx', kind: 'differential' },
        ],
      });
      expect(result.diagnosesJson!.map((r) => r.kind)).toEqual([
        'primary',
        'differential',
      ]);
    });

    it('accepts optional ICD-11 code/codeTitle and defaults them to null (asmt-06)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'Hypertension',
            kind: 'primary',
            code: 'BA00',
            codeTitle: 'Essential hypertension',
          },
          {
            id: 'dx-2',
            label: 'Uncoded free text',
            kind: 'secondary',
          },
        ],
      });
      expect(result.diagnosesJson![0]).toMatchObject({
        code: 'BA00',
        codeTitle: 'Essential hypertension',
      });
      // Uncoded rows still validate (ASMT-D3) with null coding.
      expect(result.diagnosesJson![1].code).toBeNull();
      expect(result.diagnosesJson![1].codeTitle).toBeNull();
    });

    it('collapses a malformed code to null without dropping the row (asmt-06)', () => {
      const result = validateUpdatePrescriptionBody({
        diagnosesJson: [
          {
            id: 'dx-1',
            label: 'Diabetes',
            kind: 'primary',
            code: 123 as unknown as string,
            codeTitle: '',
          },
        ],
      });
      expect(result.diagnosesJson).toHaveLength(1);
      expect(result.diagnosesJson![0].label).toBe('Diabetes');
      expect(result.diagnosesJson![0].code).toBeNull();
      expect(result.diagnosesJson![0].codeTitle).toBeNull();
    });

    it('accepts nested associatedComplaints on complaints (subj-12)', () => {
      const result = validateUpdatePrescriptionBody({
        complaints: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Chest pain',
            associatedComplaints: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                name: 'Breathlessness',
                timing: 'on exertion',
              },
            ],
          },
        ],
      });
      expect(result.complaints).toHaveLength(1);
      expect(result.complaints![0].associatedComplaints).toHaveLength(1);
      expect(result.complaints![0].associatedComplaints![0].name).toBe('Breathlessness');
    });

    it('accepts a 0-10 painScore and the very_severe severity band (subj-14)', () => {
      const result = validateUpdatePrescriptionBody({
        complaints: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Knee pain',
            severity: 'very_severe',
            painScore: 9,
          },
        ],
      });
      expect(result.complaints![0].severity).toBe('very_severe');
      expect(result.complaints![0].painScore).toBe(9);
    });

    it('rejects a painScore outside 0-10', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          complaints: [
            { id: '44444444-4444-4444-8444-444444444444', name: 'Knee pain', painScore: 11 },
          ],
        })
      ).toThrow(ValidationError);
    });

    it('prefers investigationsOrders over investigations when both are set', () => {
      const result = validateUpdatePrescriptionBody({
        investigations: 'legacy CBC',
        investigationsOrders: 'CBC, LFT',
      });
      expect(result.investigations).toBe('CBC, LFT');
      expect(
        (result as { investigationsOrders?: string }).investigationsOrders
      ).toBeUndefined();
    });
  });

  describe('examinationJson validation (obj-01)', () => {
    it('preserves valid per-system rows and round-trips findings/notes', () => {
      const result = validateUpdatePrescriptionBody({
        examinationJson: [
          { systemId: 'general', status: 'normal' },
          {
            systemId: 'respiratory',
            status: 'abnormal',
            findings: ['crepitations', 'wheeze'],
            notes: 'right base',
          },
        ],
      });
      expect(result.examinationJson).toHaveLength(2);
      expect(result.examinationJson![0]).toEqual({
        systemId: 'general',
        status: 'normal',
        findings: [],
        notes: null,
      });
      expect(result.examinationJson![1]).toEqual({
        systemId: 'respiratory',
        status: 'abnormal',
        findings: [
          { findingId: 'crepitations', attributes: {} },
          { findingId: 'wheeze', attributes: {} },
        ],
        notes: 'right base',
      });
    });

    it('drops rows with an empty/missing systemId without rejecting the save', () => {
      const result = validateUpdatePrescriptionBody({
        examinationJson: [
          { systemId: '   ', status: 'normal' },
          { status: 'abnormal', findings: ['x'] },
          { systemId: 'cardiovascular', status: 'normal' },
        ],
      });
      expect(result.examinationJson).toHaveLength(1);
      expect(result.examinationJson![0].systemId).toBe('cardiovascular');
    });

    it('skips rows with a bad status rather than rejecting the whole array', () => {
      const result = validateUpdatePrescriptionBody({
        examinationJson: [
          { systemId: 'general', status: 'weird' },
          { systemId: 'skin', status: 'abnormal', findings: ['rash'] },
        ],
      });
      expect(result.examinationJson).toHaveLength(1);
      expect(result.examinationJson![0].systemId).toBe('skin');
    });

    it('filters empty findings strings and trims systemId', () => {
      const result = validateUpdatePrescriptionBody({
        examinationJson: [
          { systemId: '  abdomen  ', status: 'abnormal', findings: ['tender', '', '  '] },
        ],
      });
      expect(result.examinationJson![0].systemId).toBe('abdomen');
      expect(result.examinationJson![0].findings).toEqual([
        { findingId: 'tender', attributes: {} },
      ]);
    });

    it('accepts structured finding entries with attributes (obj-31)', () => {
      const result = validateUpdatePrescriptionBody({
        examinationJson: [
          {
            systemId: 'general',
            status: 'abnormal',
            findings: [
              { findingId: 'pallor', attributes: { site: 'Conjunctival', severity: 'Mild' } },
            ],
          },
        ],
      });
      expect(result.examinationJson![0].findings).toEqual([
        { findingId: 'pallor', attributes: { site: 'Conjunctival', severity: 'Mild' } },
      ]);
    });

    it('accepts an empty array (legacy free-text passthrough)', () => {
      const result = validateUpdatePrescriptionBody({ examinationJson: [] });
      expect(result.examinationJson).toEqual([]);
    });
  });

  describe('testResultsJson validation (obj-20)', () => {
    it('preserves a valid row set, dropping unknown keys and collapsing empties', () => {
      const result = validateUpdatePrescriptionBody({
        testResultsJson: [
          {
            id: 'r1',
            source: 'patient_report',
            name: '  HbA1c  ',
            value: '7.8',
            unit: '%',
            date: '2026-06-10',
            interpretation: 'high',
            notes: '  fasting  ',
            extra: 'should be dropped',
          },
          { id: 'r2', source: 'in_clinic_poc', name: 'RBS', unit: '' },
        ],
      });
      expect(result.testResultsJson).toHaveLength(2);
      expect(result.testResultsJson![0]).toEqual({
        id: 'r1',
        source: 'patient_report',
        name: 'HbA1c',
        value: '7.8',
        unit: '%',
        date: '2026-06-10',
        interpretation: 'high',
        notes: 'fasting',
        reportId: null,
        refLow: null,
        refHigh: null,
        refText: null,
      });
      expect(result.testResultsJson![1]).toEqual({
        id: 'r2',
        source: 'in_clinic_poc',
        name: 'RBS',
        value: null,
        unit: null,
        date: null,
        interpretation: null,
        notes: null,
        reportId: null,
        refLow: null,
        refHigh: null,
        refText: null,
      });
    });

    it('drops rows with a bad source or missing name without rejecting the save', () => {
      const result = validateUpdatePrescriptionBody({
        testResultsJson: [
          { id: 'a', source: 'unknown', name: 'X' },
          { id: 'b', source: 'patient_report', name: '   ' },
          { source: 'in_clinic_poc', name: 'NoId' },
          { id: 'c', source: 'in_clinic_poc', name: 'RBS', value: '180' },
        ],
      });
      expect(result.testResultsJson).toHaveLength(1);
      expect(result.testResultsJson![0].id).toBe('c');
    });

    it('collapses a bad interpretation enum to null and keeps the row', () => {
      const result = validateUpdatePrescriptionBody({
        testResultsJson: [
          { id: 'r1', source: 'in_clinic_poc', name: 'RBS', interpretation: 'weird' },
        ],
      });
      expect(result.testResultsJson).toHaveLength(1);
      expect(result.testResultsJson![0].interpretation).toBeNull();
    });

    it('accepts an empty array (legacy free-text passthrough)', () => {
      const result = validateUpdatePrescriptionBody({ testResultsJson: [] });
      expect(result.testResultsJson).toEqual([]);
    });

    it('preserves reportId + reference-range fields (rpt-02)', () => {
      const result = validateUpdatePrescriptionBody({
        testResultsJson: [
          {
            id: 'r1',
            source: 'patient_report',
            name: 'Hb',
            value: '9.5',
            unit: 'g/dL',
            reportId: 'rep-1',
            refLow: 12,
            refHigh: 16,
            refText: '12–16',
          },
        ],
      });
      expect(result.testResultsJson![0]).toMatchObject({
        reportId: 'rep-1',
        refLow: 12,
        refHigh: 16,
        refText: '12–16',
      });
    });

    it('collapses a malformed reportId to null without dropping the row (rpt-02)', () => {
      const result = validateUpdatePrescriptionBody({
        testResultsJson: [
          {
            id: 'r1',
            source: 'in_clinic_poc',
            name: 'RBS',
            reportId: 42 as unknown as string,
            refLow: 'bad' as unknown as number,
          },
        ],
      });
      expect(result.testResultsJson).toHaveLength(1);
      expect(result.testResultsJson![0].reportId).toBeNull();
      expect(result.testResultsJson![0].refLow).toBeNull();
    });
  });

  describe('Vitals 2.0 extended vitals (obj-05 / migration 151)', () => {
    it('accepts in-range extended numeric vitals', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsRr: 18,
        vitalsPainScore: 4,
        vitalsGlucoseMgDl: 110.5,
        vitalsGcsTotal: 15,
        vitalsHeadCircumferenceCm: 35.2,
        vitalsMuacCm: 24.1,
        vitalsWaistCm: 82.4,
      });
      expect(result.vitalsRr).toBe(18);
      expect(result.vitalsPainScore).toBe(4);
      expect(result.vitalsGlucoseMgDl).toBe(110.5);
      expect(result.vitalsGcsTotal).toBe(15);
      expect(result.vitalsHeadCircumferenceCm).toBe(35.2);
      expect(result.vitalsMuacCm).toBe(24.1);
      expect(result.vitalsWaistCm).toBe(82.4);
    });

    it('accepts the BP posture and limb enums', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsBpPosture: 'sitting',
        vitalsBpLimb: 'left_arm',
      });
      expect(result.vitalsBpPosture).toBe('sitting');
      expect(result.vitalsBpLimb).toBe('left_arm');
    });

    it('accepts null for extended vitals (not recorded)', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsRr: null,
        vitalsGcsTotal: null,
        vitalsBpPosture: null,
        vitalsBpLimb: null,
      });
      expect(result.vitalsRr).toBeNull();
      expect(result.vitalsGcsTotal).toBeNull();
      expect(result.vitalsBpPosture).toBeNull();
      expect(result.vitalsBpLimb).toBeNull();
    });

    it('rejects respiratory rate above CHECK max', () => {
      expect(() => validateUpdatePrescriptionBody({ vitalsRr: 200 })).toThrow(
        ValidationError,
      );
    });

    it('rejects pain score above 10', () => {
      expect(() => validateUpdatePrescriptionBody({ vitalsPainScore: 11 })).toThrow(
        ValidationError,
      );
    });

    it('rejects GCS total below the 3–15 range', () => {
      expect(() => validateUpdatePrescriptionBody({ vitalsGcsTotal: 2 })).toThrow(
        ValidationError,
      );
    });

    it('rejects glucose above the mg/dL CHECK max', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsGlucoseMgDl: 2000 }),
      ).toThrow(ValidationError);
    });

    it('rejects an unknown BP posture value', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsBpPosture: 'reclined' }),
      ).toThrow(ValidationError);
    });

    it('rejects an unknown BP limb value', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsBpLimb: 'foot' }),
      ).toThrow(ValidationError);
    });

    it('does not alter the existing 7 vitals when extended vitals are set', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsBpSystolic: 120,
        vitalsHtCm: 170,
        vitalsRr: 16,
      });
      expect(result.vitalsBpSystolic).toBe(120);
      expect(result.vitalsHtCm).toBe(170);
      expect(result.vitalsRr).toBe(16);
    });
  });

  describe('vitals_json extended vitals (vit-03 / migration 156)', () => {
    it('accepts in-range numeric + categorical json vitals', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: {
          vitalsO2FlowLMin: 4,
          vitalsFio2Pct: 40,
          vitalsGcsE: 4,
          vitalsGcsV: 5,
          vitalsGcsM: 6,
          vitalsFetalHeartRateBpm: 140,
          vitalsO2DeliveryMethod: 'nasal_cannula',
          vitalsGlucoseTiming: 'fasting',
          vitalsAvpu: 'alert',
        },
      });
      expect(result.vitalsJson).toMatchObject({
        vitalsO2FlowLMin: 4,
        vitalsFio2Pct: 40,
        vitalsGcsE: 4,
        vitalsFetalHeartRateBpm: 140,
        vitalsO2DeliveryMethod: 'nasal_cannula',
        vitalsAvpu: 'alert',
      });
    });

    it('accepts an empty json object', () => {
      const result = validateUpdatePrescriptionBody({ vitalsJson: {} });
      expect(result.vitalsJson).toEqual({});
    });

    it('strips unknown json keys rather than rejecting (degradable)', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: { vitalsO2FlowLMin: 2, vitalsUnknownKey: 99 } as never,
      });
      expect(result.vitalsJson).toEqual({ vitalsO2FlowLMin: 2 });
    });

    it('accepts null for a json vital (not recorded)', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: { vitalsHipCm: null },
      });
      expect(result.vitalsJson?.vitalsHipCm ?? null).toBeNull();
    });

    it('rejects a numeric json vital above its registry bound', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsJson: { vitalsFio2Pct: 150 } }),
      ).toThrow(ValidationError);
    });

    it('rejects a numeric json vital below its registry bound', () => {
      expect(() =>
        validateUpdatePrescriptionBody({ vitalsJson: { vitalsGcsE: 0 } }),
      ).toThrow(ValidationError);
    });

    it('rejects an unknown categorical json value', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          vitalsJson: { vitalsO2DeliveryMethod: 'space_helmet' as never },
        }),
      ).toThrow(ValidationError);
    });

    it('does not perturb the shipped vitals_* columns', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsBpSystolic: 118,
        vitalsJson: { vitalsPefrLMin: 420 },
      });
      expect(result.vitalsBpSystolic).toBe(118);
      expect(result.vitalsJson?.vitalsPefrLMin).toBe(420);
    });

    it('accepts multi-reading bpReadings in vitalsJson', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsBpSystolic: 138,
        vitalsBpDiastolic: 88,
        vitalsJson: {
          bpReadings: [
            { systolic: 138, diastolic: 88, posture: 'sitting', limb: 'left_arm' },
            { systolic: 132, diastolic: 84, posture: 'sitting', limb: 'right_arm' },
          ],
        },
      });
      expect(result.vitalsJson?.bpReadings).toHaveLength(2);
    });

    it('rejects out-of-bounds bpReadings systolic', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          vitalsJson: {
            bpReadings: [{ systolic: 400, diastolic: 80 }],
          },
        }),
      ).toThrow(ValidationError);
    });

    it('accepts bpContext and row provenance in vitalsJson', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: {
          bpContext: {
            measuredBy: 'nurse',
            method: 'manual_auscultatory',
            setting: 'clinic',
          },
          bpReadings: [
            {
              systolic: 138,
              diastolic: 88,
              measuredBy: 'physician',
              setting: 'clinic',
            },
            { systolic: 132, diastolic: 84, setting: 'home' },
          ],
        },
      });
      expect(result.vitalsJson?.bpContext).toMatchObject({
        measuredBy: 'nurse',
        setting: 'clinic',
      });
      const readings = result.vitalsJson?.bpReadings;
      expect(Array.isArray(readings) && readings[1]?.setting).toBe('home');
    });

    it("rejects invalid bpContext measuredBy", () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          vitalsJson: {
            bpContext: { measuredBy: 'invalid' },
          },
        }),
      ).toThrow(ValidationError);
    });

    it('accepts provenance overrides for all numeric vitals except BP in vitalsJson', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: {
          measurementContext: { measuredBy: 'patient', setting: 'home' },
          vitalProvenance: {
            vitalsWtKg: { measuredBy: 'nurse', setting: 'clinic' },
            vitalsTempC: { measuredBy: 'physician' },
            vitalsRr: { measuredBy: 'nurse', setting: 'clinic' },
            vitalsHr: { measuredBy: 'nurse' },
            vitalsHtCm: { measuredBy: 'caregiver', setting: 'home' },
          },
        },
      });
      expect(result.vitalsJson?.vitalProvenance).toMatchObject({
        vitalsWtKg: { measuredBy: 'nurse', setting: 'clinic' },
        vitalsTempC: { measuredBy: 'physician' },
        vitalsRr: { measuredBy: 'nurse', setting: 'clinic' },
        vitalsHr: { measuredBy: 'nurse' },
        vitalsHtCm: { measuredBy: 'caregiver', setting: 'home' },
      });
    });

    it('strips unknown vitalProvenance keys', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: {
          vitalProvenance: {
            vitalsBpSystolic: { measuredBy: 'nurse' },
            notAVital: { measuredBy: 'nurse' },
          } as never,
        },
      });
      expect(result.vitalsJson?.vitalProvenance).toEqual({});
    });

    it('rejects invalid vitalProvenance measuredBy', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          vitalsJson: {
            vitalProvenance: {
              vitalsWtKg: { measuredBy: 'invalid' },
            },
          },
        }),
      ).toThrow(ValidationError);
    });

    it('accepts bp reading note and rejects over-length note', () => {
      const result = validateUpdatePrescriptionBody({
        vitalsJson: {
          bpReadings: [{ systolic: 120, diastolic: 80, note: 'Seated 5 minutes' }],
        },
      });
      expect(result.vitalsJson?.bpReadings).toMatchObject([
        { note: 'Seated 5 minutes' },
      ]);
      expect(() =>
        validateUpdatePrescriptionBody({
          vitalsJson: {
            bpReadings: [{ systolic: 120, diastolic: 80, note: 'x'.repeat(201) }],
          },
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('validateCreatePrescriptionBody', () => {
    it('accepts structured SOAP fields on create', () => {
      const result = validateCreatePrescriptionBody({
        appointmentId: APPOINTMENT_ID,
        type: 'structured',
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
        differentialDiagnosis: ['URI'],
        followUpValue: 5,
        followUpUnit: 'days',
      });
      expect(result.vitalsBpSystolic).toBe(120);
      expect(result.differentialDiagnosis).toEqual(['URI']);
      expect(result.followUpValue).toBe(5);
      expect(result.followUpUnit).toBe('days');
    });

    it('rejects follow-up value without unit', () => {
      expect(() =>
        validateCreatePrescriptionBody({
          appointmentId: APPOINTMENT_ID,
          type: 'structured',
          followUpValue: 3,
        })
      ).toThrow(ValidationError);
    });
  });

  describe('socialHistoryStructured validation (sh-02)', () => {
    const validStructured = {
      smoking: {
        status: 'ex' as const,
        products: [{ id: 'p1', type: 'cigarette', perDay: 10, years: 20 }],
        quitYearsAgo: 2,
      },
      alcohol: {
        status: 'current' as const,
        drinks: [
          {
            id: 'd1',
            type: 'spirits',
            amount: 1,
            amountUnit: 'peg',
            frequency: 14,
            frequencyUnit: 'week' as const,
          },
        ],
        pattern: 'daily' as const,
        cage: { cutDown: true, annoyed: true, guilty: false, eyeOpener: false },
        auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 0 },
        auditFull: {
          unableToStop: 1,
          failedExpectations: 0,
          morningDrink: 0,
          guiltRemorse: 1,
          blackout: 0,
          injury: 0,
          othersConcerned: 2,
        },
        maxPerSession: { amount: 8, amountUnit: 'peg' },
      },
      notes: 'Lives with parents',
    };

    it('accepts structured social history on create and update', () => {
      const created = validateCreatePrescriptionBody({
        appointmentId: APPOINTMENT_ID,
        type: 'structured',
        socialHistoryStructured: validStructured,
        socialHistory: 'Smoking: Ex-smoker',
      });
      expect(created.socialHistoryStructured?.smoking?.status).toBe('ex');
      expect(created.socialHistoryStructured?.alcohol?.cage?.cutDown).toBe(true);
      expect(created.socialHistoryStructured?.alcohol?.auditC?.frequency).toBe(2);
      expect(created.socialHistoryStructured?.alcohol?.auditFull?.othersConcerned).toBe(2);
      expect(created.socialHistoryStructured?.alcohol?.maxPerSession?.amount).toBe(8);

      const updated = validateUpdatePrescriptionBody({
        socialHistoryStructured: validStructured,
      });
      expect(updated.socialHistoryStructured?.notes).toBe('Lives with parents');
    });

    it('rejects perDay above the bounded max', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            smoking: {
              status: 'current',
              products: [{ id: 'p1', type: 'cigarette', perDay: 201 }],
            },
          },
        })
      ).toThrow(ValidationError);
    });

    it('rejects invalid smoking status enum', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            smoking: { status: 'sometimes', products: [] },
          },
        })
      ).toThrow(ValidationError);
    });

    it('rejects AUDIT-C answers outside 0–4', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            alcohol: {
              status: 'current',
              drinks: [],
              auditC: { frequency: 5, typicalQuantity: 1, bingeFrequency: 0 },
            },
          },
        })
      ).toThrow(ValidationError);
    });

    it('accepts interval frequency and max per session on alcohol', () => {
      const body = validateUpdatePrescriptionBody({
        socialHistoryStructured: {
          alcohol: {
            status: 'current',
            drinks: [
              {
                id: 'd1',
                type: 'spirits',
                amount: 2,
                amountUnit: 'peg',
                frequency: 10,
                frequencyUnit: 'interval' as const,
              },
            ],
            maxPerSession: { amount: 6, amountUnit: 'units' },
          },
        },
      });
      expect(body.socialHistoryStructured?.alcohol?.drinks[0]?.frequencyUnit).toBe('interval');
      expect(body.socialHistoryStructured?.alcohol?.maxPerSession?.amountUnit).toBe('units');
    });

    it('accepts optional abv on drink rows and rejects out-of-range values', () => {
      const body = validateUpdatePrescriptionBody({
        socialHistoryStructured: {
          alcohol: {
            status: 'current',
            drinks: [{ id: 'd1', type: 'beer', amount: 330, amountUnit: 'ml', abv: 8 }],
          },
        },
      });
      expect(body.socialHistoryStructured?.alcohol?.drinks[0]?.abv).toBe(8);

      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            alcohol: {
              status: 'current',
              drinks: [{ id: 'd1', type: 'beer', amount: 330, amountUnit: 'ml', abv: 101 }],
            },
          },
        })
      ).toThrow(ValidationError);
    });

    it('rejects notes longer than PRESCRIPTION_HISTORY_MAX', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            notes: 'x'.repeat(2001),
          },
        })
      ).toThrow(ValidationError);
    });
  });

  describe('socialHistoryStructured phase-2 validation (sh-05)', () => {
    const validPhase2 = {
      substances: { uses: ['cannabis'], route: 'inhaled' as const },
      diet: { type: 'vegetarian' as const, caffeineCupsPerDay: 2 },
      activity: { level: 'moderate' as const, daysPerWeek: 3 },
      occupation: { text: 'Farmer', exposures: ['dust', 'heat'] },
      living: { situation: 'with-family' as const },
      travel: { recent: true, place: 'Mumbai' },
      sickContact: { present: true, types: ['flu-covid-cold'], context: ['household'] },
      sleep: { hoursPerNight: 6, quality: 'poor' as const },
      stress: { level: 'high' as const, support: 'limited' as const },
      sexual: { enabled: true, active: true, protection: 'sometimes' as const },
    };

    it('accepts phase-2 structured social history on create and update', () => {
      const created = validateCreatePrescriptionBody({
        appointmentId: APPOINTMENT_ID,
        type: 'structured',
        socialHistoryStructured: validPhase2,
      });
      expect(created.socialHistoryStructured?.diet?.type).toBe('vegetarian');
      expect(created.socialHistoryStructured?.substances?.route).toBe('inhaled');

      const updated = validateUpdatePrescriptionBody({
        socialHistoryStructured: validPhase2,
      });
      expect(updated.socialHistoryStructured?.sexual?.enabled).toBe(true);
    });

    it('accepts structured substance items with snorted route', () => {
      const updated = validateUpdatePrescriptionBody({
        socialHistoryStructured: {
          substances: {
            status: 'current',
            items: [{ id: 's1', type: 'stimulants', route: 'snorted' }],
          },
        },
      });
      expect(updated.socialHistoryStructured?.substances?.items?.[0]?.route).toBe('snorted');
    });

    it('rejects invalid substance route enum', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            substances: { uses: ['cannabis'], route: 'snorted' },
          },
        })
      ).toThrow(ValidationError);
    });

    it('rejects top-level caffeine amount above bounded max', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            caffeine: { amount: 21 },
          },
        })
      ).toThrow(ValidationError);
    });

    it('rejects legacy nested caffeine cups above bounded max', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            diet: { caffeineCupsPerDay: 21 },
          },
        })
      ).toThrow(ValidationError);
    });

    it('accepts activity v2 fields with items, job activity, and barriers', () => {
      const updated = validateUpdatePrescriptionBody({
        socialHistoryStructured: {
          activity: {
            level: 'moderate',
            daysPerWeek: 4,
            minutesPerSession: 45,
            types: ['walking', 'yoga'],
            jobActivity: 'sedentary',
            items: [{ id: 'a1', type: 'walking', daysPerWeek: 5, minutesPerSession: 30 }],
            limitedByHealth: true,
            barriers: 'knee OA',
            notes: 'goal 150 min/wk',
          },
        },
      });
      expect(updated.socialHistoryStructured?.activity?.types).toEqual(['walking', 'yoga']);
      expect(updated.socialHistoryStructured?.activity?.limitedByHealth).toBe(true);
    });

    it('rejects activity daysPerWeek above 7', () => {
      expect(() =>
        validateUpdatePrescriptionBody({
          socialHistoryStructured: {
            activity: { level: 'moderate', daysPerWeek: 8 },
          },
        })
      ).toThrow(ValidationError);
    });
  });
});

describe('attachment upload-url category (obj-22)', () => {
  it('accepts the objective category tag', () => {
    const result = validateCreateUploadUrlBody({
      filename: 'wound.jpg',
      contentType: 'image/jpeg',
      category: 'objective',
    });
    expect(result.category).toBe('objective');
  });

  it('accepts the advice category tag for patient handouts', () => {
    const result = validateCreateUploadUrlBody({
      filename: 'diagram.png',
      contentType: 'image/png',
      category: 'advice',
    });
    expect(result.category).toBe('advice');
  });

  it('omits category for a legacy photo-Rx upload (undefined, not an error)', () => {
    const result = validateCreateUploadUrlBody({ filename: 'rx.jpg', contentType: 'image/jpeg' });
    expect(result.category).toBeUndefined();
  });

  it('rejects an unknown category rather than silently widening the tag space', () => {
    expect(() =>
      validateCreateUploadUrlBody({ filename: 'x.jpg', contentType: 'image/jpeg', category: 'bogus' })
    ).toThrow(ValidationError);
  });
});

describe('attachment upload-url subjective complaint pin (sdp-02)', () => {
  it('accepts the subjective category with an optional complaintId', () => {
    const result = validateCreateUploadUrlBody({
      filename: 'rash.jpg',
      contentType: 'image/jpeg',
      category: 'subjective',
      complaintId: 'cmp-7',
    });
    expect(result.category).toBe('subjective');
    expect(result.complaintId).toBe('cmp-7');
  });

  it('accepts subjective without a complaintId (undefined, not an error)', () => {
    const result = validateCreateUploadUrlBody({
      filename: 'rash.jpg',
      contentType: 'image/jpeg',
      category: 'subjective',
    });
    expect(result.complaintId).toBeUndefined();
  });

  it('drops unknown keys instead of carrying them through', () => {
    const result = validateCreateUploadUrlBody({
      filename: 'rash.jpg',
      contentType: 'image/jpeg',
      category: 'subjective',
      complaintId: 'cmp-7',
      surprise: 'dropme',
    });
    expect(result).not.toHaveProperty('surprise');
  });

  it('rejects an over-long complaintId rather than accepting an unbounded segment', () => {
    expect(() =>
      validateCreateUploadUrlBody({
        filename: 'rash.jpg',
        contentType: 'image/jpeg',
        category: 'subjective',
        complaintId: 'c'.repeat(65),
      })
    ).toThrow(ValidationError);
  });
});

describe('labReportsJsonSchema validation (rpt-02 / migration 159)', () => {
  it('preserves a valid header, defaulting attachmentIds and collapsing empties', () => {
    const result = labReportsJsonSchema.parse([
      {
        id: 'rep-1',
        kind: 'lab',
        title: '  CBC panel  ',
        reportDate: '2026-07-01',
        labName: '',
        entryMethod: 'extracted',
      },
    ]);
    expect(result).toEqual([
      {
        id: 'rep-1',
        kind: 'lab',
        title: 'CBC panel',
        reportDate: '2026-07-01',
        labName: null,
        attachmentIds: [],
        findings: null,
        entryMethod: 'extracted',
      },
    ]);
  });

  it('drops a malformed header (missing title / bad kind) without rejecting the save', () => {
    const result = labReportsJsonSchema.parse([
      { id: 'a', kind: 'lab', title: '   ' },
      { id: 'b', kind: 'ultrasound', title: 'USG abdomen' },
      { kind: 'imaging', title: 'No id' },
      { id: 'c', kind: 'imaging', title: 'X-ray chest', findings: 'Clear lung fields' },
    ]);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ id: 'c', kind: 'imaging', findings: 'Clear lung fields' });
  });

  it('defaults an absent / unknown entryMethod to manual', () => {
    const result = labReportsJsonSchema.parse([
      { id: 'r1', kind: 'lab', title: 'LFT' },
      { id: 'r2', kind: 'lab', title: 'KFT', entryMethod: 'imported' },
    ]);
    expect(result![0].entryMethod).toBe('manual');
    expect(result![1].entryMethod).toBe('manual');
  });

  it('returns undefined for an absent field (passthrough)', () => {
    expect(labReportsJsonSchema.parse(undefined)).toBeUndefined();
  });
});
