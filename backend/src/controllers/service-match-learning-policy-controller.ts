/**
 * learn-04: Policy suggestions and opt-in autobook policies (doctor-authenticated).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  acceptPolicySuggestion,
  declinePolicySuggestion,
  disableAutobookPolicy,
  listAutobookPoliciesForDoctor,
  listPolicySuggestionsForDoctor,
  snoozePolicySuggestion,
} from '../services/service-match-learning-policy-service';
import {
  validateAutobookPolicyIdParams,
  validateListAutobookPoliciesQuery,
  validateListPolicySuggestionsQuery,
  validatePolicySuggestionIdParams,
  validateSnoozePolicySuggestionBody,
} from '../utils/validation';

export const listPolicySuggestionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const q = validateListPolicySuggestionsQuery(req.query as Record<string, string | string[] | undefined>);
  const status = q.status === 'all' || q.status === undefined ? 'all' : q.status;

  const suggestions = await listPolicySuggestionsForDoctor({
    doctorId: userId,
    correlationId,
    status,
  });

  res.status(200).json(successResponse({ suggestions }, req));
});

export const listAutobookPoliciesHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const q = validateListAutobookPoliciesQuery(req.query as Record<string, string | string[] | undefined>);
  const activeOnly = q.activeOnly === undefined ? true : q.activeOnly === 'true';

  const policies = await listAutobookPoliciesForDoctor({
    doctorId: userId,
    correlationId,
    activeOnly,
  });

  res.status(200).json(successResponse({ policies }, req));
});

export const acceptPolicySuggestionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePolicySuggestionIdParams(req.params);
  const result = await acceptPolicySuggestion({
    suggestionId: id,
    doctorId: userId,
    actorUserId: userId,
    correlationId,
  });

  res.status(200).json(successResponse(result, req));
});

export const declinePolicySuggestionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePolicySuggestionIdParams(req.params);
  const suggestion = await declinePolicySuggestion({
    suggestionId: id,
    doctorId: userId,
    actorUserId: userId,
    correlationId,
  });

  res.status(200).json(successResponse({ suggestion }, req));
});

export const snoozePolicySuggestionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePolicySuggestionIdParams(req.params);
  const body = validateSnoozePolicySuggestionBody(req.body);
  const suggestion = await snoozePolicySuggestion({
    suggestionId: id,
    doctorId: userId,
    actorUserId: userId,
    correlationId,
    snoozeDays: body.snoozeDays,
  });

  res.status(200).json(successResponse({ suggestion }, req));
});

export const disableAutobookPolicyHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateAutobookPolicyIdParams(req.params);
  const policy = await disableAutobookPolicy({
    policyId: id,
    doctorId: userId,
    actorUserId: userId,
    correlationId,
  });

  res.status(200).json(successResponse({ policy }, req));
});
