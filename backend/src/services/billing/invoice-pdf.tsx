/**
 * Invoice PDF render (P2.8). Standalone — do not import the prescription graph.
 */

import * as React from 'react';
import { Document, Page, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { IssuedInvoice } from './invoice-service';
import { invoicePdfPlainText, type InvoicePdfCopyInput } from './invoice-copy';

export interface InvoicePdfInput {
  invoice: IssuedInvoice;
  sellerName: string;
  sellerGstin?: string | null;
  buyerName: string;
}

export function toInvoicePdfCopyInput(input: InvoicePdfInput): InvoicePdfCopyInput {
  return {
    sellerName: input.sellerName,
    sellerGstin: input.sellerGstin ?? null,
    buyerName: input.buyerName,
    invoiceNumber: input.invoice.invoiceNumber,
    billingPeriod: input.invoice.billingPeriod,
    description: input.invoice.description,
    billableCount: input.invoice.billableCount,
    baseMinor: input.invoice.baseMinor,
    meteredMinor: input.invoice.meteredMinor,
    adjustmentsMinor: input.invoice.adjustmentsMinor,
    subtotalMinor: input.invoice.subtotalMinor,
    gstMinor: input.invoice.gstMinor,
    totalMinor: input.invoice.totalMinor,
    capApplied: input.invoice.capApplied,
  };
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', color: '#111' },
  title: { fontSize: 18, marginBottom: 16, fontFamily: 'Helvetica-Bold' },
  row: { marginBottom: 6 },
  muted: { color: '#444', marginBottom: 4 },
  section: { marginTop: 16 },
  total: { marginTop: 12, fontFamily: 'Helvetica-Bold', fontSize: 13 },
});

function rupees(minor: number): string {
  return `INR ${(minor / 100).toFixed(2)}`;
}

function InvoiceDocument({ copy }: { copy: InvoicePdfCopyInput }): React.ReactElement {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Tax invoice</Text>
        <Text style={styles.row}>{copy.sellerName}</Text>
        {copy.sellerGstin ? <Text style={styles.muted}>GSTIN {copy.sellerGstin}</Text> : null}
        <Text style={styles.section}>Bill to</Text>
        <Text style={styles.row}>{copy.buyerName}</Text>
        <Text style={styles.section}>Invoice {copy.invoiceNumber}</Text>
        <Text style={styles.muted}>Period {copy.billingPeriod}</Text>
        <Text style={styles.section}>{copy.description}</Text>
        <Text style={styles.row}>Consultations {copy.billableCount}</Text>
        <Text style={styles.row}>Subscription {rupees(copy.baseMinor)}</Text>
        <Text style={styles.row}>Usage {rupees(copy.meteredMinor)}</Text>
        {copy.adjustmentsMinor !== 0 ? (
          <Text style={styles.row}>Adjustments {rupees(copy.adjustmentsMinor)}</Text>
        ) : null}
        <Text style={styles.row}>Taxable value {rupees(copy.subtotalMinor)}</Text>
        <Text style={styles.row}>GST 18% {rupees(copy.gstMinor)}</Text>
        <Text style={styles.total}>Total {rupees(copy.totalMinor)}</Text>
        {copy.capApplied ? (
          <Text style={styles.muted}>Monthly maximum applied.</Text>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const copy = toInvoicePdfCopyInput(input);
  return renderToBuffer(React.createElement(InvoiceDocument, { copy }) as never);
}

export function invoicePdfTextForTest(input: InvoicePdfInput): string {
  return invoicePdfPlainText(toInvoicePdfCopyInput(input));
}
