/**
 * Prescription Service (Prescription V1)
 *
 * CRUD for prescriptions, prescription_medicines, prescription_attachments.
 * Doctor creates/updates prescriptions for own appointments.
 * Uses admin client; ownership verified via appointment.doctor_id.
 * PHI: diagnosis, medications, clinical notes. No PHI in logs.
 */

import { getSupabaseAdminClient } from '../config/database';
import {
  Prescription,
  PrescriptionMedicine,
  PrescriptionAttachment,
  PrescriptionRecentSummary,
  PrescriptionWithRelations,
  CreatePrescriptionInput,
  UpdatePrescriptionInput,
} from '../types/prescription';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification, logDataAccess } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError } from '../utils/errors';

// ============================================================================
// Create
// ============================================================================

/**
 * Create a prescription with optional medicines.
 * Validates appointment belongs to doctor; patient_id must match appointment when appointment has patient.
 */
export async function createPrescription(
  data: CreatePrescriptionInput,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // Verify appointment exists and belongs to doctor
  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, doctor_id, patient_id, episode_id')
    .eq('id', data.appointmentId)
    .single();

  if (appError || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.doctor_id !== userId) {
    throw new ForbiddenError('Appointment not found');
  }

  // Use appointment patient_id when available; otherwise allow from body
  const patientId = appointment.patient_id ?? data.patientId ?? null;
  if (appointment.patient_id && data.patientId && appointment.patient_id !== data.patientId) {
    throw new ForbiddenError('Patient does not match appointment');
  }

  const insertData = {
    appointment_id: data.appointmentId,
    episode_id: appointment.episode_id ?? null,
    patient_id: patientId,
    doctor_id: userId,
    type: data.type,
    cc: data.cc ?? null,
    hopi: data.hopi ?? null,
    provisional_diagnosis: data.provisionalDiagnosis ?? null,
    // cockpit-v2 / migration 103: `investigations` column was renamed to
    // `investigations_orders`. The public API field name stays
    // `investigations` for the deprecation window.
    // TODO(cv2-07): rename the API field `investigations` → `investigationsOrders`
    // in CreatePrescriptionInput once the cockpit form migrates.
    investigations_orders: data.investigations ?? null,
    follow_up: data.followUp ?? null,
    patient_education: data.patientEducation ?? null,
    clinical_notes: data.clinicalNotes ?? null,
    // cockpit-v2 / migration 103 / DL-28 — structured SOAP fields.
    // Pass-through; legacy callers omit these and the columns stay NULL.
    vitals_bp_systolic: data.vitalsBpSystolic ?? null,
    vitals_bp_diastolic: data.vitalsBpDiastolic ?? null,
    vitals_hr: data.vitalsHr ?? null,
    vitals_temp_c: data.vitalsTempC ?? null,
    vitals_spo2: data.vitalsSpo2 ?? null,
    vitals_wt_kg: data.vitalsWtKg ?? null,
    vitals_ht_cm: data.vitalsHtCm ?? null,
    examination_findings: data.examinationFindings ?? null,
    differential_diagnosis: data.differentialDiagnosis ?? null,
    advice: data.advice ?? null,
    follow_up_value: data.followUpValue ?? null,
    follow_up_unit: data.followUpUnit ?? null,
    referral: data.referral ?? null,
    test_results: data.testResults ?? null,
  };

  const { data: prescription, error: rxError } = await admin
    .from('prescriptions')
    .insert(insertData)
    .select()
    .single();

  if (rxError || !prescription) {
    handleSupabaseError(rxError, correlationId);
  }

  const prescriptionId = (prescription as Prescription).id;

  // Insert medicines if provided
  const medicines: PrescriptionMedicine[] = [];
  if (data.medicines && data.medicines.length > 0) {
    const medicineRows = data.medicines.map((m, i) => ({
      prescription_id: prescriptionId,
      medicine_name: m.medicineName,
      dosage: m.dosage ?? null,
      route: m.route ?? null,
      frequency: m.frequency ?? null,
      duration: m.duration ?? null,
      instructions: m.instructions ?? null,
      sort_order: m.sortOrder ?? i,
      // EHR Sub-batch B1 / T2.9 — structured columns. Pass-through;
      // legacy callers omit these and the columns stay NULL (additive
      // schema change, see migration 090).
      drug_master_id: m.drugMasterId ?? null,
      frequency_code: m.frequencyCode ?? null,
      duration_value: m.durationValue ?? null,
      duration_unit: m.durationUnit ?? null,
      route_code: m.routeCode ?? null,
    }));

    const { data: insertedMedicines, error: medError } = await admin
      .from('prescription_medicines')
      .insert(medicineRows)
      .select();

    if (medError) {
      handleSupabaseError(medError, correlationId);
    }
    medicines.push(...((insertedMedicines || []) as PrescriptionMedicine[]));
  }

  await logDataModification(correlationId, userId, 'create', 'prescription', prescriptionId);

  return {
    ...(prescription as Prescription),
    prescription_medicines: medicines,
    prescription_attachments: [],
  };
}

