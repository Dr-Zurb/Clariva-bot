/**
 * ASMT-D5 privacy guard (asmt-02): the clinical-impression note + visit acuity
 * are clinician-only. This asserts by source inspection that the patient-facing
 * readers (prescription PDF composer + document template + notification service)
 * do NOT reference `assessment_note` / `assessment_acuity` (snake or camel).
 *
 * plan-p1: clinical notes stay doctor-private on the patient PDF document and
 * SMS summary (composer may still accept `clinical_notes` on the source row).
 *
 * assessment-tab · asmt-02 · plan-p1
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PATIENT_OUTPUT_SOURCES = [
  '../../../src/services/prescription-pdf-composer.ts',
  '../../../src/templates/prescription-pdf/PrescriptionDocument.tsx',
  '../../../src/services/notification-service.ts',
];

const FORBIDDEN = [
  'assessment_note',
  'assessmentNote',
  'assessment_acuity',
  'assessmentAcuity',
  // asmt-03: structured diagnoses stay doctor-side; patient output still reads
  // only the derived provisional_diagnosis TEXT (ASMT-D4 / ASMT-D5).
  'diagnoses_json',
  'diagnosesJson',
];

describe('Assessment impression/acuity privacy (ASMT-D5)', () => {
  for (const relPath of PATIENT_OUTPUT_SOURCES) {
    const src = readFileSync(resolve(__dirname, relPath), 'utf8');
    describe(relPath, () => {
      for (const token of FORBIDDEN) {
        it(`does not reference ${token}`, () => {
          expect(src).not.toContain(token);
        });
      }
    });
  }
});

describe('Clinical notes privacy on patient document + SMS (plan-p1)', () => {
  it('PrescriptionDocument does not render a Clinical notes section', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/templates/prescription-pdf/PrescriptionDocument.tsx'),
      'utf8',
    );
    expect(src).not.toContain('label="Clinical notes"');
    expect(src).not.toContain('body.clinicalNotes');
  });

  it('SMS summary builder does not read clinical notes', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/services/notification-service.ts'),
      'utf8',
    );
    const start = src.indexOf('export function buildPrescriptionTextSummary');
    const end = src.indexOf('export async function sendPrescriptionToPatient', start);
    const summarySrc = src.slice(start, end > start ? end : undefined);
    expect(summarySrc).not.toContain('clinical_notes');
    expect(summarySrc).not.toContain('clinicalNotes');
  });
});
