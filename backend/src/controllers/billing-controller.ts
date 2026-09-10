/**
 * Billing HTTP handlers. Orchestration only.
 * Admin routes stay on requireAdminJwtOrSecret.
 * Doctor snapshot uses authenticateToken on a separate router.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import {
  getBillingReconciliation,
  getBillingRollup,
} from '../services/billing/billing-rollup-service';
import { getDoctorBillingSnapshot } from '../services/billing/doctor-billing-service';
import { renderInvoicePdf } from '../services/billing/invoice-pdf';
import { getInvoiceById, issueInvoice, loadInvoiceDoctorName } from '../services/billing/invoice-service';
import { asyncHandler } from '../utils/async-handler';
import { UnauthorizedError } from '../utils/errors';
import { successResponse } from '../utils/response';

const periodSchema = z.object({
  billingPeriod: z.string().regex(/^\d{4}-\d{2}-01$/, 'billingPeriod must be YYYY-MM-01'),
  doctorId: z.string().uuid().optional(),
});

const doctorPeriodSchema = z.object({
  billingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, 'billingPeriod must be YYYY-MM-01')
    .optional(),
});

const issueInvoiceSchema = z.object({
  doctorId: z.string().uuid(),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}-01$/, 'billingPeriod must be YYYY-MM-01'),
});

const invoiceIdSchema = z.object({
  id: z.string().uuid(),
});

export const billingRollupHandler = asyncHandler(async (req: Request, res: Response) => {
  const { billingPeriod, doctorId } = periodSchema.parse(req.query);
  const items = await getBillingRollup(billingPeriod, req.correlationId ?? '', doctorId);
  res.status(200).json(successResponse({ items }, req));
});

export const billingReconciliationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { billingPeriod } = periodSchema.parse(req.query);
  const result = await getBillingReconciliation(billingPeriod, req.correlationId ?? '');
  res.status(200).json(successResponse(result, req));
});

export const myBillingHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const { billingPeriod } = doctorPeriodSchema.parse(req.query);
  const snapshot = await getDoctorBillingSnapshot(
    userId,
    req.correlationId ?? '',
    billingPeriod
  );
  res.status(200).json(successResponse(snapshot, req));
});

export const issueInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, billingPeriod } = issueInvoiceSchema.parse(req.body);
  const invoice = await issueInvoice(doctorId, billingPeriod, req.correlationId ?? '');
  res.status(200).json(successResponse({ invoice }, req));
});

export const invoicePdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = invoiceIdSchema.parse(req.params);
  const correlationId = req.correlationId ?? '';
  const invoice = await getInvoiceById(id, correlationId);
  const buyerName = await loadInvoiceDoctorName(invoice.doctorId, correlationId);
  const buffer = await renderInvoicePdf({
    invoice,
    sellerName: env.HALO_AID_LEGAL_NAME,
    sellerGstin: env.HALO_AID_GSTIN ?? null,
    buyerName,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${invoice.invoiceNumber}.pdf"`
  );
  res.status(200).send(buffer);
});
