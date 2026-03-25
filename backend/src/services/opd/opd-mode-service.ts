/**
 * OPD mode resolution (e-task-opd-03).
 * Centralizes slot vs queue from doctor_settings; default slot when unset.
 */

import type { DoctorSettingsRow, OpdMode } from '../../types/doctor-settings';
import { getDoctorSettings } from '../doctor-settings-service';

/**
 * Resolve OPD mode from a settings row (or null = default slot).
 */
export function resolveOpdModeFromSettings(settings: DoctorSettingsRow | null | undefined): OpdMode {
  return settings?.opd_mode === 'queue' ? 'queue' : 'slot';
}

/**
 * Load doctor settings and return OPD mode (async convenience).
 */
export async function getDoctorOpdMode(doctorId: string): Promise<OpdMode> {
  const settings = await getDoctorSettings(doctorId);
  return resolveOpdModeFromSettings(settings);
}
