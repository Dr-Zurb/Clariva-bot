/**
 * subj-22 — SMS/snapshot text summary custom-subsections block.
 *
 * Focused test for `buildPrescriptionTextSummary`. We mock the heavy modules
 * `notification-service` pulls in at import time (notably the PDF service,
 * which loads `@react-pdf/renderer` ESM and otherwise breaks the jest CJS
 * transform — the known pre-existing infra failure noted in subj-10). With
 * those stubbed, the pure text builder is testable in isolation.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { buildPrescriptionTextSummary } from '../../../src/services/notification-service';

describe('buildPrescriptionTextSummary custom subsections (subj-22)', () => {
  it('appends the custom-subsections block after follow-up when present', () => {
    const summary = buildPrescriptionTextSummary(
      {
        provisional_diagnosis: 'Tension headache',
        follow_up: '1 week',
        custom_subsections: [
          {
            id: 's1',
            title: 'Travel history',
            body: 'Visited Kerala',
            children: [{ id: 'c1', title: 'Prophylaxis', body: 'Doxycycline' }],
          },
        ],
      },
      'Test Clinic',
    );

    expect(summary).toContain('**Additional notes:**');
    expect(summary).toContain('Travel history');
    expect(summary).toContain('  Prophylaxis');
    expect(summary.indexOf('**Additional notes:**')).toBeGreaterThan(
      summary.indexOf('**Follow-up:**'),
    );
  });

  it('omits the block entirely when no custom subsection survives', () => {
    const summary = buildPrescriptionTextSummary(
      {
        provisional_diagnosis: 'Tension headache',
        custom_subsections: [{ id: 's', title: '   ', body: '  ', children: [] }],
      },
      'Test Clinic',
    );
    expect(summary).not.toContain('**Additional notes:**');
  });

  it('does not change existing fields when custom_subsections is absent', () => {
    const summary = buildPrescriptionTextSummary(
      { provisional_diagnosis: 'Tension headache', follow_up: '1 week' },
      'Test Clinic',
    );
    expect(summary).not.toContain('**Additional notes:**');
    expect(summary).toContain('**Diagnosis:** Tension headache');
    expect(summary).toContain('**Follow-up:** 1 week');
  });
});

describe('buildPrescriptionTextSummary exam isolation (obj-04 close-gate)', () => {
  // OBJ-D2 gate: the SMS summary never reads examination_findings /
  // examination_json — the structured-exam program must not perturb the SMS
  // text. Byte-identical output whether or not the exam fields are present.
  const base = {
    provisional_diagnosis: 'Acute bronchitis',
    follow_up: '3 days',
    prescription_medicines: [
      { medicine_name: 'Azithromycin', dosage: '500 mg', frequency: 'OD', duration: '3 days' },
    ],
  };

  it('produces byte-identical SMS whether or not exam fields are present', () => {
    const withoutExam = buildPrescriptionTextSummary(base, 'Test Clinic');
    const withExam = buildPrescriptionTextSummary(
      {
        ...base,
        examination_findings:
          'General: Normal\nRespiratory: Crackles (right base)',
        examination_json: [
          { systemId: 'general', status: 'normal', findings: [], notes: null },
          { systemId: 'resp', status: 'abnormal', findings: ['Crackles'], notes: 'right base' },
        ],
      } as Parameters<typeof buildPrescriptionTextSummary>[0],
      'Test Clinic',
    );

    expect(withExam).toBe(withoutExam);
    expect(withExam).not.toContain('Crackles');
    expect(withExam).not.toContain('Respiratory');
  });
});
