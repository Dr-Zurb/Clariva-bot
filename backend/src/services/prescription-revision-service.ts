/**
 * Same-day revise — clone on re-issue (rxl-22).
 *
 * A revision is a new prescriptions row. Autosave must never call this.
 * Send / Print / Finish of a revision (rxl-25) is the only trigger.
 *
 * PHI: copies clinical payload. No PHI in logs.
 */

import { getSupabaseAdminClient } from '../config/database';
import {
  REVISION_REASONS,
  type Prescription,
  type PrescriptionAttachment,
  type PrescriptionMedicine,
  type PrescriptionWithRelations,
  type RevisionReason,
} from '../types/prescription';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';

const IDENTITY_COLUMNS = ['id', 'created_at', 'updated_at'] as const;

const REVISION_COLUMNS = [
  'version',
  'supersedes_id',
  'superseded_by_id',
  'revision_reason',
  'issued_at',
  'printed_at',
  'attested_at',
  'sent_to_patient_at',
] as const;

const VISIT_COLUMNS = [
  'appointment_id',
  'patient_id',
  'doctor_id',
  'episode_id',
  'type',
] as const;

/** Clinical parent columns — recon 2026-09-10. Keep in lockstep with Prescription. */
export const PRESCRIPTION_CLONE_CLINICAL_COLUMNS = [
  'cc',
  'hopi',
  'complaints',
  'family_history',
  'family_history_structured',
  'social_history',
  'social_history_structured',
  'past_surgical_history',
  'past_surgical_history_structured',
  'custom_subsections',
  'provisional_diagnosis',
  'diagnoses_json',
  'differential_diagnosis',
  'assessment_note',
  'assessment_acuity',
  'assessment_custom_sections',
  'vitals_bp_systolic',
  'vitals_bp_diastolic',
  'vitals_hr',
  'vitals_temp_c',
  'vitals_spo2',
  'vitals_wt_kg',
  'vitals_ht_cm',
  'vitals_rr',
  'vitals_pain_score',
  'vitals_glucose_mg_dl',
  'vitals_gcs_total',
  'vitals_bp_posture',
  'vitals_bp_limb',
  'vitals_head_circumference_cm',
  'vitals_muac_cm',
  'vitals_waist_cm',
  'vitals_json',
  'examination_findings',
  'examination_json',
  'test_results',
  'test_results_json',
  'lab_reports_json',
  'investigations_orders',
  'investigations_orders_json',
  'follow_up',
  'follow_up_value',
  'follow_up_unit',
  'advice',
  'referral',
  'patient_education',
  'clinical_notes',
  'plan_custom_sections',
] as const;

const MEDICINE_COPY_COLUMNS = [
  'medicine_name',
  'dosage',
  'route',
  'frequency',
  'duration',
  'instructions',
  'sort_order',
  'drug_master_id',
  'frequency_code',
  'duration_value',
  'duration_unit',
  'route_code',
  'dose_qty',
  'dose_unit',
  'form',
  'food_timing',
] as const;

export function parseRevisionReason(reason: string): RevisionReason {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Revision reason is required');
  }
  if (!(REVISION_REASONS as readonly string[]).includes(trimmed)) {
    throw new ValidationError('Revision reason is not a known preset');
  }
  return trimmed as RevisionReason;
}

export function nextRevisionVersion(previous: number | null | undefined): number {
  return (previous ?? 1) + 1;
}

export function buildRevisionParentInsert(
  source: Prescription,
  input: { reason: RevisionReason; issuedAt: string }
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of VISIT_COLUMNS) {
    row[col] = source[col];
  }
  for (const col of PRESCRIPTION_CLONE_CLINICAL_COLUMNS) {
    row[col] = source[col];
  }
  row.version = nextRevisionVersion(source.version);
  row.supersedes_id = source.id;
  row.superseded_by_id = null;
  row.revision_reason = input.reason;
  row.issued_at = input.issuedAt;
  row.printed_at = null;
  row.attested_at = input.issuedAt;
  row.sent_to_patient_at = null;
  return row;
}

export function buildRevisionMedicineInserts(
  source: PrescriptionMedicine[],
  newPrescriptionId: string
): Array<Record<string, unknown>> {
  return source.map((med) => {
    const row: Record<string, unknown> = { prescription_id: newPrescriptionId };
    for (const col of MEDICINE_COPY_COLUMNS) {
      row[col] = med[col];
    }
    return row;
  });
}

