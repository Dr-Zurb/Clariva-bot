/**
 * Import unique patients from a gov OPD Patient Listing Report onto Dr Zurb.
 * Dedup by 15-digit CR No. Patients only — no appointments.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-gov-opd-roster-2026-08-27.ts
 *   npx ts-node -r dotenv/config scripts/apply-zurb-gov-opd-roster-2026-08-27.ts --dry-run
 *
 * Default PDF: ~/Documents/Patient Listing Report.pdf
 * Override: --pdf /path/to/report.pdf
 *
 * Do not commit generated rows. Never logs names or phones.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getSupabaseAdminClient } from '../src/config/database';
import {
  parseGovPatientListing,
  uniquePatientsFromVisits,
  type GovOpdPatient,
} from './lib/parse-gov-patient-listing';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const CONSENT_METHOD = 'gov_opd_import_2026-08-27';
const UUID_NAMESPACE = 'c2700001-2026-4827-a000-000000000027';
const DEFAULT_PDF = join(homedir(), 'Documents', 'Patient Listing Report.pdf');
const UPSERT_CHUNK = 80;
const MRN_CONCURRENCY = 20;

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function uuidFromCr(cr: string): string {
  const ns = Buffer.from(UUID_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(cr, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toRow(patient: GovOpdPatient, nowIso: string) {
  return {
    id: uuidFromCr(patient.cr),
    name: patient.name,
    phone: patient.mobile,
    age: patient.ageYears,
    gender: patient.gender,
    guardian_name: patient.fatherName,
    guardian_relation: patient.fatherName ? ('father' as const) : null,
    doctor_id: DOCTOR_ID,
    platform: null,
    platform_external_id: null,
    consent_status: 'granted',
    consent_granted_at: nowIso,
    consent_method: CONSENT_METHOD,
    registered_via: 'import' as const,
    created_by: DOCTOR_ID,
  };
}

async function assignMrns(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ids: string[]
): Promise<void> {
  for (const group of chunk(ids, MRN_CONCURRENCY)) {
    const results = await Promise.all(
      group.map((id) => admin.rpc('assign_patient_mrn', { p_patient_id: id }))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('assign_patient_mrn failed');
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const pdfPath = argValue('--pdf') ?? DEFAULT_PDF;
  if (!existsSync(pdfPath)) {
    console.error('PDF not found');
    process.exit(1);
  }

  const visits = parseGovPatientListing(readFileSync(pdfPath));
  const patients = uniquePatientsFromVisits(visits);
  const phones = new Set(patients.map((p) => p.mobile));

  console.log(
    `Parsed ${visits.length} visits → ${patients.length} unique patients (${phones.size} distinct mobiles)`
  );

  if (dryRun) {
    console.log('Dry run — no writes');
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  const rows = patients.map((p) => toRow(p, nowIso));
  let upserted = 0;
  for (const group of chunk(rows, UPSERT_CHUNK)) {
    const { error } = await admin.from('patients').upsert(group, { onConflict: 'id' });
    if (error) {
      console.error('patients upsert failed:', error.message);
      process.exit(1);
    }
    upserted += group.length;
    console.log(`Upserted ${upserted}/${rows.length}`);
  }

  await assignMrns(
    admin,
    rows.map((r) => r.id)
  );

  const { count, error: countErr } = await admin
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', DOCTOR_ID)
    .eq('consent_method', CONSENT_METHOD);

  if (countErr) {
    console.error('verify count failed:', countErr.message);
    process.exit(1);
  }

  console.log(`Roster on Dr Zurb: ${count ?? rows.length} patients (consent_method=${CONSENT_METHOD})`);
}

void main();
