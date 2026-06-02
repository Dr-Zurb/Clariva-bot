/**
 * Doctor drug favorites service (rx-polish-favorites · rxf-04).
 *
 * CRUD over `doctor_drug_favorites`. Max 30 per doctor enforced before
 * insert. Ownership enforced in code (admin client bypasses RLS).
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type {
  CreateDoctorDrugFavoriteInput,
  DoctorDrugFavoriteRow,
  MedicineRowTemplate,
  UpdateDoctorDrugFavoriteInput,
} from '../types/doctor-drug-favorite';

export const MAX_DOCTOR_DRUG_FAVORITES = 30;

function normalizeTemplate(input: MedicineRowTemplate): MedicineRowTemplate {
  return {
    medicineName: typeof input.medicineName === 'string' ? input.medicineName.trim() : '',
    dosage: typeof input.dosage === 'string' ? input.dosage.trim() : '',
    route: typeof input.route === 'string' ? input.route.trim() : '',
    frequency: typeof input.frequency === 'string' ? input.frequency.trim() : '',
    duration: typeof input.duration === 'string' ? input.duration.trim() : '',
    instructions: typeof input.instructions === 'string' ? input.instructions.trim() : '',
    drugMasterId: input.drugMasterId ?? null,
    frequencyCode: input.frequencyCode ?? null,
    durationValue:
      typeof input.durationValue === 'number' && Number.isFinite(input.durationValue)
        ? Math.floor(input.durationValue)
        : null,
    durationUnit: input.durationUnit ?? null,
    routeCode: input.routeCode ?? null,
  };
}

export async function listDoctorDrugFavorites(
  correlationId: string,
  doctorId: string,
): Promise<DoctorDrugFavoriteRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('doctor_drug_favorites')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);

  await logDataAccess(correlationId, doctorId, 'doctor_drug_favorite', undefined);

  return (data ?? []) as DoctorDrugFavoriteRow[];
}

async function countDoctorDrugFavorites(
  correlationId: string,
  doctorId: string,
): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { count, error } = await admin
    .from('doctor_drug_favorites')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId);

  if (error) handleSupabaseError(error, correlationId);
  return count ?? 0;
}

export async function createDoctorDrugFavorite(
  input: CreateDoctorDrugFavoriteInput,
  correlationId: string,
  doctorId: string,
): Promise<DoctorDrugFavoriteRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const existingCount = await countDoctorDrugFavorites(correlationId, doctorId);
  if (existingCount >= MAX_DOCTOR_DRUG_FAVORITES) {
    throw new ValidationError(
      `Maximum of ${MAX_DOCTOR_DRUG_FAVORITES} favorites reached`,
    );
  }

  const row = {
    doctor_id: doctorId,
    name: input.name.trim(),
    template: normalizeTemplate(input.template),
  };

  const { data, error } = await admin
    .from('doctor_drug_favorites')
    .insert(row)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new InternalError('Favorite insert returned no row');

  await logDataModification(
    correlationId,
    doctorId,
    'create',
    'doctor_drug_favorite',
    (data as DoctorDrugFavoriteRow).id,
  );

  return data as DoctorDrugFavoriteRow;
}

export async function updateDoctorDrugFavorite(
  id: string,
  input: UpdateDoctorDrugFavoriteInput,
  correlationId: string,
  doctorId: string,
): Promise<DoctorDrugFavoriteRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: existing, error: existsError } = await admin
    .from('doctor_drug_favorites')
    .select('id, doctor_id')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Favorite not found');
  if ((existing as { doctor_id: string }).doctor_id !== doctorId) {
    throw new ForbiddenError('Favorite not found');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.template !== undefined) patch.template = normalizeTemplate(input.template);

  const { data, error } = await admin
    .from('doctor_drug_favorites')
    .update(patch)
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Favorite not found');

  await logDataModification(correlationId, doctorId, 'update', 'doctor_drug_favorite', id);

  return data as DoctorDrugFavoriteRow;
}

export async function deleteDoctorDrugFavorite(
  id: string,
  correlationId: string,
  doctorId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: existing, error: existsError } = await admin
    .from('doctor_drug_favorites')
    .select('id, doctor_id')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Favorite not found');
  if ((existing as { doctor_id: string }).doctor_id !== doctorId) {
    throw new ForbiddenError('Favorite not found');
  }

  const { error } = await admin
    .from('doctor_drug_favorites')
    .delete()
    .eq('id', id)
    .eq('doctor_id', doctorId);

  if (error) handleSupabaseError(error, correlationId);

  await logDataModification(correlationId, doctorId, 'delete', 'doctor_drug_favorite', id);
}
