/**
 * Prescription PDF composer + document tests (social-history-v2 · sh-12).
 */

import * as React from 'react';
import { mapPrescriptionToPdfBody } from '../../../src/services/prescription-pdf-composer';
import type { PrescriptionPdfData } from '../../../src/templates/prescription-pdf/types';
import {
  PrescriptionDocument,
  formatPreprintedIssuerLine,
} from '../../../src/templates/prescription-pdf/PrescriptionDocument';
import { InvestigationsBlock } from '../../../src/templates/prescription-pdf/InvestigationsBlock';

type SectionCapture = {
  label: string;
  body: string | null | undefined;
  accentColor?: string | null;
};

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

    const props = n.props as {
      label?: string;
      body?: string | null;
      accentColor?: string | null;
      children?: React.ReactNode;
    };
    if (typeof props.label === 'string' && 'body' in props) {
      results.push({
        label: props.label,
        body: props.body ?? null,
        accentColor: props.accentColor,
      });
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
  View: ({
    children,
    wrap,
  }: {
    children?: React.ReactNode;
    wrap?: boolean;
  }) => React.createElement('view', { wrap }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('text', null, children),
}));

jest.mock('../../../src/templates/prescription-pdf/styles', () => ({
  mmToPt: (mm: number) => (mm * 72) / 25.4,
  resolvePdfAccent: (raw?: string | null) =>
    raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim() : '#000000',
  styles: {
    page: {},
    patientStrip: {},
    patientField: {},
    patientLabel: {},
    patientValue: {},
    section: {},
    sectionLabel: {},
    sectionBody: {},
    invGrid: {},
    invCell: {},
    invTick: {},
    invNote: {},
  },
}));

