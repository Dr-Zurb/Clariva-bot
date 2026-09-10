/**
 * Interactions Inbox API (ibi-03+) — doctor-authenticated, read-only.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { getConversationMessagesForDoctor } from '../services/message-service';
import {
  getInteractionForDoctor,
  listInteractionsForDoctor,
} from '../services/interaction-service';
import {
  validateInteractionIdParams,
  validateListInteractionMessagesQuery,
  validateListInteractionsQuery,
} from '../utils/validation';

/**
 * GET /api/v1/interactions
 */
export const listInteractionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const query = validateListInteractionsQuery(
    req.query as Record<string, string | string[] | undefined>
  );
  const result = await listInteractionsForDoctor(userId, query, correlationId);

  res.status(200).json(successResponse(result, req));
});

/**
 * GET /api/v1/interactions/:id
 */
export const getInteractionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateInteractionIdParams(req.params);
  const interaction = await getInteractionForDoctor(userId, id, correlationId);

  res.status(200).json(successResponse({ interaction }, req));
});

/**
 * GET /api/v1/interactions/:id/messages
 * Read-only receptionist DM thread for a conversation owned by the doctor.
 */
export const listInteractionMessagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateInteractionIdParams(req.params);
  const query = validateListInteractionMessagesQuery(
    req.query as Record<string, string | string[] | undefined>
  );
  const page = await getConversationMessagesForDoctor(userId, id, correlationId, {
    limit: query.limit,
    before: query.before,
  });

  res.status(200).json(
    successResponse({ messages: page.messages, hasMoreOlder: page.hasMoreOlder }, req)
  );
});
