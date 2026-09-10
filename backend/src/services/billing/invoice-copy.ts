/**
 * Invoice wording (P2-D7). Technology, never commission.
 */

export function invoiceDescription(billableCount: number, monthLabel: string): string {
  return `Platform subscription and usage — ${billableCount} consultations, ${monthLabel}`;
}

export function monthLabelForPeriod(billingPeriod: string): string {
  const [year, month] = billingPeriod.split('-').map(Number);
  if (!year || !month) return billingPeriod;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function financialYearForPeriod(billingPeriod: string): string {
  const [year, month] = billingPeriod.split('-').map(Number);
  if (!year || !month) return String(year ?? '');
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

export function formatInvoiceNumber(financialYear: string, serial: number): string {
  return `HA-${financialYear}-${String(serial).padStart(5, '0')}`;
}

export interface InvoicePdfCopyInput {
  sellerName: string;
  sellerGstin: string | null;
  buyerName: string;
  invoiceNumber: string;
  billingPeriod: string;
  description: string;
  billableCount: number;
  baseMinor: number;
  meteredMinor: number;
  adjustmentsMinor: number;
  subtotalMinor: number;
  gstMinor: number;
  totalMinor: number;
  capApplied: boolean;
}

function rupees(minor: number): string {
  return `INR ${(minor / 100).toFixed(2)}`;
}

/** Same strings the PDF renders — tests assert wording here, not via react-pdf. */
export function invoicePdfPlainText(copy: InvoicePdfCopyInput): string {
  const lines = [
    'Tax invoice',
    copy.sellerName,
    copy.sellerGstin ? `GSTIN ${copy.sellerGstin}` : '',
    'Bill to',
    copy.buyerName,
    `Invoice ${copy.invoiceNumber}`,
    `Period ${copy.billingPeriod}`,
    copy.description,
    `Consultations ${copy.billableCount}`,
    `Subscription ${rupees(copy.baseMinor)}`,
    `Usage ${rupees(copy.meteredMinor)}`,
    copy.adjustmentsMinor !== 0 ? `Adjustments ${rupees(copy.adjustmentsMinor)}` : '',
    `Taxable value ${rupees(copy.subtotalMinor)}`,
    `GST 18% ${rupees(copy.gstMinor)}`,
    `Total ${rupees(copy.totalMinor)}`,
    copy.capApplied ? 'Monthly maximum applied.' : '',
  ];
  return lines.filter((line) => line.length > 0).join('\n');
}
