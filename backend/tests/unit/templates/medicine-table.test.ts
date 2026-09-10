import * as React from 'react';
import { MedicineTable } from '../../../src/templates/prescription-pdf/MedicineTable';
import type { PrescriptionMedicine } from '../../../src/types/prescription';

jest.mock('@react-pdf/renderer', () => ({
  View: ({
    children,
    wrap,
    fixed,
    minPresenceAhead,
  }: {
    children?: React.ReactNode;
    wrap?: boolean;
    fixed?: boolean;
    minPresenceAhead?: number;
  }) =>
    React.createElement('view', { wrap, fixed, minPresenceAhead }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('text', null, children),
}));

jest.mock('../../../src/templates/prescription-pdf/styles', () => ({
  styles: {
    medsHeading: {},
    medsEmpty: {},
    medRowHeader: {},
    medRow: {},
    medCellIdx: { width: '6%' },
    medCellName: { width: '30%' },
    medCellDose: { width: '14%' },
    medCellRoute: { width: '12%' },
    medCellFreq: { width: '18%' },
    medCellDuration: { width: '20%' },
    medHeaderText: {},
    medCellText: {},
    medInstructions: {},
  },
}));

function collectText(node: React.ReactNode): string[] {
  const out: string[] = [];
  const walk = (n: React.ReactNode): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      const t = String(n).trim();
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

function makeMed(
  overrides: Partial<PrescriptionMedicine> = {},
): PrescriptionMedicine {
  return {
    id: 'med-1',
    prescription_id: 'rx-1',
    medicine_name: 'Metformin 500 mg',
    dosage: '500 mg',
    route: 'Oral',
    frequency: 'Twice daily',
    duration: '30 days',
    instructions: 'With breakfast and dinner. Do not skip the night dose.',
    sort_order: 0,
    created_at: '2026-08-25T00:00:00.000Z',
    drug_master_id: null,
    frequency_code: 'BID',
    duration_value: 30,
    duration_unit: 'days',
    route_code: 'oral',
    dose_qty: 1,
    dose_unit: 'tab',
    form: 'tab',
    food_timing: 'with_food',
    ...overrides,
  };
}

describe('MedicineTable', () => {
  it('keeps dose/route/frequency/duration in header order and notes under the name', () => {
    const tree = MedicineTable({ medicines: [makeMed()] });
    const texts = collectText(tree);
    const i = (label: string) => texts.indexOf(label);
    expect(i('Medicine')).toBeLessThan(i('Dose'));
    expect(i('Dose')).toBeLessThan(i('Route'));
    expect(i('Route')).toBeLessThan(i('Frequency'));
    expect(i('Frequency')).toBeLessThan(i('Duration'));
    expect(i('Metformin 500 mg')).toBeLessThan(i('>'));
    expect(i('>')).toBeLessThan(i('1 tab (500 mg)'));
    expect(i('1 tab (500 mg)')).toBeLessThan(i('Oral'));
    expect(i('Oral')).toBeLessThan(i('Twice daily'));
    expect(i('Twice daily')).toBeLessThan(i('30 days'));
  });

  it('keeps Rx heading, column header, and the first row in one unbreakable group', () => {
    const tree = MedicineTable({ medicines: [makeMed()] });
    const propsOf = (node: React.ReactNode): Record<string, unknown> | null => {
      if (!React.isValidElement(node)) return null;
      return node.props as Record<string, unknown>;
    };
    const root = React.isValidElement(tree) ? tree : null;
    const children = React.Children.toArray(
      (root?.props as { children?: React.ReactNode })?.children,
    );
    const group = children[0];
    expect(propsOf(group)?.wrap).toBe(false);
    const groupKids = React.Children.toArray(
      (propsOf(group)?.children as React.ReactNode) ?? null,
    );
    const header = groupKids.find((n) => propsOf(n)?.minPresenceAhead === 28);
    expect(header).toBeTruthy();
    expect(propsOf(header)?.fixed).toBeUndefined();
  });
});
