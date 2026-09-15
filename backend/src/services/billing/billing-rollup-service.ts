/**
 * Read-only month rollup + reconciliation (billing P1.7).
 * Founder raises invoices by hand from these numbers.
 */

import { getSupabaseAdminClient } from '../../config/database';
import { computeMonthlyBill, type MonthlyBill } from '../../config/billing-levels';
import { logger } from '../../config/logger';
import { InternalError } from '../../utils/errors';

export interface BillingRollup {
  doctorId: string;
  billingPeriod: string;
  billableCount: number;
  voidCount: number;
  voidByReason: Record<string, number>;
  bill: MonthlyBill;
}

export interface ReconciliationGap {
  appointmentId: string;
  doctorId: string;
  kind: 'completed_without_ledger' | 'ledger_without_completed';
}

export interface ReconciliationResult {
  billingPeriod: string;
  gaps: ReconciliationGap[];
}

export async function getBillingRollup(
  billingPeriod: string,
  correlationId: string,
  doctorId?: string
): Promise<BillingRollup[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  let query = admin
    .from('billable_consults')
    .select('doctor_id, status, void_reason')
    .eq('billing_period', billingPeriod);

  if (doctorId) {
    query = query.eq('doctor_id', doctorId);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn({ correlationId, error: error.message }, 'getBillingRollup: query failed');
    throw new InternalError('Failed to load billing rollup');
  }

  const byDoctor = new Map<string, { billable: number; voidCount: number; voidByReason: Record<string, number> }>();
  for (const row of data ?? []) {
    const id = row.doctor_id as string;
    const bucket = byDoctor.get(id) ?? { billable: 0, voidCount: 0, voidByReason: {} };
    if (row.status === 'billable') {
      bucket.billable += 1;
    } else if (row.status === 'void') {
      bucket.voidCount += 1;
      const reason = (row.void_reason as string | null) ?? 'unknown';
      bucket.voidByReason[reason] = (bucket.voidByReason[reason] ?? 0) + 1;
    }
    byDoctor.set(id, bucket);
  }

  if (doctorId && !byDoctor.has(doctorId)) {
    byDoctor.set(doctorId, { billable: 0, voidCount: 0, voidByReason: {} });
  }

  return [...byDoctor.entries()].map(([id, bucket]) => ({
    doctorId: id,
    billingPeriod,
    billableCount: bucket.billable,
    voidCount: bucket.voidCount,
    voidByReason: bucket.voidByReason,
    bill: computeMonthlyBill({ billableCount: bucket.billable }),
  }));
}

export async function getBillingReconciliation(
  billingPeriod: string,
  correlationId: string
): Promise<ReconciliationResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const periodStart = `${billingPeriod}T00:00:00+05:30`;
  const start = new Date(periodStart);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const { data: completed, error: completedError } = await admin
    .from('appointments')
    .select('id, doctor_id, status, verified_at, updated_at')
    .eq('status', 'completed')
    .gte('updated_at', start.toISOString())
    .lt('updated_at', end.toISOString());

  if (completedError) {
    logger.warn({ correlationId, error: completedError.message }, 'reconciliation: completed scan failed');
    throw new InternalError('Failed to load reconciliation');
  }

  const { data: ledger, error: ledgerError } = await admin
    .from('billable_consults')
    .select('appointment_id, doctor_id')
    .eq('billing_period', billingPeriod);

  if (ledgerError) {
    logger.warn({ correlationId, error: ledgerError.message }, 'reconciliation: ledger scan failed');
    throw new InternalError('Failed to load reconciliation');
  }

  const ledgerByAppt = new Map(
    (ledger ?? []).map((row) => [row.appointment_id as string, row.doctor_id as string])
  );
  const gaps: ReconciliationGap[] = [];

  for (const apt of completed ?? []) {
    if (!ledgerByAppt.has(apt.id as string)) {
      gaps.push({
        appointmentId: apt.id as string,
        doctorId: apt.doctor_id as string,
        kind: 'completed_without_ledger',
      });
    }
  }

  const completedIds = new Set((completed ?? []).map((a) => a.id as string));

  const missingCompletedIds = (ledger ?? [])
    .map((row) => row.appointment_id as string)
    .filter((id) => !completedIds.has(id));

  if (missingCompletedIds.length > 0) {
    const { data: statusRows, error: statusError } = await admin
      .from('appointments')
      .select('id, doctor_id, status')
      .in('id', missingCompletedIds);

    if (statusError) {
      logger.warn({ correlationId, error: statusError.message }, 'reconciliation: status lookup failed');
      throw new InternalError('Failed to load reconciliation');
    }

    for (const row of statusRows ?? []) {
      if (row.status !== 'completed') {
        gaps.push({
          appointmentId: row.id as string,
          doctorId: row.doctor_id as string,
          kind: 'ledger_without_completed',
        });
      }
    }
  }

  return { billingPeriod, gaps };
}
