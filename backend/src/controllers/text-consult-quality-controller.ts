/**
 * Text consult chat quality sample ingest (Sub-batch D · task-text-D4).
 *
 * POST /api/v1/consultation/:sessionId/text-quality-sample
 *
 * Auth: doctor Supabase JWT OR patient companion JWT (HMAC text-token path).
 * Returns 204 on success.
 *
 * @see backend/src/services/text-chat-quality-service.ts
 */

import type { Request, Response } from 'express';
import { ingestTextChatQualitySample } from '../services/text-chat-quality-service';
import { asyncHandler } from '../utils/async-handler';
import { UnauthorizedError, ValidationError } from '../utils/errors';

export const postTextQualitySampleHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedError('Bearer token is required');
    }
    const bearerJwt = authHeader.slice(7).trim();

    await ingestTextChatQualitySample({
      pathSessionId: sessionId,
      bearerJwt,
      body: req.body,
      correlationId,
    });

    res.status(204).send();
  },
);
