import { layoutInvestigationsForRx } from '../../../src/templates/prescription-pdf/investigations-rx-layout';

const JASPREET =
  'CBC, HbA1c, fasting glucose, creatinine and eGFR, electrolytes, fasting lipid profile, TSH, urine ACR, ECG, chest X-ray PA, spirometry when infection-free. Bring home BP diary and glucometer log to the next visit.';

describe('layoutInvestigationsForRx', () => {
  it('turns a comma list plus an instruction sentence into ticks and a note', () => {
    expect(layoutInvestigationsForRx(JASPREET)).toEqual({
      kind: 'list',
      items: [
        { kind: 'order', label: 'CBC' },
        { kind: 'order', label: 'HbA1c' },
        { kind: 'order', label: 'fasting glucose' },
        { kind: 'order', label: 'creatinine and eGFR' },
        { kind: 'order', label: 'electrolytes' },
        { kind: 'order', label: 'fasting lipid profile' },
        { kind: 'order', label: 'TSH' },
        { kind: 'order', label: 'urine ACR' },
        { kind: 'order', label: 'ECG' },
        { kind: 'order', label: 'chest X-ray PA' },
        { kind: 'order', label: 'spirometry when infection-free' },
      ],
      note: 'Bring home BP diary and glucometer log to the next visit.',
    });
  });

  it('keeps semicolon chips as discrete top-level headings', () => {
    expect(layoutInvestigationsForRx('ECG; Trop-I; CBC')).toEqual({
      kind: 'list',
      items: [
        { kind: 'package', label: 'ECG', members: [] },
        { kind: 'package', label: 'Trop-I', members: [] },
        { kind: 'package', label: 'CBC', members: [] },
      ],
      note: null,
    });
  });

  it('nests Title: a, b members under the package name', () => {
    expect(
      layoutInvestigationsForRx('ECG; Lipid profile: TC, HDL, LDL'),
    ).toEqual({
      kind: 'list',
      items: [
        { kind: 'package', label: 'ECG', members: [] },
        {
          kind: 'package',
          label: 'Lipid profile',
          members: ['TC', 'HDL', 'LDL'],
        },
      ],
      note: null,
    });
  });

  it('leaves a single sentence as a paragraph', () => {
    expect(
      layoutInvestigationsForRx('CBC if headache persists beyond 2 weeks.'),
    ).toEqual({
      kind: 'paragraph',
      text: 'CBC if headache persists beyond 2 weeks.',
    });
  });
});
