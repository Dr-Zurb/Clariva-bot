/**
 * Dashboard Onboarding Service (doctor-onboarding-v1 · onb-01).
 *
 * Read-only go-live checklist derived from existing data — no new table.
 * Returns booleans only (never raw settings / availability / IG rows).
 *
 * Signals (ONB-D2):
 *   - Instagram: doctor_instagram row exists
 *   - Practice: doctor_settings.practice_name non-empty
 *   - Pricing: catalog_mode set + fee (single_fee) or ≥1 offering (multi_service)
 *   - Availability: ≥1 availability row
 *
 * @see docs/Work/Daily-plans/July 2026/22-07-2026/doctor-onboarding-v1/
 */

import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from './doctor-settings-service';
import { getConnectionStatus } from './instagram-connect-service';
import { teleconsultCatalogServiceRowCount } from '../utils/consultation-fees';
import { handleSupabaseError } from '../utils/db-helpers';
import type { DoctorSettingsRow } from '../types/doctor-settings';

export interface OnboardingStatus {
  instagramConnected: boolean;
  practiceInfoSet: boolean;
  pricingSet: boolean;
  availabilitySet: boolean;
  complete: boolean;
}

export interface GetOnboardingStatusInput {
  doctorId: string;
  correlationId?: string;
}

/** Non-empty trimmed practice name. */
export function isPracticeInfoSet(
  practiceName: string | null | undefined
): boolean {
  return typeof practiceName === 'string' && practiceName.trim().length > 0;
}

/**
 * Pricing ready when catalog mode is decided and backed by a fee or offerings.
 *   - single_fee     → appointment_fee_minor is a finite number ≥ 0
 *   - multi_service  → ≥1 teleconsult catalog service row
 *   - null/other     → false
 */
export function isPricingSet(
  settings: Pick<
    DoctorSettingsRow,
    'catalog_mode' | 'appointment_fee_minor' | 'service_offerings_json'
  > | null
): boolean {
  if (!settings) return false;
  if (settings.catalog_mode === 'single_fee') {
    const fee = settings.appointment_fee_minor;
    return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0;
  }
  if (settings.catalog_mode === 'multi_service') {
    return teleconsultCatalogServiceRowCount(settings.service_offerings_json) >= 1;
  }
  return false;
}

async function hasAvailabilityRow(
  doctorId: string,
  correlationId: string
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('availability')
    .select('id')
    .eq('doctor_id', doctorId)
    .limit(1);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * Compose the four go-live signals for a doctor. Fresh accounts (no
 * settings / IG / availability) resolve to all-false without throwing.
 */
export async function getOnboardingStatus(
  input: GetOnboardingStatusInput
): Promise<OnboardingStatus> {
  const { doctorId, correlationId = '' } = input;

  const [ig, settings, availabilitySet] = await Promise.all([
    getConnectionStatus(doctorId, correlationId),
    getDoctorSettings(doctorId),
    hasAvailabilityRow(doctorId, correlationId),
  ]);

  const instagramConnected = ig.connected === true;
  const practiceInfoSet = isPracticeInfoSet(settings?.practice_name);
  const pricingSet = isPricingSet(settings);

  return {
    instagramConnected,
    practiceInfoSet,
    pricingSet,
    availabilitySet,
    complete:
      instagramConnected && practiceInfoSet && pricingSet && availabilitySet,
  };
}
