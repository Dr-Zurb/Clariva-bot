/**
 * Dummy 10-medicine attested pack so the Suggested-list +N more cap
 * can be felt. Past completed visits only — not today.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-pack-suggestions-long-2026-09-17.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';
import { listMyMedicinePackSuggestions } from '../src/services/doctor-medicine-pack-suggestion-service';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'sim pack suggestions long 2026-09-17';
const PATIENT_START = 20;
const SEQ_START = 20;
const USE_COUNT = 5;

type PackMed = {
  name: string;
  dosage: string;
  frequency: string;
  frequencyCode: 'OD' | 'BID' | 'TID';
  durationValue: number;
  doseQty: number;
  doseUnit: 'tab';
  form: string;
};

const CAD: PackMed[] = [
  { name: 'Aspirin', dosage: '75 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Atorvastatin', dosage: '10 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Clopidogrel', dosage: '75 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Metoprolol', dosage: '25 mg', frequency: 'Twice daily', frequencyCode: 'BID', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Ramipril', dosage: '5 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Spironolactone', dosage: '25 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Furosemide', dosage: '40 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 14, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Isosorbide mononitrate', dosage: '30 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Pantoprazole', dosage: '40 mg', frequency: 'Once daily', frequencyCode: 'OD', durationValue: 14, doseQty: 1, doseUnit: 'tab', form: 'tab' },
  { name: 'Ivabradine', dosage: '5 mg', frequency: 'Twice daily', frequencyCode: 'BID', durationValue: 30, doseQty: 1, doseUnit: 'tab', form: 'tab' },
];

function uid(kind: number, n: number): string {
  return `c1700917-0000-4000-800${kind}-${String(n).padStart(12, '0')}`;
}

function daysAgoIso(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 15, 0, 0);
  return d.toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const patients: Array<Record<string, unknown>> = [];
  const appointments: Array<Record<string, unknown>> = [];
  const prescriptions: Array<Record<string, unknown>> = [];
  const medicines: Array<Record<string, unknown>> = [];
  const rxIds: string[] = [];

  for (let i = 0; i < USE_COUNT; i += 1) {
    const patientN = PATIENT_START + i;
    const seq = SEQ_START + i;
    const pid = uid(1, patientN);
    const aid = uid(2, seq);
    const rid = uid(3, seq);
    const when = daysAgoIso(4 + seq, 9 + (seq % 5));
    const name = `SIM Pack ${String(patientN).padStart(2, '0')}`;
    const phone = `90001701${String(patientN).padStart(2, '0')}`;

    patients.push({
      id: pid,
      name,
      phone,
      email: `sim.pack.${String(patientN).padStart(2, '0')}@example.test`,
      age: 55 + (patientN % 10),
      gender: patientN % 2 === 0 ? 'male' : 'female',
      date_of_birth: '1968-03-10',
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: when,
      consent_method: 'manual_sql_seed',
      registered_via: 'front_desk',
    });

    appointments.push({
      id: aid,
      doctor_id: DOCTOR_ID,
      patient_id: pid,
      patient_name: name,
      patient_phone: phone,
      appointment_date: when,
      status: 'completed',
      reason_for_visit: 'SIM — long pack preview',
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: when,
    });

    prescriptions.push({
      id: rid,
      appointment_id: aid,
      patient_id: pid,
      doctor_id: DOCTOR_ID,
      type: 'structured',
      cc: 'SIM — long pack preview',
      hopi: 'Dummy 10-medicine pack-suggestion seed. Not a real visit.',
      provisional_diagnosis: null,
      created_at: when,
      attested_at: when,
    });
    rxIds.push(rid);

    CAD.forEach((m, medIdx) => {
      medicines.push({
        id: uid(4, seq * 20 + medIdx),
        prescription_id: rid,
        medicine_name: m.name,
        dosage: m.dosage,
        route: 'Oral',
        frequency: m.frequency,
        duration: `${m.durationValue} days`,
        instructions: null,
        sort_order: medIdx,
        frequency_code: m.frequencyCode,
        duration_value: m.durationValue,
        duration_unit: 'days',
        route_code: 'oral',
        dose_qty: m.doseQty,
        dose_unit: m.doseUnit,
        form: m.form,
        food_timing: null,
      });
    });
  }

  const { error: pErr } = await admin.from('patients').upsert(patients, { onConflict: 'id' });
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  for (const row of patients) {
    const { error: mrnErr } = await admin.rpc('assign_patient_mrn', {
      p_patient_id: row.id,
    });
    if (mrnErr) {
      console.error('assign_patient_mrn failed:', mrnErr.message);
      process.exit(1);
    }
  }

  const { error: aErr } = await admin.from('appointments').upsert(appointments, { onConflict: 'id' });
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  const { error: delMedErr } = await admin
    .from('prescription_medicines')
    .delete()
    .in('prescription_id', rxIds);
  if (delMedErr) {
    console.error('clear medicines failed:', delMedErr.message);
    process.exit(1);
  }

  const { error: rxErr } = await admin.from('prescriptions').upsert(prescriptions, { onConflict: 'id' });
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const { error: medErr } = await admin.from('prescription_medicines').insert(medicines);
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  const listed = await listMyMedicinePackSuggestions(
    'sim-long-pack-2026-09-17',
    DOCTOR_ID
  );
  const longPack = listed.suggestions.find((s) => s.medicines.length >= 8);
  console.log(`Seeded ${USE_COUNT} attested 10-med dummy packs on Dr Zurb (not today).`);
  console.log(`  medicines: ${CAD.map((m) => m.name).join(' + ')}`);
  console.log(
    `  list now: ${listed.suggestions.length} packs, unseen ${listed.unseenCount}` +
      (longPack ? `, long pack ${longPack.medicines.length} lines / used ${longPack.useCount}` : ', long pack missing')
  );
}

void main();
