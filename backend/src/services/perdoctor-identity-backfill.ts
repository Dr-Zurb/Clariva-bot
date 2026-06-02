/**
 * rcp-29: Split legacy global platform patients into per-doctor rows.
 *
 * Consent rule (DL-7 — bias to under-copy):
 *   - The doctor who keeps the **original** row retains its existing consent state.
 *   - Every **clone** for an additional doctor starts at `consent_status: 'pending'`
 *     with consent timestamps/method cleared — consent at Dr A does not grant Dr B.
 *
 * Idempotent:
 *   - Single-doctor rows: stamp `doctor_id` once.
 *   - Multi-doctor: primary doctor keeps original row; existing per-doctor rows are
 *     reused; only missing clones are inserted; FK repoint is scoped by `doctor_id`.
 *
 * Book-for-other rows (`platform IS NULL`) are excluded entirely.
 */

import { getSupabaseAdminClient } from '../config/database';
import { InternalError } from '../utils/errors';

export interface PlatformPatientRow {
  id: string;
  doctor_id: string | null;
  platform: string;
  platform_external_id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  consent_status?: string | null;
  consent_granted_at?: string | null;
  consent_revoked_at?: string | null;
  consent_method?: string | null;
  medical_record_number?: string | null;
  patient_tag?: string | null;
}

export interface ConsentFields {
  consent_status: 'pending' | 'granted' | 'revoked';
  consent_granted_at: string | null;
  consent_revoked_at: string | null;
  consent_method: string | null;
}

export interface ClonePlan {
  doctorId: string;
  action: 'create' | 'reuse';
  existingPatientId?: string;
  consent: ConsentFields;
}

export interface PatientSplitPlan {
  patientId: string;
  platform: string;
  platformExternalId: string;
  doctorIds: string[];
  primaryDoctorId: string;
  stampPrimaryDoctorId: boolean;
  clones: ClonePlan[];
  /** True when the row is already fully split and stamped — no writes needed. */
  noop: boolean;
}

export interface BackfillStats {
  scanned: number;
  skippedBookForOther: number;
  stampOnly: number;
  splitMultiDoctor: number;
  clonesCreated: number;
  clonesReused: number;
  conversationsRepointed: number;
  appointmentsRepointed: number;
  noop: number;
}

/** Collect distinct doctor ids linked to a patient via conversations or appointments. */
export function collectDoctorIdsForPatient(
  patientId: string,
  conversations: Array<{ doctor_id: string; patient_id: string }>,
  appointments: Array<{ doctor_id: string; patient_id: string }>
): string[] {
  const ids = new Set<string>();
  for (const c of conversations) {
    if (c.patient_id === patientId) ids.add(c.doctor_id);
  }
  for (const a of appointments) {
    if (a.patient_id === patientId) ids.add(a.doctor_id);
  }
  return [...ids].sort();
}

/** Deterministic primary doctor (lexicographic UUID sort). */
export function pickPrimaryDoctorId(doctorIds: string[]): string {
  if (doctorIds.length === 0) {
    throw new Error('pickPrimaryDoctorId requires at least one doctor');
  }
  return [...doctorIds].sort()[0]!;
}

/** Consent payload for a clone row — always pending (DL-7). */
export function consentForCloneRow(): ConsentFields {
  return {
    consent_status: 'pending',
    consent_granted_at: null,
    consent_revoked_at: null,
    consent_method: null,
  };
}

/** Consent fields preserved on the primary row when stamping the original patient. */
export function consentForPrimaryRow(source: PlatformPatientRow): ConsentFields {
  const status = source.consent_status;
  const normalized =
    status === 'granted' || status === 'revoked' || status === 'pending'
      ? status
      : 'pending';
  return {
    consent_status: normalized,
    consent_granted_at: source.consent_granted_at ?? null,
    consent_revoked_at: source.consent_revoked_at ?? null,
    consent_method: source.consent_method ?? null,
  };
}

/**
 * Build an idempotent split plan for one platform-linked patient row.
 *
 * @param existingByDoctor - map doctorId → existing per-doctor patient row id
 */
export function planPatientSplit(
  patient: PlatformPatientRow,
  doctorIds: string[],
  existingByDoctor: Map<string, string> = new Map()
): PatientSplitPlan {
  const base = {
    patientId: patient.id,
    platform: patient.platform,
    platformExternalId: patient.platform_external_id,
    doctorIds,
    primaryDoctorId: doctorIds.length > 0 ? pickPrimaryDoctorId(doctorIds) : '',
    stampPrimaryDoctorId: false,
    clones: [] as ClonePlan[],
    noop: false,
  };

  if (doctorIds.length === 0) {
    return { ...base, noop: true };
  }

  if (doctorIds.length === 1) {
    const onlyDoctor = doctorIds[0]!;
    const stamped = patient.doctor_id === onlyDoctor;
    return {
      ...base,
      primaryDoctorId: onlyDoctor,
      stampPrimaryDoctorId: !stamped,
      noop: stamped,
    };
  }

  const primaryDoctorId = pickPrimaryDoctorId(doctorIds);
  const clones: ClonePlan[] = [];

  for (const doctorId of doctorIds) {
    if (doctorId === primaryDoctorId) continue;
    const existingId = existingByDoctor.get(doctorId);
    if (existingId && existingId !== patient.id) {
      clones.push({
        doctorId,
        action: 'reuse',
        existingPatientId: existingId,
        consent: consentForCloneRow(),
      });
    } else if (existingId === patient.id) {
      clones.push({
        doctorId,
        action: 'create',
        consent: consentForCloneRow(),
      });
    } else {
      clones.push({
        doctorId,
        action: 'create',
        consent: consentForCloneRow(),
      });
    }
  }

  const primaryStamped = patient.doctor_id === primaryDoctorId;
  const allClonesExist = clones.every((c) => c.action === 'reuse');
  const noop = primaryStamped && allClonesExist;

  return {
    ...base,
    primaryDoctorId,
    stampPrimaryDoctorId: !primaryStamped,
    clones,
    noop,
  };
}

