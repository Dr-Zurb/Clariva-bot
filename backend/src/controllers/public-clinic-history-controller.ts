/**
 * Public patient history (clk-11). Token is the auth. No chart write.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { readPatientHistory, submitPatientHistory } from '../services/public-clinic-history-service';
import {
  listPublicMedicineCatalog,
  suggestPublicMedicines,
} from '../services/public-clinic-medicine-suggest-service';

const nameItem = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const durationUnit = z.enum(['days', 'months', 'years']);
const timedItem = z
  .object({
    name: z.string().trim().min(1).max(80),
    durationValue: z.number().int().min(1).max(1200).nullish(),
    durationUnit: durationUnit.nullish(),
  })
  .strict()
  .superRefine((item, ctx) => {
    const hasValue = item.durationValue != null;
    const hasUnit = item.durationUnit != null;
    if (hasValue !== hasUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'How long needs a number and a unit',
        path: ['durationValue'],
      });
    }
  });
const nameList = z
  .object({
    none: z.boolean(),
    items: z.array(nameItem).max(30),
  })
  .strict();
const timedList = z
  .object({
    none: z.boolean(),
    items: z.array(timedItem).max(30),
  })
  .strict();

const bodySchema = z
  .object({
    token: z.string().trim().min(1),
    noticeVersion: z.string().trim().min(1).max(64),
    allergies: nameList,
    medicines: timedList,
    conditions: timedList,
    chips: z
      .object({
        since: z.string().trim().max(120).optional(),
        course: z.enum(['better', 'same', 'worse']).optional(),
        tried: z.string().trim().max(200).optional(),
        aim: z.enum(['new_problem', 'follow_up', 'reports', 'refill']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const querySchema = z.object({ token: z.string().trim().min(1) }).strict();

const medicineQuerySchema = z
  .object({
    token: z.string().trim().min(1),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

export const getPublicClinicHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = querySchema.parse(req.query);
  const result = await readPatientHistory(query.token, req.correlationId || 'unknown');
  res.status(200).json(successResponse(result, req));
});

export const getPublicClinicMedicineSuggestHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = medicineQuerySchema.parse(req.query);
  const correlationId = req.correlationId || 'unknown';
  if (!query.q) {
    const catalog = await listPublicMedicineCatalog(query.token, correlationId);
    res.status(200).json(successResponse(catalog, req));
    return;
  }
  const result = await suggestPublicMedicines(query.token, query.q, correlationId);
  res.status(200).json(successResponse(result, req));
});

export const postPublicClinicHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = bodySchema.parse(req.body);
  const result = await submitPatientHistory(body, req.correlationId || 'unknown');
  res.status(200).json(successResponse(result, req));
});