// ============================================================================
// Read
// ============================================================================

/**
 * Get prescription by ID with medicines and attachments.
 * Returns 404 if not found or not owned by doctor.
 */
export async function getPrescriptionById(
  id: string,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: prescription, error: rxError } = await admin
    .from('prescriptions')
    .select('*')
    .eq('id', id)
    .single();

  if (rxError || !prescription) {
    throw new NotFoundError('Prescription not found');
  }

  if ((prescription as Prescription).doctor_id !== userId) {
    throw new NotFoundError('Prescription not found');
  }

  const [medResult, attResult] = await Promise.all([
    admin.from('prescription_medicines').select('*').eq('prescription_id', id).order('sort_order'),
    admin.from('prescription_attachments').select('*').eq('prescription_id', id),
  ]);

  if (medResult.error) handleSupabaseError(medResult.error, correlationId);
  if (attResult.error) handleSupabaseError(attResult.error, correlationId);

  await logDataAccess(correlationId, userId, 'prescription', id);

  return {
    ...(prescription as Prescription),
    prescription_medicines: (medResult.data || []) as PrescriptionMedicine[],
    prescription_attachments: (attResult.data || []) as PrescriptionAttachment[],
  };
}

/**
 * List prescriptions by appointment.
 * Doctor must own the appointment.
 */
export async function listPrescriptionsByAppointment(
  appointmentId: string,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // Verify appointment belongs to doctor
  const { data: appointment, error: appError } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .single();

  if (appError || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.doctor_id !== userId) {
    throw new ForbiddenError('Appointment not found');
  }

  const { data: prescriptions, error: rxError } = await admin
    .from('prescriptions')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false });

  if (rxError) {
    handleSupabaseError(rxError, correlationId);
  }

  const result: PrescriptionWithRelations[] = [];
  for (const rx of prescriptions || []) {
    const [medResult, attResult] = await Promise.all([
      admin.from('prescription_medicines').select('*').eq('prescription_id', rx.id).order('sort_order'),
      admin.from('prescription_attachments').select('*').eq('prescription_id', rx.id),
    ]);
    if (medResult.error) handleSupabaseError(medResult.error, correlationId);
    if (attResult.error) handleSupabaseError(attResult.error, correlationId);
    result.push({
      ...(rx as Prescription),
      prescription_medicines: (medResult.data || []) as PrescriptionMedicine[],
      prescription_attachments: (attResult.data || []) as PrescriptionAttachment[],
    });
  }

  await logDataAccess(correlationId, userId, 'prescription', undefined);
  return result;
}

export interface ListPrescriptionsByPatientOptions {
  /** Caller already verified doctor ↔ patient link (e.g. patient overview gate). */
  skipAccessGate?: boolean;
}

