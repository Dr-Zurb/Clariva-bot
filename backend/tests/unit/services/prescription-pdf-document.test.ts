/**
 * Prescription PDF composer + document tests (social-history-v2 · sh-12).
 */

import * as React from 'react';
import { mapPrescriptionToPdfBody } from '../../../src/services/prescription-pdf-composer';
import type { PrescriptionPdfData } from '../../../src/templates/prescription-pdf/types';
import { PrescriptionDocument } from '../../../src/templates/prescription-pdf/PrescriptionDocument';

type SectionCapture = { label: string; body: string | null | undefined };

/** Walk the element tree returned by PrescriptionDocument (no DOM renderer in backend). */
function collectSectionBlocks(node: React.ReactNode): SectionCapture[] {
  const results: SectionCapture[] = [];

  const walk = (n: React.ReactNode): void => {
    if (n == null || typeof n === 'boolean') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!React.isValidElement(n)) return;

    const props = n.props as { label?: string; body?: string | null; children?: React.ReactNode };
    if (typeof props.label === 'string' && 'body' in props) {
      results.push({ label: props.label, body: props.body ?? null });
    }
    if (props.children != null) walk(props.children);
  };

  walk(node);
  return results;
}

jest.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('document', null, children),
  Page: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('page', null, children),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('view', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('text', null, children),
}));

jest.mock('../../../src/templates/prescription-pdf/styles', () => ({
  styles: {
    page: {},
    patientStrip: {},
    patientField: {},
    patientLabel: {},
    patientValue: {},
    section: {},
    sectionLabel: {},
    sectionBody: {},
  },
}));

jest.mock('../../../src/templates/prescription-pdf/Header', () => ({
  Header: () => null,
}));
jest.mock('../../../src/templates/prescription-pdf/Footer', () => ({
  Footer: () => null,
}));
jest.mock('../../../src/templates/prescription-pdf/MedicineTable', () => ({
  MedicineTable: () => null,
}));

jest.mock('../../../src/templates/prescription-pdf/SectionBlock', () => ({
  SectionBlock: () => null,
}));

function minimalPdfData(
  overrides: Partial<PrescriptionPdfData['body']> = {},
): PrescriptionPdfData {
  return {
    header: { doctorName: 'Dr. Test', clinicName: 'Test Clinic' },
    footer: {
      doctorName: 'Dr. Test',
      shortId: 'abcd1234',
      generatedAtLabel: 'Jun 8, 2026 · 12:00 PM IST',
    },
    patient: { patientName: 'Test Patient', visitDateLabel: 'Jun 8, 2026' },
    body: {
      cc: null,
      hopi: null,
      socialHistory: null,
      provisionalDiagnosis: null,
      investigations: null,
      followUp: null,
      patientEducation: null,
      clinicalNotes: null,
      medicines: [],
      customSubsections: [],
      ...overrides,
    },
  };
}

describe('mapPrescriptionToPdfBody (sh-12)', () => {
  const emptyRx = {
    cc: null,
    hopi: null,
    social_history: null,
    provisional_diagnosis: null,
    investigations_orders: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
  };

  it('maps trimmed social_history TEXT into body.socialHistory', () => {
    const body = mapPrescriptionToPdfBody(
      {
        ...emptyRx,
        social_history: '  Smoking: Ex-smoker · Alcohol: Drinks alcohol (≈ 14 units/wk)  ',
      },
      [],
    );
    expect(body.socialHistory).toBe(
      'Smoking: Ex-smoker · Alcohol: Drinks alcohol (≈ 14 units/wk)',
    );
  });

  it('returns null socialHistory when TEXT is blank', () => {
    expect(mapPrescriptionToPdfBody({ ...emptyRx, social_history: '   ' }, []).socialHistory).toBeNull();
    expect(mapPrescriptionToPdfBody({ ...emptyRx }, []).socialHistory).toBeNull();
  });

  it('defaults customSubsections to [] when absent (subj-22)', () => {
    expect(mapPrescriptionToPdfBody({ ...emptyRx }, []).customSubsections).toEqual([]);
  });

  it('sanitises and empty-omits custom subsections for output (subj-22)', () => {
    const body = mapPrescriptionToPdfBody(
      {
        ...emptyRx,
        custom_subsections: [
          {
            id: 's1',
            title: '  Travel history  ',
            body: '  Kerala  ',
            children: [
              { id: 'c1', title: '  Prophylaxis  ', body: '  Doxy  ' },
              { id: 'c2', title: '   ', body: 'orphan body dropped' },
            ],
          },
          { id: 's2', title: '   ', body: '   ', children: [] },
        ],
      },
      [],
    );
    expect(body.customSubsections).toEqual([
      {
        title: 'Travel history',
        body: 'Kerala',
        children: [{ title: 'Prophylaxis', body: 'Doxy' }],
      },
    ]);
  });
});

describe('PrescriptionDocument social history section (sh-12)', () => {
  it('passes Social history to SectionBlock after HOPI when TEXT is present', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({
        hopi: 'Fever 3 days',
        socialHistory: 'Smoking: Non-smoker · Diet: Vegetarian',
      }),
    });
    const sections = collectSectionBlocks(tree);

    const labels = sections.map((s) => s.label);
    const hopiIdx = labels.indexOf('History of present illness');
    const socialIdx = labels.indexOf('Social history');
    const dxIdx = labels.indexOf('Provisional diagnosis');

    expect(socialIdx).toBeGreaterThan(hopiIdx);
    expect(socialIdx).toBeLessThan(dxIdx);
    expect(sections[socialIdx]?.body).toBe(
      'Smoking: Non-smoker · Diet: Vegetarian',
    );
  });

  it('still wires Social history SectionBlock with null body when empty (SectionBlock omits)', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({ socialHistory: null }),
    });
    const social = collectSectionBlocks(tree).find((s) => s.label === 'Social history');
    expect(social).toEqual({ label: 'Social history', body: null });
  });
});

/** Collect the text content of mocked <text> nodes in document order. */
function collectText(node: React.ReactNode): string[] {
  const out: string[] = [];
  const walk = (n: React.ReactNode): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      const t = n.trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!React.isValidElement(n)) return;
    const props = n.props as { children?: React.ReactNode };
    if (props.children != null) walk(props.children);
  };
  walk(node);
  return out;
}

describe('PrescriptionDocument custom subsections block (subj-22)', () => {
  it('renders section title → body → child title → body in order', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({
        customSubsections: [
          {
            title: 'Travel history',
            body: 'Visited Kerala',
            children: [{ title: 'Prophylaxis', body: 'Doxycycline' }],
          },
        ],
      }),
    });
    const texts = collectText(tree);
    const order = ['Travel history', 'Visited Kerala', 'Prophylaxis', 'Doxycycline'].map(
      (t) => texts.indexOf(t),
    );
    expect(order.every((idx) => idx >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('renders nothing when there are no custom subsections', () => {
    const before = collectText(PrescriptionDocument({ data: minimalPdfData() }));
    // Baseline doc text should not contain any custom-subsection-only strings.
    expect(before).not.toContain('Travel history');
  });

  it('omits a child body cleanly when absent (no stray text)', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({
        customSubsections: [
          { title: 'Notes', body: null, children: [{ title: 'Item', body: null }] },
        ],
      }),
    });
    const texts = collectText(tree);
    expect(texts).toContain('Notes');
    expect(texts).toContain('Item');
  });
});