export function buildRevisionAttachmentInserts(
  source: PrescriptionAttachment[],
  newPrescriptionId: string
): Array<Record<string, unknown>> {
  // RXL-Q10 — share file_path. Erasure must count references before
  // storage.remove; see deletePrescriptionAttachment.
  return source.map((att) => ({
    prescription_id: newPrescriptionId,
    file_path: att.file_path,
    file_type: att.file_type,
    caption: att.caption,
  }));
}

/** Keys a clone must not blind-copy from the source row. */
export const PRESCRIPTION_CLONE_SKIP_COLUMNS = [
  ...IDENTITY_COLUMNS,
  ...REVISION_COLUMNS,
] as const;

/**
 * Re-issue an attested note as Version N+1. One call = one version bump
 * (RXL-DL-9). Does not go through updatePrescription.
 */
export async function reissuePrescriptionAsRevision(
  sourceId: string,
  reason: string,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations> {
  const parsedReason = parseRevisionReason(reason);
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: sourceRow, error: sourceError } = await admin
    .from('prescriptions')
    .select('*')
    .eq('id', sourceId)
    .single();

  if (sourceError || !sourceRow) {
    throw new NotFoundError('Prescription not found');
  }

  const source = sourceRow as Prescription;
  if (source.doctor_id !== userId) {
    throw new NotFoundError('Prescription not found');
  }

  if (typeof source.attested_at !== 'string' || source.attested_at.length === 0) {
    throw new ConflictError('This prescription has not been finished', {
      reason: 'not_issued',
    });
  }

  if (typeof source.superseded_by_id === 'string' && source.superseded_by_id.length > 0) {
    throw new ConflictError('This prescription has already been superseded', {
      reason: 'superseded',
    });
  }

  const [medResult, attResult] = await Promise.all([
    admin
      .from('prescription_medicines')
      .select('*')
      .eq('prescription_id', sourceId)
      .order('sort_order'),
    admin.from('prescription_attachments').select('*').eq('prescription_id', sourceId),
  ]);

  if (medResult.error) handleSupabaseError(medResult.error, correlationId);
  if (attResult.error) handleSupabaseError(attResult.error, correlationId);

  const sourceMeds = (medResult.data || []) as PrescriptionMedicine[];
  const sourceAtts = (attResult.data || []) as PrescriptionAttachment[];

  const issuedAt = new Date().toISOString();
  const insertData = buildRevisionParentInsert(source, {
    reason: parsedReason,
    issuedAt,
  });

  const { data: created, error: createError } = await admin
    .from('prescriptions')
    .insert(insertData)
    .select()
    .single();

  if (createError || !created) {
    handleSupabaseError(createError, correlationId);
  }

  const createdRx = created as Prescription;
  const newId = createdRx.id;

  const medicineRows = buildRevisionMedicineInserts(sourceMeds, newId);
  let clonedMeds: PrescriptionMedicine[] = [];
  if (medicineRows.length > 0) {
    const { data: insertedMeds, error: medInsertError } = await admin
      .from('prescription_medicines')
      .insert(medicineRows)
      .select();
    if (medInsertError) {
      await admin.from('prescriptions').delete().eq('id', newId);
      handleSupabaseError(medInsertError, correlationId);
    }
    clonedMeds = (insertedMeds || []) as PrescriptionMedicine[];
  }

  const attachmentRows = buildRevisionAttachmentInserts(sourceAtts, newId);
  let clonedAtts: PrescriptionAttachment[] = [];
  if (attachmentRows.length > 0) {
    const { data: insertedAtts, error: attInsertError } = await admin
      .from('prescription_attachments')
      .insert(attachmentRows)
      .select();
    if (attInsertError) {
      await admin.from('prescriptions').delete().eq('id', newId);
      handleSupabaseError(attInsertError, correlationId);
    }
    clonedAtts = (insertedAtts || []) as PrescriptionAttachment[];
  }

  const sourceVersion = source.version ?? 1;
  const { data: linked, error: linkError } = await admin
    .from('prescriptions')
    .update({
      superseded_by_id: newId,
      version: sourceVersion,
    })
    .eq('id', sourceId)
    .is('superseded_by_id', null)
    .select('id')
    .maybeSingle();

  if (linkError) {
    await admin.from('prescriptions').delete().eq('id', newId);
    handleSupabaseError(linkError, correlationId);
  }

  if (!linked) {
    await admin.from('prescriptions').delete().eq('id', newId);
    throw new ConflictError('This prescription has already been superseded', {
      reason: 'superseded',
    });
  }

  await logDataModification(correlationId, userId, 'create', 'prescription', newId, [
    'version',
    'supersedes_id',
    'revision_reason',
  ]);

  return {
    ...createdRx,
    prescription_medicines: clonedMeds,
    prescription_attachments: clonedAtts,
  };
}
