/**
 * Doctor subscription (P2-D6). One row per doctor.
 * Founding waiver is never auto-set — founder writes the dates by hand.
 */

import { getSupabaseAdminClient } from '../../config/database';
import {
  BASE_MINOR,
  CAP_MINOR,
  INCLUDED_CONSULTS,
  PER_CONSULT_MINOR,
  computeMonthlyBill,
  isBaseWaived,
  type MonthlyBill,
} from '../../config/billing-levels';
import { logger } from '../../config/logger';
import { InternalError } from '../../utils/errors';

export interface DoctorSubscription {
  doctorId: string;
  status: string;
  planKind: string;
  baseMinor: number;
  includedConsults: number;
  perConsultMinor: number;
  capMinor: number;
  baseWaivedUntil: string | null;
  levelsLockedUntil: string | null;
}

export function billForSubscription(
  billableCount: number,
  sub: DoctorSubscription,
  billingPeriod: string
): MonthlyBill {
  const waived = isBaseWaived(billingPeriod, sub.baseWaivedUntil);
  return computeMonthlyBill({
    billableCount,
    baseMinor: waived ? 0 : sub.baseMinor,
    includedConsults: sub.includedConsults,
    perConsultMinor: sub.perConsultMinor,
    capMinor: sub.capMinor,
  });
}

export async function ensureSubscription(
  doctorId: string,
  correlationId: string
): Promise<DoctorSubscription> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: readError } = await admin
    .from('doctor_subscriptions')
    .select('*')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (readError) {
    logger.warn({ correlationId, error: readError.message }, 'ensureSubscription: read failed');
    throw new InternalError('Failed to load subscription');
  }
  if (existing) {
    return toSubscription(existing as Record<string, unknown>);
  }

  const { data: inserted, error: insertError } = await admin
    .from('doctor_subscriptions')
    .insert({
      doctor_id: doctorId,
      status: 'active',
      plan_kind: 'standard',
      base_minor: BASE_MINOR,
      included_consults: INCLUDED_CONSULTS,
      per_consult_minor: PER_CONSULT_MINOR,
      cap_minor: CAP_MINOR,
    })
    .select('*')
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced } = await admin
        .from('doctor_subscriptions')
        .select('*')
        .eq('doctor_id', doctorId)
        .maybeSingle();
      if (raced) return toSubscription(raced as Record<string, unknown>);
    }
    logger.warn({ correlationId, error: insertError.message }, 'ensureSubscription: insert failed');
    throw new InternalError('Failed to create subscription');
  }
  if (!inserted) {
    throw new InternalError('Failed to create subscription');
  }
  return toSubscription(inserted as Record<string, unknown>);
}

function toSubscription(row: Record<string, unknown>): DoctorSubscription {
  return {
    doctorId: row.doctor_id as string,
    status: row.status as string,
    planKind: row.plan_kind as string,
    baseMinor: row.base_minor as number,
    includedConsults: row.included_consults as number,
    perConsultMinor: row.per_consult_minor as number,
    capMinor: row.cap_minor as number,
    baseWaivedUntil: (row.base_waived_until as string | null) ?? null,
    levelsLockedUntil: (row.levels_locked_until as string | null) ?? null,
  };
}