/**
 * List prescriptions by patient.
 * Doctor must have at least one appointment with the patient.
 */
export async function listPrescriptionsByPatient(
  patientId: string,
  correlationId: string,
  userId: string,
  options: ListPrescriptionsByPatientOptions = {}
): Promise<PrescriptionWithRelations[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  if (!options.skipAccessGate) {
    // Verify doctor has access to patient (has appointment or conversation)
    const { data: appointmentCheck } = await admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', userId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle();

    const { data: convCheck } = await admin
      .from('conversations')
      .select('id')
      .eq('doctor_id', userId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle();

    if (!appointmentCheck && !convCheck) {
      throw new ForbiddenError('No access to this patient');
    }
  }

  // Single round-trip: embed medicines + attachments via FK (np-10 / R-FANOUT).
  const { data, error: rxError } = await admin
    .from('prescriptions')
    .select('*, prescription_medicines(*), prescription_attachments(*)')
    .eq('patient_id', patientId)
    .eq('doctor_id', userId)
    .order('created_at', { ascending: false });

  if (rxError) {
    handleSupabaseError(rxError, correlationId);
  }

  type EmbedRow = Prescription & {
    prescription_medicines: PrescriptionMedicine[] | null;
    prescription_attachments: PrescriptionAttachment[] | null;
  };

  const result: PrescriptionWithRelations[] = ((data ?? []) as EmbedRow[]).map((row) => ({
    ...row,
    prescription_medicines: row.prescription_medicines ?? [],
    prescription_attachments: row.prescription_attachments ?? [],
  }));

  await logDataAccess(correlationId, userId, 'prescription', undefined);
  return result;
}

/**
 * EHR Sub-batch A / T1.6 — list the N most-recent prescriptions for a
 * patient, doctor-scoped, in a *lightweight* shape (no full body, no
 * attachments, no per-medicine detail). Powers the chart panel's
 * "Previous prescriptions" surface and is locked-in for B1's T2.14
 * "copy from last visit" workflow to reuse without refactoring.
 *
 * Default limit = 3 (matches the chart panel design); cap at 25 to
 * keep the embed cheap if a future caller passes a high limit.
 *
 * Access: same gate as `listPrescriptionsByPatient` — doctor must
 * have at least one appointment OR conversation with the patient.
 */
export async function listRecentPrescriptionsByPatient(
  patientId: string,
  correlationId: string,
  userId: string,
  limit = 3
): Promise<PrescriptionRecentSummary[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 25);

  // Same access gate as listPrescriptionsByPatient (kept verbatim for
  // behaviour parity — if a future change centralizes this check, it
  // should cover both sites at once).
  const { data: appointmentCheck } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  const { data: convCheck } = await admin
    .from('conversations')
    .select('id')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  if (!appointmentCheck && !convCheck) {
    throw new ForbiddenError('No access to this patient');
  }

  // Single round-trip via Supabase's foreign-key embed: pulling only the
  // medicine `id` column gives us a lightweight count without fetching
  // dosage / instructions / etc. (we discard the rows after counting).
  const { data, error } = await admin
    .from('prescriptions')
    .select(
      'id, appointment_id, created_at, provisional_diagnosis, sent_to_patient_at, prescription_medicines(id)'
    )
    .eq('patient_id', patientId)
    .eq('doctor_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) handleSupabaseError(error, correlationId);

  type EmbedRow = {
    id: string;
    appointment_id: string;
    created_at: string;
    provisional_diagnosis: string | null;
    sent_to_patient_at: string | null;
    prescription_medicines: Array<{ id: string }> | null;
  };

  const rows = (data ?? []) as EmbedRow[];
  const result: PrescriptionRecentSummary[] = rows.map((row) => ({
    id: row.id,
    appointment_id: row.appointment_id,
    created_at: row.created_at,
    provisional_diagnosis: row.provisional_diagnosis,
    sent_to_patient_at: row.sent_to_patient_at,
    medicine_count: row.prescription_medicines?.length ?? 0,
  }));

  await logDataAccess(correlationId, userId, 'prescription', patientId);
  return result;
}

// ============================================================================
// Last prescription in care episode (EHR Sub-batch B1 / T2.14)
// ============================================================================

/**
 * Return the most recent prescription in the same care episode as
 * `beforeAppointmentId`, EXCLUDING the appointment itself. Used by the
 * "Copy from last visit" CTA on the doctor-side Rx form to one-tap
 * pull diagnosis / medicines from the previous visit on the same
 * episode.
 *
 * Returns `null` (not 404) when there is no prior Rx — the FE hides
 * the CTA in that case.
 *
 * Ownership: the caller must own (`doctor_id = userId`) the current
 * appointment; we mirror the same check on the returned Rx as a
 * belt-and-braces guard against episode_id collisions across doctors
 * (shouldn't happen — episodes are doctor-scoped — but cheap to verify).
 */
export async function getLastPrescriptionInEpisode(
  beforeAppointmentId: string,
  correlationId: string,
  userId: string,
): Promise<PrescriptionWithRelations | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // 1. Resolve current appointment + verify ownership + read episode_id.
  const { data: currentApt, error: aptErr } = await admin
    .from('appointments')
    .select('id, doctor_id, episode_id')
    .eq('id', beforeAppointmentId)
    .single();

  if (aptErr || !currentApt) {
    throw new NotFoundError('Appointment not found');
  }

  const apt = currentApt as {
    id: string;
    doctor_id: string;
    episode_id: string | null;
  };

  if (apt.doctor_id !== userId) {
    throw new ForbiddenError('Appointment not found');
  }

  // No episode → no "previous visit" notion. Return null so the FE
  // hides the CTA.
  if (!apt.episode_id) return null;

  // 2. Pull the latest Rx by direct episode link (T5.24). Exclude the
  // current appointment's own Rx so the caller gets "last visit".
  const { data: rxRow, error: rxErr } = await admin
    .from('prescriptions')
    .select('*')
    .eq('episode_id', apt.episode_id)
    .eq('doctor_id', userId)
    .neq('appointment_id', apt.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rxErr) handleSupabaseError(rxErr, correlationId);
  if (!rxRow) return null;

  const rx = rxRow as Prescription;

  // Pull medicines + attachments to match the shape of getPrescriptionById
  // — the FE Apply path expects the same shape regardless of source.
  const [medResult, attResult] = await Promise.all([
    admin.from('prescription_medicines').select('*').eq('prescription_id', rx.id).order('sort_order'),
    admin.from('prescription_attachments').select('*').eq('prescription_id', rx.id),
  ]);

  if (medResult.error) handleSupabaseError(medResult.error, correlationId);
  if (attResult.error) handleSupabaseError(attResult.error, correlationId);

  await logDataAccess(correlationId, userId, 'prescription', rx.id);

  return {
    ...rx,
    prescription_medicines: (medResult.data || []) as PrescriptionMedicine[],
    prescription_attachments: (attResult.data || []) as PrescriptionAttachment[],
  };
}

