/**
 * Desk lab-order projection (desk-visit-prep Phase 4).
 * GET /api/v1/appointments/lab-pending
 * GET /api/v1/appointments/:id/lab-orders
 * PUT /api/v1/appointments/:id/lab-orders
 *
 * Auth: doctor or staff with `internal_labs` + resolveActingDoctor.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { validateGetAppointmentParams } from '../utils/validation';
import {
  LAB_NOT_DONE_REASON_CODES,
  listLabOrdersForAppointment,
  listPendingLabAppointments,
  upsertLabOrderFulfillments,
} from '../services/desk-lab-orders-service';

const labOrderFulfillmentUpdateSchema = z
  .object({
    orderId: z.string().trim().min(1).max(120),
    status: z.enum(['pending', 'uploaded', 'not_done']),
    documentId: z.string().uuid().nullable().optional(),
    reasonCode: z.enum(LAB_NOT_DONE_REASON_CODES).nullable().optional(),
    reasonNote: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'uploaded' && !value.documentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'documentId is required when marking uploaded',
        path: ['documentId'],
      });
    }
    if (value.status === 'not_done' && !value.reasonCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reasonCode is required when marking not done',
        path: ['reasonCode'],
      });
    }
    if (value.status === 'not_done' && value.reasonCode === 'other' && !value.reasonNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add a short reason',
        path: ['reasonNote'],
      });
    }
  });

const upsertLabOrderFulfillmentsBodySchema = z.object({
  updates: z.array(labOrderFulfillmentUpdateSchema).min(1).max(40),
});

export const listPendingLabAppointmentsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const items = await listPendingLabAppointments(doctorId, correlationId, actorId);
    res.status(200).json(successResponse({ items }, req));
  }
);

export const getLabOrdersHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const orders = await listLabOrdersForAppointment(id, doctorId, correlationId, actorId);
  res.status(200).json(successResponse({ orders }, req));
});

export const upsertLabOrdersHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const { updates } = upsertLabOrderFulfillmentsBodySchema.parse(req.body);
  const orders = await upsertLabOrderFulfillments(id, doctorId, correlationId, actorId, updates);
  res.status(200).json(successResponse({ orders }, req));
});
