/**
 * Payment Controller
 *
 * Handles HTTP requests for payment endpoints and webhooks.
 * POST /api/v1/payments/create-link - Create payment link (doctor or worker)
 * GET /api/v1/payments/:id - Get payment status (doctor auth)
 * POST /webhooks/razorpay - Razorpay webhook
 * POST /webhooks/paypal - PayPal webhook
 *
 * Auth: create-link unauthenticated (webhook worker) or doctor; getById doctor-only.
 * Webhooks: signature verification only (no JWT).
 *
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { createPaymentLink as createPaymentLinkService, getPaymentById } from '../services/payment-service';
import { validateCreatePaymentLink, validateGetPaymentParams } from '../utils/validation';
import { UnauthorizedError, NotFoundError } from '../utils/errors';

/**
 * Create payment link
 * POST /api/v1/payments/create-link
 *
 * Body: appointmentId, amountMinor, currency, doctorCountry, doctorId, patientId, patientName?, patientPhone?, patientEmail?, description?
 */
export const createPaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';

  const data = validateCreatePaymentLink(req.body);
  const result = await createPaymentLinkService(
    {
      appointmentId: data.appointmentId,
      amountMinor: data.amountMinor,
      currency: data.currency,
      doctorCountry: data.doctorCountry,
      doctorId: data.doctorId,
      patientId: data.patientId,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail,
      description: data.description,
    },
    correlationId
  );

  res.status(201).json(successResponse({ payment: result }, req));
});

/**
 * Get payment by ID
 * GET /api/v1/payments/:id
 *
 * Auth: Requires authenticated doctor. RLS enforces ownership via appointment.
 */
export const getPaymentByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateGetPaymentParams(req.params);
  const payment = await getPaymentById(id, correlationId, userId);

  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  res.status(200).json(successResponse({ payment }, req));
});
