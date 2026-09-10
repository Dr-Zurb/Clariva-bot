import { describe, it, expect } from '@jest/globals';
import {
  financialYearForPeriod,
  formatInvoiceNumber,
  invoiceDescription,
  invoicePdfPlainText,
  monthLabelForPeriod,
} from '../../../../src/services/billing/invoice-copy';

describe('invoice-copy', () => {
  it('uses technology wording, never commission', () => {
    const text = invoiceDescription(21, 'August 2026');
    expect(text).toBe('Platform subscription and usage — 21 consultations, August 2026');
    expect(text.toLowerCase()).not.toMatch(/commission|% of|share of|fee-split/);
  });

  it('labels months and FY from the period date', () => {
    expect(monthLabelForPeriod('2026-08-01')).toBe('August 2026');
    expect(financialYearForPeriod('2026-03-01')).toBe('2025-2026');
    expect(financialYearForPeriod('2026-04-01')).toBe('2026-2027');
    expect(formatInvoiceNumber('2026-2027', 7)).toBe('HA-2026-2027-00007');
  });

  it('PDF plain text has no patient identifiers and matches stored totals', () => {
    const text = invoicePdfPlainText({
      sellerName: 'Halo Aid',
      sellerGstin: '22AAAAA0000A1Z5',
      buyerName: 'Demo Clinic',
      invoiceNumber: 'HA-2026-2027-00001',
      billingPeriod: '2026-08-01',
      description: invoiceDescription(21, 'August 2026'),
      billableCount: 21,
      baseMinor: 99_900,
      meteredMinor: 4_900,
      adjustmentsMinor: 0,
      subtotalMinor: 104_800,
      gstMinor: 18_864,
      totalMinor: 123_664,
      capApplied: false,
    });
    expect(text).toContain('Platform subscription and usage — 21 consultations, August 2026');
    expect(text).toContain('INR 1236.64');
    expect(text.toLowerCase()).not.toMatch(/patient|reason for visit|appointment time|commission/);
  });
});
