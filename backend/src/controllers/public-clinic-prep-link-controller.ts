/**
 * Share mint (clk-21). Consultation token in, history-form path out.
 * The controller does not mint the token itself.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { mintPrepPathForConsultationToken } from '../services/public-clinic-prep-link-service';

const tokenQuery = z.object({ token: z.string().trim().min(1) }).strict();

export const getSessionPrepLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = tokenQuery.parse(req.query);
  const result = await mintPrepPathForConsultationToken(query.token, req.correlationId || 'unknown');
  res.status(200).json(successResponse(result, req));
});