jest.mock('../../../src/templates/prescription-pdf/Header', () => ({
  Header: () => null,
}));
jest.mock('../../../src/templates/prescription-pdf/PatientBlock', () => ({
  PatientBlock: () => null,
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
      allergies: null,
      cc: null,
      hopi: null,
      vitals: null,
      examinationFindings: null,
      socialHistory: null,
      provisionalDiagnosis: null,
      investigations: null,
      advice: null,
      followUp: null,
      patientEducation: null,
      referral: null,
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

  it('omits allergies when none are passed; prints a recorded list', () => {
    expect(mapPrescriptionToPdfBody({ ...emptyRx }, []).allergies).toBeNull();
    expect(
      mapPrescriptionToPdfBody({ ...emptyRx }, [], {
        allergies: [{ allergen: 'Penicillin', severity: 'severe', reaction: 'rash' }],
      }).allergies,
    ).toBe('Penicillin (severe — rash)');
  });

  it('forwards the nil-known assertion so an empty chart can print No known allergies', () => {
    expect(
      mapPrescriptionToPdfBody({ ...emptyRx }, [], {
        allergies: [],
        noKnownAllergies: true,
      }).allergies,
    ).toBe('No known allergies');
  });

  it('maps vitals and examination findings when present', () => {
    const body = mapPrescriptionToPdfBody(
      {
        ...emptyRx,
        examination_findings: '  Throat congested. Chest clear.  ',
        vitals_bp_systolic: 118,
        vitals_bp_diastolic: 76,
        vitals_hr: 92,
        vitals_temp_c: 38.2,
        vitals_spo2: 98,
      },
      [],
    );
    expect(body.examinationFindings).toBe('Throat congested. Chest clear.');
    expect(body.vitals).toBe('BP 118/76 · HR 92 · Temp 38.2 °C · SpO₂ 98%');
  });

  it('prints the visit-level vitals note on the vitals line', () => {
    const body = mapPrescriptionToPdfBody(
      {
        ...emptyRx,
        vitals_hr: 88,
        vitals_json: { sectionNote: 'sitting, post-walk' },
      },
      [],
    );
    expect(body.vitals).toBe('HR 88 — sitting, post-walk');
    expect(
      mapPrescriptionToPdfBody({ ...emptyRx, vitals_hr: 88 }, [], {
        deskVitalsNote: 'from desk',
      }).vitals,
    ).toBe('HR 88 — from desk');
  });

  it('omits vitals and examination when empty', () => {
    const body = mapPrescriptionToPdfBody({ ...emptyRx }, []);
    expect(body.vitals).toBeNull();
    expect(body.examinationFindings).toBeNull();
  });

  it('merges advice + patient_education into one Advice body (plan advice collapse)', () => {
    const body = mapPrescriptionToPdfBody(
      {
        ...emptyRx,
        advice: 'Rest',
        patient_education: 'Hydrate',
        referral: 'ENT if persists',
        clinical_notes: 'Private clinician note',
      },
      [],
    );
    expect(body.advice).toBe('Rest\nHydrate');
    expect(body.patientEducation).toBeNull();
    expect(body.referral).toBe('ENT if persists');
    expect(body).not.toHaveProperty('clinicalNotes');
  });

  it('derives followUp from structured value+unit when free-text empty (plan-p1)', () => {
    expect(
      mapPrescriptionToPdfBody(
        { ...emptyRx, follow_up: null, follow_up_value: 5, follow_up_unit: 'days' },
        [],
      ).followUp,
    ).toBe('in 5 days');
    expect(
      mapPrescriptionToPdfBody(
        { ...emptyRx, follow_up: 'Call if worse', follow_up_value: 5, follow_up_unit: 'days' },
        [],
      ).followUp,
    ).toBe('in 5 days — Call if worse');
    expect(
      mapPrescriptionToPdfBody(
        { ...emptyRx, follow_up: null, follow_up_value: null, follow_up_unit: 'as_needed' },
        [],
      ).followUp,
    ).toBe('as needed');
    expect(
      mapPrescriptionToPdfBody(
        { ...emptyRx, follow_up: 'in 5 days', follow_up_value: 5, follow_up_unit: 'days' },
        [],
      ).followUp,
    ).toBe('in 5 days');
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

describe('PrescriptionDocument investigations', () => {
  it('prints a comma list as separate ticks and peels the instruction note', () => {
    const tree = InvestigationsBlock({
      body: 'CBC, HbA1c, fasting glucose. Bring home BP diary to the next visit.',
    });
    const texts = collectText(tree);
    expect(texts).toContain('Investigations');
    expect(texts).toContain('CBC');
    expect(texts).toContain('HbA1c');
    expect(texts).toContain('fasting glucose');
    expect(texts).toContain('Bring home BP diary to the next visit.');
    expect(texts.join(' ')).not.toMatch(/CBC, HbA1c/);
  });

  it('does not keep the whole investigations block unbreakable', () => {
    const tree = InvestigationsBlock({
      body: 'CBC, CRP, ESR, RF, LFT, TSH',
    });
    expect(React.isValidElement(tree)).toBe(true);
    expect((tree as React.ReactElement).props.wrap).not.toBe(false);
  });

  it('prints package members as nested ticks under a label, not one colon line', () => {
    const tree = InvestigationsBlock({
      body: 'Thyroid profile; ECG; CBC: Haemoglobin, Albumin, ANA',
    });
    const texts = collectText(tree);
    expect(texts).toContain('Investigations');
    expect(texts).toContain('Thyroid profile');
    expect(texts).toContain('ECG');
    expect(texts).toContain('CBC');
    expect(texts).toContain('Haemoglobin');
    expect(texts).toContain('Albumin');
    expect(texts).toContain('ANA');
    expect(texts.some((t) => t.includes('CBC:') && t.includes('Haemoglobin'))).toBe(
      false,
    );
  });
});

describe('PrescriptionDocument plan sections (plan-p1)', () => {
  it('renders Advice and Referral after medicines; never Clinical notes or Patient education', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({
        advice: 'Rest',
        referral: 'ENT',
        patientEducation: null,
        followUp: 'in 5 days',
      }),
    });
    const labels = collectSectionBlocks(tree).map((s) => s.label);
    expect(labels).toContain('Advice');
    expect(labels).toContain('Referral');
    expect(labels).not.toContain('Patient education');
    expect(labels).toContain('Follow-up');
    expect(labels).not.toContain('Clinical notes');
    expect(labels.indexOf('Follow-up')).toBeLessThan(labels.indexOf('Referral'));
  });
});

describe('PrescriptionDocument allergies, vitals, examination', () => {
  it('renders Allergies before CC; Vitals and Examination after HOPI', () => {
    const tree = PrescriptionDocument({
      data: minimalPdfData({
        allergies: 'Penicillin (severe — rash)',
        cc: 'Fever',
        hopi: '3 days',
        vitals: 'BP 118/76 · HR 92',
        examinationFindings: 'Throat congested',
      }),
    });
    const labels = collectSectionBlocks(tree).map((s) => s.label);
    expect(labels.indexOf('Allergies')).toBeLessThan(labels.indexOf('Chief complaint'));
    expect(labels.indexOf('History of present illness')).toBeLessThan(labels.indexOf('Vitals'));
    expect(labels.indexOf('Vitals')).toBeLessThan(labels.indexOf('Examination'));
    expect(labels.indexOf('Examination')).toBeLessThan(labels.indexOf('Social history'));
  });

  it('omits the Allergies block when never asked', () => {
    const tree = PrescriptionDocument({ data: minimalPdfData() });
    const allergies = collectSectionBlocks(tree).find((s) => s.label === 'Allergies');
    // SectionBlock is still in the tree; a null body is what hides it.
    expect(allergies?.body).toBeNull();
  });
});

describe('formatPreprintedIssuerLine', () => {
  it('joins name, qualifications, specialty, and registration', () => {
    expect(
      formatPreprintedIssuerLine({
        doctorName: 'Dr. Zurb',
        qualifications: 'MBBS, MD',
        specialty: 'Medicine',
        registrationNumber: 'PMC-12345',
      }),
    ).toBe('Dr. Zurb · MBBS, MD · Medicine · Reg. No.: PMC-12345');
  });

  it('returns null when only the generic Doctor fallback is set', () => {
    expect(formatPreprintedIssuerLine({ doctorName: 'Doctor' })).toBeNull();
  });
});

describe('PrescriptionDocument preprinted issuer', () => {
  it('prints Doctor on preprinted when registration is present', () => {
    const tree = PrescriptionDocument({
      data: {
        ...minimalPdfData(),
        header: {
          doctorName: 'Dr. Zurb',
          qualifications: 'MBBS',
          registrationNumber: 'PMC-12345',
        },
        layout: {
          preset: 'preprinted',
          pageSize: 'a4',
          accentColor: '#000000',
          preprintMarginTopMm: 40,
          preprintMarginBottomMm: 30,
        },
      },
    });
    const doctor = collectSectionBlocks(tree).find((s) => s.label === 'Doctor');
    expect(doctor?.body).toBe('Dr. Zurb · MBBS · Reg. No.: PMC-12345');
  });

  it('does not print Doctor on classic (letterhead Header already has it)', () => {
    const tree = PrescriptionDocument({
      data: {
        ...minimalPdfData(),
        header: { doctorName: 'Dr. Zurb', registrationNumber: 'PMC-12345' },
        layout: {
          preset: 'classic',
          pageSize: 'a4',
          accentColor: '#000000',
          preprintMarginTopMm: 40,
          preprintMarginBottomMm: 30,
        },
      },
    });
    expect(collectSectionBlocks(tree).find((s) => s.label === 'Doctor')).toBeUndefined();
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
    expect(social).toEqual({
      label: 'Social history',
      body: null,
      accentColor: '#000000',
    });
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

  it('threads layout.accentColor onto every SectionBlock', () => {
    const tree = PrescriptionDocument({
      data: {
        ...minimalPdfData({ cc: 'cough' }),
        layout: {
          preset: 'classic',
          pageSize: 'a4',
          accentColor: '#112233',
          preprintMarginTopMm: 40,
          preprintMarginBottomMm: 30,
        },
      },
    });
    const sections = collectSectionBlocks(tree);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s.accentColor === '#112233')).toBe(true);
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
