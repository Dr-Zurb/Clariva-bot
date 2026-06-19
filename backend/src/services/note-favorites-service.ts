/**
 * Doctor note favorites service (subjective-tab · subj-06).
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type {
  CreateDoctorNoteFavoriteInput,
  DoctorNoteFavoriteRow,
  NoteFavoriteFieldKey,
  RecordDoctorNoteFavoriteUseInput,
} from '../types/note-favorite';

export const MAX_NOTE_FAVORITES_PER_FIELD = 30;

function normalizeValue(value: string): string {
  return value.trim();
}

export async function listDoctorNoteFavorites(
  correlationId: string,
  doctorId: string,
  fieldKey?: NoteFavoriteFieldKey,
): Promise<DoctorNoteFavoriteRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let query = admin
    .from('doctor_note_favorites')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('use_count', { ascending: false })
    .order('last_used_at', { ascending: false });

  if (fieldKey) {
    query = query.eq('field_key', fieldKey);
  }

  const { data, error } = await query;
  if (error) handleSupabaseError(error, correlationId);

  await logDataAccess(correlationId, doctorId, 'doctor_note_favorite', undefined);

  return (data ?? []) as DoctorNoteFavoriteRow[];
}

async function countDoctorNoteFavoritesForField(
  correlationId: string,
  doctorId: string,
  fieldKey: NoteFavoriteFieldKey,
): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { count, error } = await admin
    .from('doctor_note_favorites')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .eq('field_key', fieldKey);

  if (error) handleSupabaseError(error, correlationId);
  return count ?? 0;
}

export async function createDoctorNoteFavorite(
  input: CreateDoctorNoteFavoriteInput,
  correlationId: string,
  doctorId: string,
): Promise<DoctorNoteFavoriteRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const value = normalizeValue(input.value);
  if (!value) {
    throw new ValidationError('Favorite value is required');
  }

  const existingCount = await countDoctorNoteFavoritesForField(
    correlationId,
    doctorId,
    input.fieldKey,
  );
  if (existingCount >= MAX_NOTE_FAVORITES_PER_FIELD) {
    throw new ValidationError(
      `Maximum of ${MAX_NOTE_FAVORITES_PER_FIELD} favorites reached for this field`,
    );
  }

  const { data, error } = await admin
    .from('doctor_note_favorites')
    .insert({
      doctor_id: doctorId,
      field_key: input.fieldKey,
      value,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ValidationError('This favorite already exists');
    }
    handleSupabaseError(error, correlationId);
  }
  if (!data) throw new InternalError('Favorite insert returned no row');

  await logDataModification(
    correlationId,
    doctorId,
    'create',
    'doctor_note_favorite',
    (data as DoctorNoteFavoriteRow).id,
  );

  return data as DoctorNoteFavoriteRow;
}

export async function deleteDoctorNoteFavorite(
  id: string,
  correlationId: string,
  doctorId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: existing, error: existsError } = await admin
    .from('doctor_note_favorites')
    .select('id, doctor_id')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Favorite not found');
  if ((existing as { doctor_id: string }).doctor_id !== doctorId) {
    throw new ForbiddenError('Favorite not found');
  }

  const { error } = await admin
    .from('doctor_note_favorites')
    .delete()
    .eq('id', id)
    .eq('doctor_id', doctorId);

  if (error) handleSupabaseError(error, correlationId);

  await logDataModification(correlationId, doctorId, 'delete', 'doctor_note_favorite', id);
}

export async function recordDoctorNoteFavoriteUse(
  input: RecordDoctorNoteFavoriteUseInput,
  correlationId: string,
  doctorId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const value = normalizeValue(input.value);
  if (!value) return;

  const { error } = await admin.rpc('increment_doctor_note_favorite_use', {
    p_doctor_id: doctorId,
    p_field_key: input.fieldKey,
    p_value: value,
  });

  if (error) handleSupabaseError(error, correlationId);

  await logDataModification(
    correlationId,
    doctorId,
    'update',
    'doctor_note_favorite',
    `${input.fieldKey}:${value.slice(0, 32)}`,
  );
}
