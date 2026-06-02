/**
 * Patient Overview Service unit tests (pr-03).
 *
 * Focused on the deterministic derivations:
 *   - CP-1 .. CP-5 care-plan rules
 *   - RF-1 .. RF-5 risk-flag rules
 *   - buildCurrentMedications / buildRecentActivity / buildSixVisitStrip
 *   - KPI cache hit/miss behavior
 *
 * The aggregator's parallel-fetch path is exercised by the integration test
 * (skip-gated under PATIENT_OVERVIEW_INTEGRATION_TEST=1). Mocking each
 * underlying service here would just reverify the mocks and miss the real
 * RLS behaviour, so we intentionally keep this suite at the pure-function
 * layer.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// `prescription-pdf-service` transitively imports `@react-pdf/renderer`,
// an ESM-only package ts-jest cannot transform out of the box. Stub it at
// the boundary so the transitive import chain
// patient-overview-service → appointment-service → consultation-session-service
// → notification-service → prescription-pdf-service loads cleanly. Pure
// helpers under test never invoke PDF rendering. Mirrors the same stub
// applied in `appointment-service.test.ts`.
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(async () => Buffer.from([])),
  buildPrescriptionPdfContext: jest.fn(async () => ({})),
}));

import {
  __resetKpisCacheForTests,
  buildCurrentMedications,
  buildRecentActivity,
  buildSixVisitStrip,
  deriveCarePlan,
  deriveRiskFlags,
  KPI_CACHE_TTL_SECONDS,
} from '../../../src/services/patient-overview-service';
import type {
  PatientAllergy,
  PatientVitalsReading,
  ProblemListItem,
} from '../../../src/types/patient-chart';
import type {
  Prescription,
  PrescriptionMedicine,
  PrescriptionWithRelations,
} from '../../../src/types/prescription';
import type { Appointment, AppointmentStatus } from '../../../src/types';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_ID = '22222222-2222-2222-2222-222222222222';

// ----------------------------------------------------------------------------
// Fixture builders — keep tests readable & focused on the rule input deltas.
// ----------------------------------------------------------------------------

function daysAgo(days: number, from = new Date('2026-05-19T12:00:00.000Z')): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

function inDays(days: number, from = new Date('2026-05-19T12:00:00.000Z')): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function makePrescription(overrides: Partial<Prescription> & {
  medicines?: PrescriptionMedicine[];
}): PrescriptionWithRelations {
  const base: Prescription = {
    id: 'rx-' + Math.random().toString(36).slice(2),
    appointment_id: 'apt-' + Math.random().toString(36).slice(2),
    episode_id: null,
    patient_id: PATIENT_ID,
    doctor_id: DOCTOR_ID,
    type: 'structured',
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations_orders: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: null,
    created_at: daysAgo(1).toISOString(),
    updated_at: daysAgo(1).toISOString(),
    vitals_bp_systolic: null,
    vitals_bp_diastolic: null,
    vitals_hr: null,
    vitals_temp_c: null,
    vitals_spo2: null,
    vitals_wt_kg: null,
    vitals_ht_cm: null,
    examination_findings: null,
    differential_diagnosis: null,
    advice: null,
    follow_up_value: null,
    follow_up_unit: null,
    referral: null,
    test_results: null,
  };
  const merged = { ...base, ...overrides } as Prescription;
  return {
    ...merged,
    prescription_medicines: overrides.medicines ?? [],
    prescription_attachments: [],
  };
}

function makeMedicine(overrides: Partial<PrescriptionMedicine> = {}): PrescriptionMedicine {
  return {
    id: 'med-' + Math.random().toString(36).slice(2),
    prescription_id: 'rx-anchor',
    medicine_name: 'Amoxicillin',
    dosage: '500mg',
    route: 'oral',
    frequency: 'TID',
    duration: '5 days',
    instructions: null,
    sort_order: 0,
    created_at: daysAgo(1).toISOString(),
    drug_master_id: null,
    frequency_code: 'TID',
    duration_value: 5,
    duration_unit: 'days',
    route_code: 'oral',
    ...overrides,
  };
}

function makeVital(overrides: Partial<PatientVitalsReading> = {}): PatientVitalsReading {
  return {
    id: 'vit-' + Math.random().toString(36).slice(2),
    doctor_id: DOCTOR_ID,
    patient_id: PATIENT_ID,
    appointment_id: null,
    bp_systolic: null,
    bp_diastolic: null,
    heart_rate: null,
    temperature_c: null,
    spo2: null,
    weight_kg: null,
    height_cm: null,
    bmi: null,
    note: null,
    recorded_at: daysAgo(1).toISOString(),
    archived_at: null,
    created_at: daysAgo(1).toISOString(),
    ...overrides,
  };
}

function makeAppointment(
  overrides: Partial<Appointment> & { id?: string; appointment_date?: Date }
): Appointment {
  return {
    id: overrides.id ?? 'apt-' + Math.random().toString(36).slice(2),
    doctor_id: DOCTOR_ID,
    patient_id: PATIENT_ID,
    patient_name: 'Test Patient',
    patient_phone: '+15550001111',
    patient_age: 42,
    patient_sex: 'male',
    appointment_date: overrides.appointment_date ?? daysAgo(7),
    status: (overrides.status ?? 'completed') as AppointmentStatus,
    reason_for_visit: null,
    notes: null,
    consultation_type: 'in_clinic',
    ...overrides,
  } as Appointment;
}

function makeAllergy(overrides: Partial<PatientAllergy> = {}): PatientAllergy {
  return {
    id: 'alg-' + Math.random().toString(36).slice(2),
    doctor_id: DOCTOR_ID,
    patient_id: PATIENT_ID,
    allergen: 'Penicillin',
    severity: 'mild',
    reaction: null,
    note: null,
    archived_at: null,
    created_at: daysAgo(100).toISOString(),
    updated_at: daysAgo(100).toISOString(),
    ...overrides,
  };
}

const NOW = new Date('2026-05-19T12:00:00.000Z');

// ============================================================================
// Care-plan rules
// ============================================================================

describe('deriveCarePlan', () => {
  it('CP-1 fires when a prescription with structured follow-up is overdue', () => {
    const rx = makePrescription({
      created_at: daysAgo(20, NOW).toISOString(),
      follow_up_value: 7,
      follow_up_unit: 'days',
    });
    const carePlan = deriveCarePlan({
      prescriptions: [rx],
      appointments: [],
      vitals: [],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan).not.toBeNull();
    expect(carePlan?.next_step).toMatch(/Follow-up overdue since/);
    expect(carePlan?.overdue.some((s) => /overdue by/.test(s))).toBe(true);
    expect(carePlan?.rationale.some((s) => /scheduled a follow-up/.test(s))).toBe(true);
  });

  it('CP-1 does NOT fire when a later completed appointment covers the follow-up', () => {
    const rx = makePrescription({
      created_at: daysAgo(20, NOW).toISOString(),
      follow_up_value: 7,
      follow_up_unit: 'days',
    });
    const apt = makeAppointment({
      appointment_date: daysAgo(5, NOW),
      status: 'completed',
    });
    const carePlan = deriveCarePlan({
      prescriptions: [rx],
      appointments: [apt],
      vitals: [],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan).toBeNull();
  });

  it('CP-2 contributes next_step "Follow-up scheduled" when a future confirmed appointment with follow-up notes exists', () => {
    const apt = makeAppointment({
      appointment_date: inDays(5, NOW),
      status: 'confirmed',
      notes: 'follow-up review',
    });
    const carePlan = deriveCarePlan({
      prescriptions: [],
      appointments: [apt],
      vitals: [],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan?.next_step).toMatch(/Follow-up scheduled for/);
    expect(carePlan?.overdue).toEqual([]);
  });

  it('CP-3 fires when latest BP is high and no vitals in last 14 days', () => {
    const vital = makeVital({
      bp_systolic: 150,
      bp_diastolic: 95,
      recorded_at: daysAgo(20, NOW).toISOString(),
    });
    const carePlan = deriveCarePlan({
      prescriptions: [],
      appointments: [],
      vitals: [vital],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan?.next_step).toBe('BP recheck recommended');
    expect(carePlan?.overdue.some((s) => /BP recheck pending/.test(s))).toBe(true);
    expect(carePlan?.rationale.some((s) => /150\/95/.test(s))).toBe(true);
  });

  it('CP-3 does NOT fire when the latest BP reading is within 14 days', () => {
    const vital = makeVital({
      bp_systolic: 150,
      bp_diastolic: 95,
      recorded_at: daysAgo(5, NOW).toISOString(),
    });
    const carePlan = deriveCarePlan({
      prescriptions: [],
      appointments: [],
      vitals: [vital],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan).toBeNull();
  });

  it('CP-4 fires when an open episode has no appointment in last 30 days', () => {
    const problem: ProblemListItem = {
      source: 'episode',
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      label: 'Migraine',
      since_date: '2026-04-01',
      occurrence_count: null,
      episode_status: 'active',
      followups_used: 1,
      max_followups: 3,
    };
    const apt = makeAppointment({
      appointment_date: daysAgo(45, NOW),
      status: 'completed',
    });
    const carePlan = deriveCarePlan({
      prescriptions: [],
      appointments: [apt],
      vitals: [],
      problems: [problem],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan?.next_step).toMatch(/Open episode hasn't been seen/);
    expect(carePlan?.overdue.some((s) => s.startsWith('Migraine'))).toBe(true);
  });

  it('CP-5 fires when a recent medication is past its derived end date', () => {
    const carePlan = deriveCarePlan({
      prescriptions: [
        makePrescription({
          created_at: daysAgo(28, NOW).toISOString(),
          medicines: [
            makeMedicine({
              medicine_name: 'Augmentin',
              duration_value: 5,
              duration_unit: 'days',
            }),
          ],
        }),
      ],
      appointments: [],
      vitals: [],
      problems: [],
      currentMedications: [
        {
          drug_name: 'Augmentin',
          dose: '625mg',
          frequency: 'BID',
          prescribed_at: daysAgo(28, NOW).toISOString(),
          prescriber_doctor_id: DOCTOR_ID,
          still_taking: null,
        },
      ],
      now: NOW,
    });
    expect(carePlan?.overdue.some((s) => /Augmentin refill due since/.test(s))).toBe(true);
    expect(carePlan?.rationale.some((s) => /Augmentin prescribed for/.test(s))).toBe(true);
  });

  it('returns null when no rule fires', () => {
    const carePlan = deriveCarePlan({
      prescriptions: [],
      appointments: [],
      vitals: [],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan).toBeNull();
  });

  it('priority wins: CP-1 next_step beats CP-3 when both fire', () => {
    const rx = makePrescription({
      created_at: daysAgo(20, NOW).toISOString(),
      follow_up_value: 5,
      follow_up_unit: 'days',
    });
    const highBp = makeVital({
      bp_systolic: 160,
      bp_diastolic: 100,
      recorded_at: daysAgo(20, NOW).toISOString(),
    });
    const carePlan = deriveCarePlan({
      prescriptions: [rx],
      appointments: [],
      vitals: [highBp],
      problems: [],
      currentMedications: [],
      now: NOW,
    });
    expect(carePlan?.next_step).toMatch(/Follow-up overdue since/);
    // Both rules still log to overdue / rationale.
    expect(carePlan?.overdue.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Risk-flag rules
// ============================================================================

describe('deriveRiskFlags', () => {
  it('RF-1 BP_TREND_RISING fires on 3 consecutive high readings', () => {
    const vitals = [
      makeVital({ bp_systolic: 150, bp_diastolic: 95, recorded_at: daysAgo(1, NOW).toISOString() }),
      makeVital({ bp_systolic: 145, bp_diastolic: 92, recorded_at: daysAgo(8, NOW).toISOString() }),
      makeVital({ bp_systolic: 152, bp_diastolic: 96, recorded_at: daysAgo(15, NOW).toISOString() }),
    ];
    const flags = deriveRiskFlags({
      vitals,
      appointments: [],
      allergies: [],
      currentMedications: [],
    });
    expect(flags.find((f) => f.code === 'BP_TREND_RISING')).toBeDefined();
  });

  it('RF-1 does NOT fire when one of the last 3 BP readings is normal', () => {
    const vitals = [
      makeVital({ bp_systolic: 150, bp_diastolic: 95, recorded_at: daysAgo(1, NOW).toISOString() }),
      makeVital({ bp_systolic: 120, bp_diastolic: 78, recorded_at: daysAgo(8, NOW).toISOString() }),
      makeVital({ bp_systolic: 152, bp_diastolic: 96, recorded_at: daysAgo(15, NOW).toISOString() }),
    ];
    const flags = deriveRiskFlags({
      vitals,
      appointments: [],
      allergies: [],
      currentMedications: [],
    });
    expect(flags.find((f) => f.code === 'BP_TREND_RISING')).toBeUndefined();
  });

  it('RF-2 SPO2_LOW fires when latest SpO2 < 92', () => {
    const vital = makeVital({ spo2: 90, recorded_at: daysAgo(1, NOW).toISOString() });
    const flags = deriveRiskFlags({
      vitals: [vital],
      appointments: [],
      allergies: [],
      currentMedications: [],
    });
    const flag = flags.find((f) => f.code === 'SPO2_LOW');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('danger');
    expect(flag?.label).toMatch(/SpO₂ 90%/);
  });

  it('RF-3 NO_SHOW_PATTERN fires on 2+ no-shows in last 4 appointments', () => {
    const appointments = [
      makeAppointment({ status: 'no_show', appointment_date: daysAgo(2, NOW) }),
      makeAppointment({ status: 'completed', appointment_date: daysAgo(10, NOW) }),
      makeAppointment({ status: 'no_show', appointment_date: daysAgo(20, NOW) }),
      makeAppointment({ status: 'completed', appointment_date: daysAgo(40, NOW) }),
    ];
    const flags = deriveRiskFlags({
      vitals: [],
      appointments,
      allergies: [],
      currentMedications: [],
    });
    const flag = flags.find((f) => f.code === 'NO_SHOW_PATTERN');
    expect(flag).toBeDefined();
    expect(flag?.label).toMatch(/Missed 2 of last 4 appointments/);
  });

  it('RF-4 ALLERGY_ALERT fires on a severe active allergy', () => {
    const flags = deriveRiskFlags({
      vitals: [],
      appointments: [],
      allergies: [makeAllergy({ severity: 'severe', allergen: 'Sulfa' })],
      currentMedications: [],
    });
    const flag = flags.find((f) => f.code === 'ALLERGY_ALERT');
    expect(flag).toBeDefined();
    expect(flag?.label).toBe('Severe allergy — Sulfa');
  });

  it('RF-5 POLYPHARMACY fires at 5+ concurrent medications', () => {
    const meds = Array.from({ length: 5 }, (_, i) => ({
      drug_name: `Drug${i}`,
      dose: '1 tab',
      frequency: 'OD',
      prescribed_at: daysAgo(2, NOW).toISOString(),
      prescriber_doctor_id: DOCTOR_ID,
      still_taking: null,
    }));
    const flags = deriveRiskFlags({
      vitals: [],
      appointments: [],
      allergies: [],
      currentMedications: meds,
    });
    const flag = flags.find((f) => f.code === 'POLYPHARMACY');
    expect(flag).toBeDefined();
    expect(flag?.label).toMatch(/5 active medications/);
  });

  it('returns [] when no rule fires', () => {
    const flags = deriveRiskFlags({
      vitals: [],
      appointments: [],
      allergies: [],
      currentMedications: [],
    });
    expect(flags).toEqual([]);
  });

  it('determinism: running twice over the same input returns identical output', () => {
    const inputs = {
      vitals: [makeVital({ spo2: 91, recorded_at: daysAgo(1, NOW).toISOString() })],
      appointments: [makeAppointment({ status: 'no_show', appointment_date: daysAgo(2, NOW) })],
      allergies: [makeAllergy({ severity: 'severe' })],
      currentMedications: [],
    };
    const first = deriveRiskFlags(inputs);
    const second = deriveRiskFlags(inputs);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// ============================================================================
// Composition helpers
// ============================================================================

describe('buildCurrentMedications', () => {
  it('flattens medicines newest-first and caps at 20', () => {
    const old = makePrescription({
      created_at: daysAgo(100, NOW).toISOString(),
      medicines: [makeMedicine({ medicine_name: 'OldDrug' })],
    });
    const fresh = makePrescription({
      created_at: daysAgo(2, NOW).toISOString(),
      medicines: [
        makeMedicine({ medicine_name: 'NewDrug-A' }),
        makeMedicine({ medicine_name: 'NewDrug-B' }),
      ],
    });
    const result = buildCurrentMedications([old, fresh]);
    expect(result[0].drug_name).toBe('NewDrug-A');
    expect(result[1].drug_name).toBe('NewDrug-B');
    expect(result[2].drug_name).toBe('OldDrug');
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.every((m) => m.still_taking === null)).toBe(true);
  });
});

describe('buildRecentActivity', () => {
  it('mixes visits / prescriptions / payments / no-shows and sorts newest-first', () => {
    const appointments: Appointment[] = [
      makeAppointment({
        id: 'apt-1',
        appointment_date: daysAgo(2, NOW),
        status: 'completed',
        consultation_type: 'video',
      }),
      makeAppointment({
        id: 'apt-2',
        appointment_date: daysAgo(1, NOW),
        status: 'no_show',
      }),
    ];
    const prescriptions = [
      makePrescription({
        id: 'rx-1',
        appointment_id: 'apt-1',
        created_at: daysAgo(2, NOW).toISOString(),
        medicines: [makeMedicine({})],
      }),
    ];
    const payments = [
      {
        appointment_id: 'apt-1',
        amount_minor: 9950,
        currency: 'INR',
        created_at: daysAgo(2.5, NOW).toISOString(),
        status: 'captured',
      },
    ];
    const rows = buildRecentActivity(appointments, prescriptions, payments);
    expect(rows.length).toBe(4);
    expect(rows[0].kind).toBe('no_show');
    expect(rows[rows.length - 1].kind).toBe('payment');
    expect(rows.find((r) => r.kind === 'payment')?.summary).toBe('99.50 INR received');
    expect(rows.find((r) => r.kind === 'prescription')?.summary).toBe('1 medicine prescribed');
  });
});

describe('buildSixVisitStrip', () => {
  it('takes 6 most recent appointments newest-leftmost', () => {
    const apts = Array.from({ length: 8 }, (_, i) =>
      makeAppointment({
        id: `apt-${i}`,
        appointment_date: daysAgo(i, NOW),
      })
    );
    const strip = buildSixVisitStrip(apts, []);
    expect(strip).toHaveLength(6);
    expect(strip[0].appointment_id).toBe('apt-0');
    expect(strip[5].appointment_id).toBe('apt-5');
  });

  it('resolves chief_complaint via prescription.cc → reason_for_visit → notes', () => {
    const apts = [
      makeAppointment({
        id: 'apt-1',
        appointment_date: daysAgo(1, NOW),
        reason_for_visit: 'Fever',
      }),
      makeAppointment({
        id: 'apt-2',
        appointment_date: daysAgo(2, NOW),
        notes: 'Note CC',
      }),
      makeAppointment({
        id: 'apt-3',
        appointment_date: daysAgo(3, NOW),
      }),
    ];
    const rx = makePrescription({
      id: 'rx-1',
      appointment_id: 'apt-1',
      cc: 'Productive cough',
      created_at: daysAgo(1, NOW).toISOString(),
    });
    const strip = buildSixVisitStrip(apts, [rx]);
    expect(strip[0].chief_complaint).toBe('Productive cough');
    expect(strip[1].chief_complaint).toBe('Note CC');
    expect(strip[2].chief_complaint).toBeNull();
  });

  it('truncates chief_complaint to 80 chars with an ellipsis', () => {
    const longCc = 'a'.repeat(120);
    const apts = [
      makeAppointment({
        id: 'apt-1',
        appointment_date: daysAgo(1, NOW),
        reason_for_visit: longCc,
      }),
    ];
    const strip = buildSixVisitStrip(apts, []);
    expect(strip[0].chief_complaint).toHaveLength(80);
    expect(strip[0].chief_complaint?.endsWith('…')).toBe(true);
  });
});

// ============================================================================
// KPI cache constant
// ============================================================================

describe('KPI cache', () => {
  beforeEach(() => {
    __resetKpisCacheForTests();
  });

  it('exposes a 60-second TTL', () => {
    expect(KPI_CACHE_TTL_SECONDS).toBe(60);
  });
});
