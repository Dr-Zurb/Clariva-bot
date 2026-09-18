/**
 * Dummy attested packs so the medicines-template Suggested list and
 * Templates-icon nudge can be felt. Past completed visits only — not today.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-pack-suggestions-sim-2026-09-17.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';
import { MEDICINE_PACK_SEEN_KEYS } from '../src/services/doctor-medicine-pack-suggestion-service';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'sim pack suggestions 2026-09-17';

type PackMed = {
  name: string;
  dosage: string;
  frequency: string;
  frequencyCode: 'OD' | 'TID';
  durationValue: number;
  doseQty: number;
  doseUnit: 'tab' | 'ml';
  form: string;
};

const URI: PackMed[] = [
  {
    name: 'Azithromycin',
    dosage: '500 mg',
    frequency: 'Once daily',
    frequencyCode: 'OD',
    durationValue: 3,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
  {
    name: 'Paracetamol',
    dosage: '500 mg',
    frequency: 'Three times daily',
    frequencyCode: 'TID',
    durationValue: 3,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
];

const HTN: PackMed[] = [
  {
    name: 'Amlodipine',
    dosage: '5 mg',
    frequency: 'Once daily',
    frequencyCode: 'OD',
    durationValue: 30,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
  {
    name: 'Telmisartan',
    dosage: '40 mg',
    frequency: 'Once daily',
    frequencyCode: 'OD',
    durationValue: 30,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
];

const GERD: PackMed[] = [
  {
    name: 'Pantoprazole',
    dosage: '40 mg',
    frequency: 'Once daily',
    frequencyCode: 'OD',
    durationValue: 14,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
  {
    name: 'Domperidone',
    dosage: '10 mg',
    frequency: 'Three times daily',
    frequencyCode: 'TID',
    durationValue: 14,
    doseQty: 1,
    doseUnit: 'tab',
    form: 'tab',
  },
  {
    name: 'Sucralfate',
    dosage: '1 g',
    frequency: 'Three times daily',
    frequencyCode: 'TID',
    durationValue: 7,
    doseQty: 10,
    doseUnit: 'ml',
    form: 'suspension',
  },
];

const PACKS: { key: string; count: number; reason: string; meds: PackMed[] }[] = [
  { key: 'uri', count: 8, reason: 'SIM — fever and throat', meds: URI },
  { key: 'htn', count: 6, reason: 'SIM — blood pressure review', meds: HTN },
  { key: 'gerd', count: 5, reason: 'SIM — acidity', meds: GERD },
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
  let seq = 1;
  let patientN = 1;

  for (const pack of PACKS) {
    for (let i = 0; i < pack.count; i += 1) {
      const pid = uid(1, patientN);
      const aid = uid(2, seq);
      const rid = uid(3, seq);
      const when = daysAgoIso(3 + seq, 8 + (seq % 6));
      const name = `SIM Pack ${String(patientN).padStart(2, '0')}`;
      const phone = `90001701${String(patientN).padStart(2, '0')}`;

      patients.push({
        id: pid,
        name,
        phone,
        email: `sim.pack.${String(patientN).padStart(2, '0')}@example.test`,
        age: 30 + (patientN % 20),
        gender: patientN % 2 === 0 ? 'female' : 'male',
        date_of_birth: '1990-01-15',
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
        reason_for_visit: pack.reason,
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
        cc: pack.reason,
        hopi: 'Dummy pack-suggestion seed. Not a real visit.',
        provisional_diagnosis: null,
        created_at: when,
        attested_at: when,
      });
      rxIds.push(rid);

      pack.meds.forEach((m, medIdx) => {
        medicines.push({
          id: uid(4, seq * 10 + medIdx),
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

      seq += 1;
      patientN += 1;
    }
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

  const { error: aErr } = await admin
    .from('appointments')
    .upsert(appointments, { onConflict: 'id' });
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

  const { error: rxErr } = await admin
    .from('prescriptions')
    .upsert(prescriptions, { onConflict: 'id' });
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const { error: medErr } = await admin.from('prescription_medicines').insert(medicines);
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  const { data: settings, error: settingsErr } = await admin
    .from('doctor_settings')
    .select('opd_policies')
    .eq('doctor_id', DOCTOR_ID)
    .maybeSingle();
  if (settingsErr) {
    console.error('load settings failed:', settingsErr.message);
    process.exit(1);
  }
  if (settings) {
    const policies = { ...((settings.opd_policies as Record<string, unknown> | null) ?? {}) };
    delete policies[MEDICINE_PACK_SEEN_KEYS];
    const { error: seenErr } = await admin
      .from('doctor_settings')
      .update({ opd_policies: policies })
      .eq('doctor_id', DOCTOR_ID);
    if (seenErr) {
      console.error('clear seen keys failed:', seenErr.message);
      process.exit(1);
    }
  }

  console.log(`Seeded ${rxIds.length} past attested dummy packs on Dr Zurb (not today).`);
  for (const pack of PACKS) {
    console.log(`  ${pack.key}: ${pack.count}x ${pack.meds.map((m) => m.name).join(' + ')}`);
  }
}

void main();