// ============================================================================
// Update
// ============================================================================

/**
 * Update prescription by ID.
 * Partial update; RLS enforced via ownership check.
 */
export async function updatePrescription(
  id: string,
  updates: UpdatePrescriptionInput,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('prescriptions')
    .select('id, doctor_id, appointment_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Prescription not found');
  }

  if (existing.doctor_id !== userId) {
    throw new NotFoundError('Prescription not found');
  }

  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .select('id, episode_id')
    .eq('id', existing.appointment_id)
    .single();

  if (appointmentError || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  const updateData: Record<string, unknown> = {};
  updateData.episode_id = appointment.episode_id ?? null;
  if (updates.cc !== undefined) updateData.cc = updates.cc;
  if (updates.hopi !== undefined) updateData.hopi = updates.hopi;
  if (updates.provisionalDiagnosis !== undefined) updateData.provisional_diagnosis = updates.provisionalDiagnosis;
  // cockpit-v2 / migration 103: column renamed to `investigations_orders`.
  // Public API field stays as `investigations` for the deprecation window.
  // TODO(cv2-07): rename UpdatePrescriptionInput.investigations → investigationsOrders.
  if (updates.investigations !== undefined) updateData.investigations_orders = updates.investigations;
  if (updates.followUp !== undefined) updateData.follow_up = updates.followUp;
  if (updates.patientEducation !== undefined) updateData.patient_education = updates.patientEducation;
  if (updates.clinicalNotes !== undefined) updateData.clinical_notes = updates.clinicalNotes;
  // cockpit-v2 / migration 103 / DL-28 — structured SOAP fields.
  if (updates.vitalsBpSystolic !== undefined) updateData.vitals_bp_systolic = updates.vitalsBpSystolic;
  if (updates.vitalsBpDiastolic !== undefined) updateData.vitals_bp_diastolic = updates.vitalsBpDiastolic;
  if (updates.vitalsHr !== undefined) updateData.vitals_hr = updates.vitalsHr;
  if (updates.vitalsTempC !== undefined) updateData.vitals_temp_c = updates.vitalsTempC;
  if (updates.vitalsSpo2 !== undefined) updateData.vitals_spo2 = updates.vitalsSpo2;
  if (updates.vitalsWtKg !== undefined) updateData.vitals_wt_kg = updates.vitalsWtKg;
  if (updates.vitalsHtCm !== undefined) updateData.vitals_ht_cm = updates.vitalsHtCm;
  if (updates.examinationFindings !== undefined) updateData.examination_findings = updates.examinationFindings;
  if (updates.differentialDiagnosis !== undefined) updateData.differential_diagnosis = updates.differentialDiagnosis;
  if (updates.advice !== undefined) updateData.advice = updates.advice;
  if (updates.followUpValue !== undefined) updateData.follow_up_value = updates.followUpValue;
  if (updates.followUpUnit !== undefined) updateData.follow_up_unit = updates.followUpUnit;
  if (updates.referral !== undefined) updateData.referral = updates.referral;
  if (updates.testResults !== undefined) updateData.test_results = updates.testResults;

  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await admin.from('prescriptions').update(updateData).eq('id', id);

    if (updateError) {
      handleSupabaseError(updateError, correlationId);
    }
  }

  if (updates.medicines !== undefined) {
    await admin.from('prescription_medicines').delete().eq('prescription_id', id);

    if (updates.medicines.length > 0) {
      const medicineRows = updates.medicines.map((m, i) => ({
        prescription_id: id,
        medicine_name: m.medicineName,
        dosage: m.dosage ?? null,
        route: m.route ?? null,
        frequency: m.frequency ?? null,
        duration: m.duration ?? null,
        instructions: m.instructions ?? null,
        sort_order: m.sortOrder ?? i,
        // EHR Sub-batch B1 / T2.9 — structured columns mirrored on
        // update. The PATCH path replaces the whole medicines array
        // (delete-then-insert above), so each row gets re-written
        // with current structured values.
        drug_master_id: m.drugMasterId ?? null,
        frequency_code: m.frequencyCode ?? null,
        duration_value: m.durationValue ?? null,
        duration_unit: m.durationUnit ?? null,
        route_code: m.routeCode ?? null,
      }));

      const { error: medError } = await admin.from('prescription_medicines').insert(medicineRows);

      if (medError) {
        handleSupabaseError(medError, correlationId);
      }
    }
  }

  await logDataModification(correlationId, userId, 'update', 'prescription', id);

  return getPrescriptionById(id, correlationId, userId);
}
