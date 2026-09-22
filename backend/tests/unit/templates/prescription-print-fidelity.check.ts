/**
 * Shown slip vs printed slip.
 *
 * Run with ts-node (Jest cannot parse @react-pdf/renderer, which is ESM).
 * Renders a real PDF and reads the text back. Every medicine, including
 * the last one, and every other patient-facing section must survive.
 * A private clinician note must not.
 */

import * as path from 'path';
import * as assert from 'assert';
import * as React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { mapPrescriptionToPdfBody } from '../../../src/services/prescription-pdf-composer';
import { PrescriptionDocument } from '../../../src/templates/prescription-pdf/PrescriptionDocument';
import type { PrescriptionPdfData } from '../../../src/templates/prescription-pdf/types';
import type { PrescriptionMedicine } from '../../../src/types/prescription';
import { projectMedicineForDisplay } from '../../../src/utils/medicine-display';

const PRIVATE_NOTE = 'PRIVATE_CLINICIAN_NOTE_SHOULD_NOT_PRINT';

const SECTIONS = {
  allergies: 'Penicillin rash',
  cc: 'Knee pain for three days',
  hopi: 'Worse when walking downstairs',
  vitals: 'BP 128/82 HR 76',
  examinationFindings: 'Knee tender without swelling',
  socialHistory: 'Does not smoke',
  provisionalDiagnosis: 'Osteoarthritis of the left knee',
  investigations: 'Left knee X-ray only',
  advice: 'Rest the knee and use ice',
  followUp: 'Review in seven days',
  referral: 'Refer to orthopaedics if it persists',
} as const;

function medicine(
  partial: Pick<PrescriptionMedicine, 'medicine_name' | 'sort_order'> &
    Partial<PrescriptionMedicine>,
): PrescriptionMedicine {
  return {
    id: `med-${partial.sort_order}`,
    prescription_id: 'rx-fidelity',
    dosage: null,
    route: null,
    frequency: null,
    duration: null,
    instructions: null,
    created_at: '2026-09-22T00:00:00.000Z',
    drug_master_id: null,
    frequency_code: null,
    duration_value: null,
    duration_unit: null,
    route_code: null,
    dose_qty: null,
    dose_unit: null,
    form: null,
    food_timing: null,
    ...partial,
  };
}

const VISIT_MEDICINES: PrescriptionMedicine[] = [
  medicine({
    medicine_name: 'Tablet telmisartan',
    sort_order: 0,
    dose_qty: 0.5,
    dose_unit: 'tab',
    route_code: 'oral',
    frequency_code: 'OD',
    duration_value: 20,
    duration_unit: 'days',
  }),
  medicine({
    medicine_name: 'Tablet amlodipine',
    sort_order: 1,
    dose_qty: 1,
    dose_unit: 'tab',
    route_code: 'oral',
    frequency_code: 'OD',
    duration_value: 20,
    duration_unit: 'days',
  }),
  medicine({
    medicine_name: 'Syrup Aluminium Hydroxide + Magnesium Hydroxide + Simethicone',
    sort_order: 2,
    dose_qty: 5,
    dose_unit: 'ml',
    route_code: 'oral',
  }),
  medicine({
    medicine_name: 'diclo para',
    sort_order: 3,
    route_code: 'oral',
    frequency_code: 'PRN',
  }),
  medicine({
    medicine_name: 'Tablet Calcium Carbonate + Vit D3',
    sort_order: 4,
    dosage: '500 mg',
    route_code: 'oral',
  }),
  medicine({
    medicine_name: 'Lotion Calamine',
    sort_order: 5,
    dosage: '8%',
    route_code: 'topical',
  }),
  medicine({
    medicine_name: 'Cream Betamethasone salicylate',
    sort_order: 6,
    dosage: '0.1%',
    route_code: 'topical',
  }),
  medicine({
    medicine_name: 'Tablet levocetrizine',
    sort_order: 7,
    dose_qty: 1,
    dose_unit: 'tab',
    route_code: 'oral',
    frequency: '0-0-1',
    duration_value: 10,
    duration_unit: 'days',
    instructions: 'At night',
  }),
];

function composedBody(medicines: PrescriptionMedicine[]): PrescriptionPdfData['body'] {
  const mapped = mapPrescriptionToPdfBody(
    {
      cc: SECTIONS.cc,
      hopi: SECTIONS.hopi,
      social_history: SECTIONS.socialHistory,
      examination_findings: SECTIONS.examinationFindings,
      vitals_bp_systolic: 128,
      vitals_bp_diastolic: 82,
      vitals_hr: 76,
      provisional_diagnosis: SECTIONS.provisionalDiagnosis,
      investigations_orders: SECTIONS.investigations,
      follow_up: SECTIONS.followUp,
      patient_education: null,
      advice: SECTIONS.advice,
      referral: SECTIONS.referral,
      clinical_notes: PRIVATE_NOTE,
      custom_subsections: [{ title: 'Range of motion', body: 'Full extension', children: [] }],
      assessment_custom_sections: [{ title: 'Risk factors', body: 'None recorded', children: [] }],
      plan_custom_sections: [{ title: 'Home care', body: 'Elevate the leg', children: [] }],
    },
    medicines,
    { allergies: [{ allergen: 'Penicillin', reaction: 'rash' }] },
  );
  assert.ok(!JSON.stringify(mapped).includes(PRIVATE_NOTE), 'private note leaked into the PDF body');
  assert.strictEqual(mapped.medicines.length, medicines.length);
  mapped.medicines.forEach((row, i) => {
    assert.strictEqual(row.medicine_name, medicines[i]?.medicine_name);
  });
  return mapped;
}

