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
    .select('id, doctor_id, patient_id')
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
    patient_id: patientId,
    doctor_id: userId,
    type: data.type,
    cc: data.cc ?? null,
    hopi: data.hopi ?? null,
    provisional_diagnosis: data.provisionalDiagnosis ?? null,
    investigations: data.investigations ?? null,
    follow_up: data.followUp ?? null,
    patient_education: data.patientEducation ?? null,
    clinical_notes: data.clinicalNotes ?? null,
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

/**
 * List prescriptions by patient.
 * Doctor must have at least one appointment with the patient.
 */
export async function listPrescriptionsByPatient(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<PrescriptionWithRelations[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

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

  const { data: prescriptions, error: rxError } = await admin
    .from('prescriptions')
    .select('*')
    .eq('patient_id', patientId)
    .eq('doctor_id', userId)
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
    .select('id, doctor_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Prescription not found');
  }

  if (existing.doctor_id !== userId) {
    throw new NotFoundError('Prescription not found');
  }

  const updateData: Record<string, unknown> = {};
  if (updates.cc !== undefined) updateData.cc = updates.cc;
  if (updates.hopi !== undefined) updateData.hopi = updates.hopi;
  if (updates.provisionalDiagnosis !== undefined) updateData.provisional_diagnosis = updates.provisionalDiagnosis;
  if (updates.investigations !== undefined) updateData.investigations = updates.investigations;
  if (updates.followUp !== undefined) updateData.follow_up = updates.followUp;
  if (updates.patientEducation !== undefined) updateData.patient_education = updates.patientEducation;
  if (updates.clinicalNotes !== undefined) updateData.clinical_notes = updates.clinicalNotes;

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
