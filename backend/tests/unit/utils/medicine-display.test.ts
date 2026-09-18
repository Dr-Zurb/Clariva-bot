import { projectMedicineForDisplay } from '../../../src/utils/medicine-display';
import type { PrescriptionMedicine } from '../../../src/types/prescription';

function med(overrides: Partial<PrescriptionMedicine> = {}): PrescriptionMedicine {
  return {
    id: 'm1',
    prescription_id: 'rx1',
    medicine_name: 'Pantoprazole',
    dosage: '40 mg',
    route: 'Oral',
    frequency: null,
    duration: '30 days',
    instructions: null,
    sort_order: 0,
    created_at: '2026-08-31T00:00:00.000Z',
    drug_master_id: null,
    frequency_code: 'BID',
    duration_value: 30,
    duration_unit: 'days',
    route_code: 'oral',
    dose_qty: 1,
    dose_unit: 'tab',
    form: 'tablet',
    food_timing: 'after_food',
    ...overrides,
  };
}

describe('projectMedicineForDisplay', () => {
  it('keeps a stored 1-0-1 schedule instead of the BID prose label', () => {
    expect(projectMedicineForDisplay(med({ frequency: '1-0-1' })).frequency).toBe('1-0-1');
  });

  it('uses the structured label when frequency is prose', () => {
    expect(projectMedicineForDisplay(med({ frequency: 'Twice daily' })).frequency).toBe(
      'Twice daily'
    );
  });
});