function pdfData(medicines: PrescriptionMedicine[]): PrescriptionPdfData {
  return {
    header: {
      doctorName: 'Dr. Demo',
      clinicName: 'Demo Clinic',
      qualifications: 'MBBS',
      specialty: 'General practice',
    },
    footer: {
      doctorName: 'Dr. Demo',
      shortId: 'fid12345',
      generatedAtLabel: '22 Sep 2026 · 10:00 AM IST',
    },
    patient: {
      patientName: 'Demo Patient',
      patientAge: '31 y',
      patientGender: 'F',
      visitDateLabel: '22 Sep 2026',
    },
    body: composedBody(medicines),
  };
}

async function readPdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = require('pdfjs-dist/build/pdf.js') as {
    getDocument: (opts: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };
  const standardFontDataUrl =
    path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') +
    path.sep;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    standardFontDataUrl,
  }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str ?? '').join(' '));
  }
  return {
    text: pages.join('\n').replace(/\s+/g, ' ').trim(),
    pages: doc.numPages,
  };
}

async function renderText(medicines: PrescriptionMedicine[]): Promise<{ text: string; pages: number }> {
  const element = React.createElement(PrescriptionDocument, {
    data: pdfData(medicines),
  }) as unknown as React.ReactElement<DocumentProps>;
  const bytes = (await renderToBuffer(element)) as Buffer;
  assert.strictEqual(bytes.subarray(0, 5).toString('utf8'), '%PDF-');
  return readPdfText(bytes);
}

function flat(text: string): string {
  return text.replace(/-\s+/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function mustContain(text: string, needle: string): void {
  assert.ok(
    flat(text).includes(flat(needle)),
    `printed slip is missing: ${needle}`,
  );
}

async function checkVisit(): Promise<void> {
  const { text } = await renderText(VISIT_MEDICINES);
  mustContain(text, 'Demo Patient');
  mustContain(text, '31 y');
  mustContain(text, 'Demo Clinic');
  mustContain(text, 'MBBS');
  mustContain(text, 'General practice');
  for (const section of Object.values(SECTIONS)) {
    if (section === SECTIONS.allergies || section === SECTIONS.vitals) continue;
    mustContain(text, section);
  }
  mustContain(text, 'Penicillin');
  mustContain(text, 'rash');
  mustContain(text, '128/82');
  mustContain(text, 'HR 76');
  mustContain(text, 'Range of motion');
  mustContain(text, 'Full extension');
  mustContain(text, 'Risk factors');
  mustContain(text, 'None recorded');
  mustContain(text, 'Home care');
  mustContain(text, 'Elevate the leg');
  assert.ok(!flat(text).includes(flat(PRIVATE_NOTE)), 'private note was printed');
  assert.ok(!flat(text).includes('no medicines prescribed'), 'visit with medicines printed as empty');

  let cursor = -1;
  const printed = flat(text);
  for (const med of VISIT_MEDICINES) {
    const shown = projectMedicineForDisplay(med);
    const at = printed.indexOf(flat(shown.name));
    assert.ok(at > cursor, `medicine out of order or missing: ${shown.name}`);
    cursor = at;
    if (shown.dosage) mustContain(text, shown.dosage);
    if (shown.route) mustContain(text, shown.route);
    if (shown.frequency) mustContain(text, shown.frequency);
    if (shown.duration) mustContain(text, shown.duration);
    if (shown.instructions) mustContain(text, shown.instructions);
  }
}

async function checkLongList(): Promise<void> {
  const many = Array.from({ length: 40 }, (_, i) =>
    medicine({
      medicine_name: `Medicine ${String(i + 1).padStart(2, '0')}`,
      sort_order: i,
      dosage: `dose-${String(i + 1).padStart(2, '0')}`,
      frequency: 'Once daily',
      duration: '5 days',
      route: 'Oral',
    }),
  );
  const { text, pages } = await renderText(many);
  assert.ok(pages > 1, `expected more than one page, got ${pages}`);
  mustContain(text, 'Knee pain for three days');
  mustContain(text, 'Rest the knee and use ice');
  mustContain(text, 'Review in seven days');
  const printed = flat(text);
  const first = printed.indexOf('medicine 01');
  const last = printed.indexOf('medicine 40');
  assert.ok(first >= 0 && last > first, 'first or last medicine missing on a multi-page slip');
  assert.ok(!printed.includes('no medicines prescribed'), 'long list printed as empty');
  for (const med of many) {
    mustContain(text, med.medicine_name);
    mustContain(text, med.dosage as string);
  }
}

async function checkEmptyMedicines(): Promise<void> {
  const { text } = await renderText([]);
  mustContain(text, 'No medicines prescribed');
  mustContain(text, 'Knee pain for three days');
  mustContain(text, 'Osteoarthritis of the left knee');
  mustContain(text, 'Rest the knee and use ice');
  mustContain(text, 'Review in seven days');
  assert.ok(!flat(text).includes('tablet telmisartan'), 'empty visit invented a medicine');
  assert.ok(!flat(text).includes(flat(PRIVATE_NOTE)), 'private note was printed');
}

async function main(): Promise<void> {
  await checkVisit();
  await checkLongList();
  await checkEmptyMedicines();
  process.stdout.write('print fidelity ok\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
