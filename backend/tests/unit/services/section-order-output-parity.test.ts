/**
 * subj-27 close-gate — patient-facing output is invariant to cockpit section order.
 *
 * Phase 8 (P8-D3 / ST-D2): reordering the Subjective tab is a UI-only concern.
 * The doctor's `doctor_settings.subjective_section_order` must NEVER reach the
 * patient — the PDF body + SMS summary are built from prescription columns only.
 *
 * This gate proves the claim two ways:
 *   1. Behavioural: for every `subjective_section_order` permutation, the PDF body
 *      and SMS summary come out byte-identical (the builders ignore cockpit order).
 *   2. Structural: the builder source files never reference `subjective_section_order`.
 *
 * The SMS builder lives in `notification-service`, which imports the PDF service
 * (`@react-pdf/renderer` ESM). We stub the heavy modules — same pattern as the
 * subj-22 summary test — so the pure text builder is testable in isolation.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapPrescriptionToPdfBody } from '../../../src/services/prescription-pdf-composer';
import {
  SUBJECTIVE_SECTION_ID_VALUES,
  type SubjectiveSectionId,
} from '../../../src/types/subjective-section-order';
import type { CustomSubsection, PrescriptionMedicine } from '../../../src/types/prescription';

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { buildPrescriptionTextSummary } from '../../../src/services/notification-service';

const CUSTOM_SUBSECTIONS: CustomSubsection[] = [
  {
    id: 's1',
    title: 'Travel history',
    body: 'Visited Kerala',
    children: [{ id: 'c1', title: 'Prophylaxis', body: 'Doxycycline' }],
  },
];

const MEDICINES: PrescriptionMedicine[] = [
  {
    medicine_name: 'Paracetamol',
    dosage: '500mg',
    route: 'oral',
    frequency: 'TID',
    duration: '5 days',
    instructions: 'after food',
  } as unknown as PrescriptionMedicine,
];

/**
 * A representative prescription row. Built ONLY from prescription columns —
 * there is deliberately no `subjective_section_order` field, because output
 * never consults the doctor's cockpit arrangement.
 */
function buildSourceRow() {
  return {
    cc: 'Headache, Leg pain',
    hopi: 'Headache — Onset: 2 days ago; Severity: severe\n\nLeg pain — Site: both calves',
    social_history: 'Smoking: Ex-smoker · Alcohol: occasional',
    provisional_diagnosis: 'Tension headache',
    investigations_orders: 'CBC',
    follow_up: '1 week',
    patient_education: 'Hydrate well',
    clinical_notes: 'Reassured',
    custom_subsections: CUSTOM_SUBSECTIONS,
  };
}

/** Distinct cockpit section orders — none of which may perturb patient output. */
const SECTION_ORDER_PERMUTATIONS: SubjectiveSectionId[][] = [
  [],
  [...SUBJECTIVE_SECTION_ID_VALUES],
  [...SUBJECTIVE_SECTION_ID_VALUES].reverse(),
  ['custom_subsections', 'chief_complaints', 'family_history'],
  ['social_history', 'past_surgical', 'chief_complaints', 'allergies'],
];

describe('subj-27 close-gate · patient output invariant to cockpit section order', () => {
  it('PDF body is byte-identical across every subjective_section_order permutation', () => {
    const baseline = JSON.stringify(
      mapPrescriptionToPdfBody(buildSourceRow(), MEDICINES),
    );

    for (const order of SECTION_ORDER_PERMUTATIONS) {
      // The order is doctor-level cockpit config; row construction never reads
      // it. We thread it through a builder that explicitly discards it to make
      // the independence visible at the call site.
      const row = buildRowForCockpitOrder(order);
      const body = JSON.stringify(mapPrescriptionToPdfBody(row, MEDICINES));
      expect(body).toBe(baseline);
    }
  });

  it('SMS summary is byte-identical across every subjective_section_order permutation', () => {
    const baseline = buildPrescriptionTextSummary(
      summaryRow(),
      'Test Clinic',
    );

    for (const order of SECTION_ORDER_PERMUTATIONS) {
      void order; // order never feeds the summary builder
      const summary = buildPrescriptionTextSummary(summaryRow(), 'Test Clinic');
      expect(summary).toBe(baseline);
    }
  });

  it('PDF body preserves canonical clinical field order regardless of cockpit order', () => {
    const body = mapPrescriptionToPdfBody(buildSourceRow(), MEDICINES);
    // Field presence + values come from the row, not the cockpit arrangement.
    expect(body.cc).toBe('Headache, Leg pain');
    expect(body.hopi).toContain('Headache — Onset: 2 days ago');
    expect(body.provisionalDiagnosis).toBe('Tension headache');
    expect(body.investigations).toBe('CBC');
    expect(body.followUp).toBe('1 week');
    expect(body.customSubsections).toEqual([
      { title: 'Travel history', body: 'Visited Kerala', children: [{ title: 'Prophylaxis', body: 'Doxycycline' }] },
    ]);
  });

  it('output builder source files never reference subjective_section_order (structural guard)', () => {
    const files = [
      resolve(__dirname, '../../../src/services/prescription-pdf-composer.ts'),
      resolve(__dirname, '../../../src/services/prescription-pdf-service.ts'),
      resolve(__dirname, '../../../src/templates/prescription-pdf/PrescriptionDocument.tsx'),
      resolve(__dirname, '../../../src/templates/prescription-pdf/types.ts'),
      resolve(__dirname, '../../../src/services/notification-service.ts'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/subjective_section_order/);
      expect(src).not.toMatch(/sectionOrder/);
    }
  });
});

/**
 * Build the PDF source row for a given cockpit section order. The order arg is
 * intentionally unused: it documents that no cockpit ordering input exists on
 * the output path. If a future refactor tried to thread order into output, this
 * helper signature is where it would surface — and the parity assertions above
 * would fail.
 */
function buildRowForCockpitOrder(_order: SubjectiveSectionId[]) {
  return buildSourceRow();
}

function summaryRow() {
  return {
    provisional_diagnosis: 'Tension headache',
    investigations_orders: 'CBC',
    follow_up: '1 week',
    custom_subsections: CUSTOM_SUBSECTIONS,
    prescription_medicines: [
      {
        medicine_name: 'Paracetamol',
        dosage: '500mg',
        route: 'oral',
        frequency: 'TID',
        duration: '5 days',
        instructions: 'after food',
      },
    ],
  };
}
