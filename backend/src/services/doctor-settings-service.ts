/**
 * Doctor Settings Service (e-task-4.1)
 *
 * Loads per-doctor appointment fee, currency, and country from DB.
 * Used by webhook-worker when creating payment links; env provides fallback
 * when doctor has no row or column is null.
 *
 * @see e-task-4.1-per-doctor-payment-settings.md
 */

import { getSupabaseAdminClient } from '../config/database';
import type { DoctorSettingsRow } from '../types/doctor-settings';

/**
 * Get doctor settings by doctor ID (service role).
 * Returns null if no row exists.
 */
export async function getDoctorSettings(doctorId: string): Promise<DoctorSettingsRow | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('doctor_settings')
    .select('doctor_id, appointment_fee_minor, appointment_fee_currency, country, created_at, updated_at')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return data as DoctorSettingsRow | null;
}
