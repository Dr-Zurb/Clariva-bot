/**
 * Doctor-facing billing snapshot (P2.2 / B5).
 * No patient names, no consult fees, no follow-up policy.
 */

import { getSupabaseAdminClient } from '../../config/database';
import {
  CAP_REACHED_COPY,
  consultsUntilCap,
  gstInclusiveRupees,
} from '../../config/billing-levels';
import { logger } from '../../config/logger';
import { InternalError } from '../../utils/errors';
import { billingPeriodFor } from './usage-ledger-service';
import { billForSubscription, ensureSubscription } from './subscription-service';

export interface DoctorLedgerLine {
  id: string;
  appointmentId: string;
  occurredAt: string;
  modality: string;
  source: string;
  status: string;
  voidReason: string | null;
  notBilledLabel: string | null;
}

export interface DoctorInvoiceSummary {
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  billableCount: number;
  totalMinor: number;
  status: string;
  issuedAt: string | null;
}

export interface DoctorBillingSnapshot {
  billingPeriod: string;
  subscription: {
    planKind: string;
    status: string;
    baseWaivedUntil: string | null;
    levelsLockedUntil: string | null;
    baseWaivedThisPeriod: boolean;
  };
  billableCount: number;
  notBilledCount: number;
  consultsUntilCap: number;
  capReached: boolean;
  capReachedCopy: string | null;
  bill: {
    baseMinor: number;
    meteredMinor: number;
    subtotalMinor: number;
    cappedMinor: number;
    gstMinor: number;
    totalMinor: number;
    inclusiveRupees: {
      base: number;
      perConsult: number;
      cap: number;
      total: number;
    };
  };
  consults: DoctorLedgerLine[];
  invoices: DoctorInvoiceSummary[];
}

export async function getDoctorBillingSnapshot(
  doctorId: string,
  correlationId: string,
  billingPeriod?: string
): Promise<DoctorBillingSnapshot> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const period = billingPeriod ?? billingPeriodFor(new Date());
  const subscription = await ensureSubscription(doctorId, correlationId);

  const { data: ledger, error: ledgerError } = await admin
    .from('billable_consults')
    .select('id, appointment_id, occurred_at, modality, source, status, void_reason')
    .eq('doctor_id', doctorId)
    .eq('billing_period', period)
    .order('occurred_at', { ascending: false });

  if (ledgerError) {
    logger.warn({ correlationId, error: ledgerError.message }, 'doctor snapshot: ledger failed');
    throw new InternalError('Failed to load billing snapshot');
  }

  const { data: invoices, error: invoiceError } = await admin
    .from('doctor_invoices')
    .select('id, invoice_number, billing_period, billable_count, total_minor, status, issued_at')
    .eq('doctor_id', doctorId)
    .neq('status', 'void')
    .order('billing_period', { ascending: false });

  if (invoiceError) {
    logger.warn({ correlationId, error: invoiceError.message }, 'doctor snapshot: invoices failed');
    throw new InternalError('Failed to load billing snapshot');
  }

  const rows = ledger ?? [];
  const billableCount = rows.filter((r) => r.status === 'billable').length;
  const notBilledCount = rows.filter((r) => r.status !== 'billable').length;
  const bill = billForSubscription(billableCount, subscription, period);
  const untilCap = consultsUntilCap(billableCount, {
    baseMinor: bill.baseMinor,
    includedConsults: subscription.includedConsults,
    perConsultMinor: subscription.perConsultMinor,
    capMinor: subscription.capMinor,
  });

  return {
    billingPeriod: period,
    subscription: {
      planKind: subscription.planKind,
      status: subscription.status,
      baseWaivedUntil: subscription.baseWaivedUntil,
      levelsLockedUntil: subscription.levelsLockedUntil,
      baseWaivedThisPeriod: bill.baseMinor === 0 && subscription.baseWaivedUntil != null,
    },
    billableCount,
    notBilledCount,
    consultsUntilCap: untilCap,
    capReached: bill.capReached,
    capReachedCopy: bill.capReached ? CAP_REACHED_COPY : null,
    bill: {
      baseMinor: bill.baseMinor,
      meteredMinor: bill.meteredMinor,
      subtotalMinor: bill.subtotalMinor,
      cappedMinor: bill.cappedMinor,
      gstMinor: bill.gstMinor,
      totalMinor: bill.totalMinor,
      inclusiveRupees: {
        base: gstInclusiveRupees(subscription.baseMinor),
        perConsult: gstInclusiveRupees(subscription.perConsultMinor),
        cap: gstInclusiveRupees(subscription.capMinor),
        total: gstInclusiveRupees(bill.cappedMinor),
      },
    },
    consults: rows.map((row) => ({
      id: row.id as string,
      appointmentId: row.appointment_id as string,
      occurredAt: row.occurred_at as string,
      modality: row.modality as string,
      source: row.source as string,
      status: row.status as string,
      voidReason: (row.void_reason as string | null) ?? null,
      notBilledLabel: notBilledLabel(
        row.status as string,
        (row.void_reason as string | null) ?? null
      ),
    })),
    invoices: (invoices ?? []).map((row) => ({
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      billingPeriod: row.billing_period as string,
      billableCount: row.billable_count as number,
      totalMinor: row.total_minor as number,
      status: row.status as string,
      issuedAt: (row.issued_at as string | null) ?? null,
    })),
  };
}

export function notBilledLabel(status: string, voidReason: string | null): string | null {
  if (status === 'billable') return null;
  if (voidReason === 'same_encounter_continuation') return 'Same-encounter continuation';
  if (status === 'void') return 'Voided';
  return 'Not billed';
}