export function buildCloneInsertPayload(
  source: PlatformPatientRow,
  doctorId: string,
  consent: ConsentFields
): Record<string, unknown> {
  return {
    doctor_id: doctorId,
    name: source.name,
    phone: source.phone,
    age: source.age ?? null,
    gender: source.gender ?? null,
    email: source.email ?? null,
    date_of_birth: source.date_of_birth ?? null,
    platform: source.platform,
    platform_external_id: source.platform_external_id,
    medical_record_number: source.medical_record_number ?? null,
    patient_tag: source.patient_tag ?? null,
    ...consent,
  };
}

export async function runPerDoctorIdentityBackfill(options: {
  dryRun: boolean;
}): Promise<BackfillStats> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const stats: BackfillStats = {
    scanned: 0,
    skippedBookForOther: 0,
    stampOnly: 0,
    splitMultiDoctor: 0,
    clonesCreated: 0,
    clonesReused: 0,
    conversationsRepointed: 0,
    appointmentsRepointed: 0,
    noop: 0,
  };

  const { data: patients, error: patErr } = await admin
    .from('patients')
    .select(
      'id, doctor_id, platform, platform_external_id, name, phone, age, gender, email, date_of_birth, consent_status, consent_granted_at, consent_revoked_at, consent_method, medical_record_number, patient_tag'
    )
    .not('platform', 'is', null);

  if (patErr) {
    throw new InternalError(`Failed to load platform patients: ${patErr.message}`);
  }

  const { data: conversations, error: convErr } = await admin
    .from('conversations')
    .select('doctor_id, patient_id');

  if (convErr) {
    throw new InternalError(`Failed to load conversations: ${convErr.message}`);
  }

  const { data: appointments, error: aptErr } = await admin
    .from('appointments')
    .select('doctor_id, patient_id');

  if (aptErr) {
    throw new InternalError(`Failed to load appointments: ${aptErr.message}`);
  }

  const convRows = (conversations ?? []) as Array<{ doctor_id: string; patient_id: string }>;
  const aptRows = (appointments ?? []) as Array<{ doctor_id: string; patient_id: string }>;

  for (const row of patients ?? []) {
    stats.scanned += 1;
    const patient = row as PlatformPatientRow;
    if (!patient.platform || !patient.platform_external_id) {
      stats.skippedBookForOther += 1;
      continue;
    }

    const doctorIds = collectDoctorIdsForPatient(patient.id, convRows, aptRows);
    if (doctorIds.length === 0) continue;

    const { data: existingRows } = await admin
      .from('patients')
      .select('id, doctor_id')
      .eq('platform', patient.platform)
      .eq('platform_external_id', patient.platform_external_id)
      .not('doctor_id', 'is', null);

    const existingByDoctor = new Map<string, string>();
    for (const er of existingRows ?? []) {
      const r = er as { id: string; doctor_id: string };
      if (r.doctor_id) existingByDoctor.set(r.doctor_id, r.id);
    }

    const plan = planPatientSplit(patient, doctorIds, existingByDoctor);
    if (plan.noop) {
      stats.noop += 1;
      continue;
    }

    if (doctorIds.length === 1) {
      stats.stampOnly += 1;
      if (!options.dryRun && plan.stampPrimaryDoctorId) {
        const { error } = await admin
          .from('patients')
          .update({ doctor_id: plan.primaryDoctorId })
          .eq('id', patient.id);
        if (error) {
          throw new InternalError(`Stamp doctor_id failed for ${patient.id}: ${error.message}`);
        }
      }
      continue;
    }

    stats.splitMultiDoctor += 1;

    if (options.dryRun) continue;

    if (plan.stampPrimaryDoctorId) {
      const { error } = await admin
        .from('patients')
        .update({ doctor_id: plan.primaryDoctorId })
        .eq('id', patient.id);
      if (error) {
        throw new InternalError(`Stamp primary doctor_id failed for ${patient.id}: ${error.message}`);
      }
    }

    for (const clone of plan.clones) {
      let targetPatientId = clone.existingPatientId;

      if (clone.action === 'create') {
        const { data: inserted, error: insertErr } = await admin
          .from('patients')
          .insert(buildCloneInsertPayload(patient, clone.doctorId, clone.consent))
          .select('id')
          .single();
        if (insertErr) {
          throw new InternalError(
            `Clone insert failed for doctor ${clone.doctorId}: ${insertErr.message}`
          );
        }
        targetPatientId = (inserted as { id: string }).id;
        stats.clonesCreated += 1;
      } else {
        stats.clonesReused += 1;
      }

      if (!targetPatientId) continue;

      const { error: convUpdateErr } = await admin
        .from('conversations')
        .update({ patient_id: targetPatientId })
        .eq('doctor_id', clone.doctorId)
        .eq('patient_id', patient.id);

      if (convUpdateErr) {
        throw new InternalError(
          `Conversation repoint failed for doctor ${clone.doctorId}: ${convUpdateErr.message}`
        );
      }
      stats.conversationsRepointed += 1;

      const { error: aptUpdateErr } = await admin
        .from('appointments')
        .update({ patient_id: targetPatientId })
        .eq('doctor_id', clone.doctorId)
        .eq('patient_id', patient.id);

      if (aptUpdateErr) {
        throw new InternalError(
          `Appointment repoint failed for doctor ${clone.doctorId}: ${aptUpdateErr.message}`
        );
      }
      stats.appointmentsRepointed += 1;
    }
  }

  return stats;
}
