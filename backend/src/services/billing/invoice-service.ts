/**
 * Issue a doctor invoice (P2a). Idempotent per doctor + period.
 * Latches invoiced_at + invoice_id on the covering ledger rows.
 */

import { getSupabaseAdminClient } from '../../config/database';
import { GST_PERCENT } from '../../config/billing-levels';
import { logger } from '../../config/logger';
import { InternalError, NotFoundError } from '../../utils/errors';
import { logDataModification } from '../../utils/audit-logger';
import {
  financialYearForPeriod,
  formatInvoiceNumber,
  invoiceDescription,
  monthLabelForPeriod,
} from './invoice-copy';
import { billForSubscription, ensureSubscription } from './subscription-service';

export interface IssuedInvoice {
  id: string;
  doctorId: string;
  billingPeriod: string;
  invoiceNumber: string;
  billableCount: number;
  notBilledCount: number;
  baseMinor: number;
  meteredMinor: number;
  subtotalMinor: number;
  adjustmentsMinor: number;
  gstMinor: number;
  totalMinor: number;
  capApplied: boolean;
  status: string;
  issuedAt: string | null;
  description: string;
}

export async function issueInvoice(
  doctorId: string,
  billingPeriod: string,
  correlationId: string
): Promise<IssuedInvoice> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: existingError } = await admin
    .from('doctor_invoices')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('billing_period', billingPeriod)
    .neq('status', 'void')
    .maybeSingle();

  if (existingError) {
    logger.warn({ correlationId, error: existingError.message }, 'issueInvoice: lookup failed');
    throw new InternalError('Failed to load invoice');
  }
  if (existing) {
    return toIssued(existing as Record<string, unknown>);
  }

  const subscription = await ensureSubscription(doctorId, correlationId);

  const { data: ledger, error: ledgerError } = await admin
    .from('billable_consults')
    .select('id, status')
    .eq('doctor_id', doctorId)
    .eq('billing_period', billingPeriod);

  if (ledgerError) {
    throw new InternalError('Failed to load ledger for invoice');
  }

  const rows = ledger ?? [];
  const billableCount = rows.filter((r) => r.status === 'billable').length;
  const notBilledCount = rows.filter((r) => r.status !== 'billable').length;
  const bill = billForSubscription(billableCount, subscription, billingPeriod);

  const { data: adjustments, error: adjError } = await admin
    .from('billing_adjustments')
    .select('amount_minor')
    .eq('doctor_id', doctorId)
    .eq('billing_period', billingPeriod);

  if (adjError) {
    throw new InternalError('Failed to load adjustments');
  }

  const adjustmentsMinor = (adjustments ?? []).reduce(
    (sum, row) => sum + (row.amount_minor as number),
    0
  );
  const subtotalMinor = Math.max(0, bill.cappedMinor + adjustmentsMinor);
  const gstMinor = Math.round((subtotalMinor * GST_PERCENT) / 100);
  const totalMinor = subtotalMinor + gstMinor;

  const invoiceNumber = await nextInvoiceNumber(admin, billingPeriod, correlationId);

  const { data: inserted, error: insertError } = await admin
    .from('doctor_invoices')
    .insert({
      doctor_id: doctorId,
      billing_period: billingPeriod,
      invoice_number: invoiceNumber,
      billable_count: billableCount,
      not_billed_count: notBilledCount,
      base_minor: bill.baseMinor,
      metered_minor: bill.meteredMinor,
      subtotal_minor: subtotalMinor,
      adjustments_minor: adjustmentsMinor,
      gst_minor: gstMinor,
      total_minor: totalMinor,
      cap_applied: bill.capReached,
      status: 'issued',
      issued_at: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced } = await admin
        .from('doctor_invoices')
        .select('*')
        .eq('doctor_id', doctorId)
        .eq('billing_period', billingPeriod)
        .neq('status', 'void')
        .maybeSingle();
      if (raced) return toIssued(raced as Record<string, unknown>);
    }
    logger.warn({ correlationId, error: insertError.message }, 'issueInvoice: insert failed');
    throw new InternalError('Failed to issue invoice');
  }
  if (!inserted) {
    throw new InternalError('Failed to issue invoice');
  }

  const nowIso = inserted.issued_at as string;
  const { error: latchError } = await admin
    .from('billable_consults')
    .update({ invoiced_at: nowIso, invoice_id: inserted.id })
    .eq('doctor_id', doctorId)
    .eq('billing_period', billingPeriod)
    .is('invoiced_at', null);

  if (latchError) {
    logger.warn({ correlationId, error: latchError.message }, 'issueInvoice: latch failed');
  }

  await logDataModification(
    correlationId,
    undefined as unknown as string,
    'create',
    'doctor_invoice',
    inserted.id as string,
    ['invoice_number', 'total_minor', 'billing_period']
  );

  return toIssued(inserted as Record<string, unknown>);
}

export async function getInvoiceById(invoiceId: string, correlationId: string): Promise<IssuedInvoice> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await admin
    .from('doctor_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) {
    logger.warn({ correlationId, error: error.message }, 'getInvoiceById failed');
    throw new InternalError('Failed to load invoice');
  }
  if (!data) {
    throw new NotFoundError('Invoice not found');
  }
  return toIssued(data as Record<string, unknown>);
}

export async function loadInvoiceDoctorName(
  doctorId: string,
  correlationId: string
): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'Doctor';
  const { data, error } = await admin
    .from('doctor_settings')
    .select('practice_name')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) {
    logger.warn({ correlationId, error: error.message }, 'loadInvoiceDoctorName failed');
    return 'Doctor';
  }
  const name = (data?.practice_name as string | null | undefined)?.trim();
  return name && name.length > 0 ? name : 'Doctor';
}

async function nextInvoiceNumber(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  billingPeriod: string,
  correlationId: string
): Promise<string> {
  const fy = financialYearForPeriod(billingPeriod);
  const { data, error } = await admin.rpc('next_billing_invoice_serial', { p_fy: fy });
  if (error || data == null) {
    logger.warn({ correlationId, error: error?.message }, 'invoice serial rpc failed');
    throw new InternalError('Failed to allocate invoice number');
  }
  return formatInvoiceNumber(fy, Number(data));
}

function toIssued(row: Record<string, unknown>): IssuedInvoice {
  const billingPeriod = row.billing_period as string;
  const billableCount = row.billable_count as number;
  return {
    id: row.id as string,
    doctorId: row.doctor_id as string,
    billingPeriod,
    invoiceNumber: row.invoice_number as string,
    billableCount,
    notBilledCount: row.not_billed_count as number,
    baseMinor: row.base_minor as number,
    meteredMinor: row.metered_minor as number,
    subtotalMinor: row.subtotal_minor as number,
    adjustmentsMinor: row.adjustments_minor as number,
    gstMinor: row.gst_minor as number,
    totalMinor: row.total_minor as number,
    capApplied: row.cap_applied as boolean,
    status: row.status as string,
    issuedAt: (row.issued_at as string | null) ?? null,
    description: invoiceDescription(billableCount, monthLabelForPeriod(billingPeriod)),
  };
}
