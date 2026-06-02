/**
 * Web Push subscribe / unsubscribe / list (task-text-D6b).
 *
 * POST   /api/v1/push/subscribe
 * DELETE /api/v1/push/subscribe/:id
 * GET    /api/v1/push/subscriptions
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  validatePushSubscribeBody,
  validatePushSubscriptionParams,
} from '../utils/validation';
import {
  extractBearerJwt,
  listActivePushSubscriptions,
  resolvePushAuthFromBearer,
  revokePushSubscription,
  upsertPushSubscription,
} from '../services/push-subscription-service';

async function resolvePrincipal(req: Request) {
  const bearerJwt = extractBearerJwt(
    req.header('authorization') || req.header('Authorization'),
  );
  return resolvePushAuthFromBearer(bearerJwt);
}

export const subscribePushHandler = asyncHandler(async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  const body = validatePushSubscribeBody(req.body);
  const subscription = await upsertPushSubscription(principal, body);
  res.status(201).json(successResponse({ id: subscription.id }, req));
});

export const unsubscribePushHandler = asyncHandler(async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  const params = validatePushSubscriptionParams(req.params);
  await revokePushSubscription(principal, params);
  res.status(204).send();
});

export const listPushSubscriptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  const subscriptions = await listActivePushSubscriptions(principal);
  res.status(200).json(successResponse({ subscriptions }, req));
});
