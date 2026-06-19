import { describe, expect, it } from '@jest/globals';
import { groupMedicalBackground } from '../../../src/services/patient-chart-service';
import type {
  ConditionMedicationLink,
  PatientChronicCondition,
  PatientMedication,
} from '../../../src/types/patient-chart';

describe('groupMedicalBackground', () => {
  const conditions: PatientChronicCondition[] = [
    {
      id: 'c1',
      doctor_id: 'd1',
      patient_id: 'p1',
      condition: 'Hypertension',
      status: 'active',
      diagnosed_on: null,
      diagnosed_ago_value: null,
      diagnosed_ago_unit: null,
      resolved_ago_value: null,
      resolved_ago_unit: null,
      on_treatment: null,
      note: null,
      archived_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: 'c2',
      doctor_id: 'd1',
      patient_id: 'p1',
      condition: 'Asthma',
      status: 'resolved',
      diagnosed_on: null,
      diagnosed_ago_value: null,
      diagnosed_ago_unit: null,
      resolved_ago_value: null,
      resolved_ago_unit: null,
      on_treatment: null,
      note: null,
      archived_at: null,
      created_at: '2026-01-02',
      updated_at: '2026-01-02',
    },
  ];

  const medications: PatientMedication[] = [
    {
      id: 'm1',
      doctor_id: 'd1',
      patient_id: 'p1',
      drug_name: 'Amlodipine',
      dose: '5mg',
      frequency: 'OD',
      status: 'active',
      intake_pattern: 'regular',
      source: 'prescribed',
      started_on: null,
      stopped_on: null,
      note: null,
      archived_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      strength: null,
      strength_value: null,
      strength_unit: null,
      strength_components: null,
      dose_qty: null,
      dose_unit: null,
      frequency_code: null,
      form: null,
      drug_master_id: null,
      stopped_ago_value: null,
      stopped_ago_unit: null,
      started_ago_value: null,
      started_ago_unit: null,
      stop_reason: null,
      dose_schedule: null,
      food_timing: null,
    },
    {
      id: 'm2',
      doctor_id: 'd1',
      patient_id: 'p1',
      drug_name: 'Paracetamol',
      dose: null,
      frequency: 'PRN',
      status: 'active',
      intake_pattern: 'prn',
      source: 'otc',
      started_on: null,
      stopped_on: null,
      note: null,
      archived_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      strength: null,
      strength_value: null,
      strength_unit: null,
      strength_components: null,
      dose_qty: null,
      dose_unit: null,
      frequency_code: null,
      form: null,
      drug_master_id: null,
      stopped_ago_value: null,
      stopped_ago_unit: null,
      started_ago_value: null,
      started_ago_unit: null,
      stop_reason: null,
      dose_schedule: null,
      food_timing: null,
    },
  ];

  const links: ConditionMedicationLink[] = [
    {
      id: 'l1',
      doctor_id: 'd1',
      patient_id: 'p1',
      condition_id: 'c1',
      medication_id: 'm1',
      created_at: '2026-01-01',
    },
  ];

  it('nests linked medications under conditions and leaves unlinked in general bucket', () => {
    const grouped = groupMedicalBackground(conditions, medications, links);

    expect(grouped.conditions).toHaveLength(2);
    expect(grouped.conditions[0]?.id).toBe('c1');
    expect(grouped.conditions[0]?.medications.map((m) => m.drug_name)).toEqual(['Amlodipine']);
    expect(grouped.conditions[1]?.medications).toEqual([]);
    expect(grouped.unlinkedMedications.map((m) => m.drug_name)).toEqual(['Paracetamol']);
    expect(grouped.links).toEqual(links);
  });

  it('allows the same medication under multiple conditions (M:N)', () => {
    const multiLinks: ConditionMedicationLink[] = [
      ...links,
      {
        id: 'l2',
        doctor_id: 'd1',
        patient_id: 'p1',
        condition_id: 'c2',
        medication_id: 'm1',
        created_at: '2026-01-02',
      },
    ];
    const grouped = groupMedicalBackground(conditions, medications, multiLinks);
    expect(grouped.conditions[0]?.medications).toHaveLength(1);
    expect(grouped.conditions[1]?.medications).toHaveLength(1);
    expect(grouped.unlinkedMedications).toHaveLength(1);
  });
});
