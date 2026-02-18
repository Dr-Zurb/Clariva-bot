/**
 * Instagram Connect Controller
 *
 * Handles OAuth connect start (redirect to Meta), callback (exchange code, save doctor_instagram),
 * and disconnect (remove doctor's Instagram link). Auth: connect and disconnect require doctor JWT;
 * callback is unauthenticated (Meta redirects with code + state).
 *
 * MUST: Use asyncHandler, successResponse/redirect; no token/code in logs (COMPLIANCE.md).
 *
 * @see docs/Development/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
 * @see docs/Development/Daily-plans/2026-02-06/e-task-4-instagram-disconnect-endpoint.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { logAuditEvent } from '../utils/audit-logger';
import { env } from '../config/env';
import { ConflictError, UnauthorizedError } from '../utils/errors';
import {
  createState,
  verifyState,
  buildMetaOAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getPageTokenAndInstagramAccount,
  saveDoctorInstagram,
  disconnectInstagram,
  getConnectionStatus,
} from '../services/instagram-connect-service';

/**
 * GET /api/v1/settings/instagram/status
 * Requires auth. Returns { connected, username? } for current doctor (no token).
 */
export const statusHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const status = await getConnectionStatus(userId, correlationId);
  res.status(200).json(successResponse(status, req));
});

/**
 * GET /api/v1/settings/instagram/connect
 * Requires auth. Redirects 302 to Meta OAuth dialog.
 */
export const connectHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const state = createState(userId);
  const url = buildMetaOAuthUrl(state);
  res.status(200).json({ redirectUrl: url });
});

/**
 * GET /api/v1/settings/instagram/callback
 * No auth. Query: code, state.
 * Verifies state, exchanges code (Instagram API), obtains user_id and long-lived token,
 * fetches username from /me, saves doctor_instagram, redirects or returns JSON.
 */
export const callbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const stateParam = typeof req.query.state === 'string' ? req.query.state : undefined;

  if (!code || !stateParam) {
    const redirectUri = env.INSTAGRAM_FRONTEND_REDIRECT_URI;
    if (redirectUri) {
      const errUrl = new URL(redirectUri);
      errUrl.searchParams.set('connected', '0');
      errUrl.searchParams.set('error', 'missing_code_or_state');
      res.redirect(302, errUrl.toString());
      return;
    }
    res.status(400).json({
      success: false,
      error: { code: 'ValidationError', message: 'Missing code or state parameter', statusCode: 400 },
      meta: { timestamp: new Date().toISOString(), requestId: correlationId },
    });
    return;
  }

  const doctorId = verifyState(stateParam);

  const { accessToken: shortLived } = await exchangeCodeForShortLivedToken(code, correlationId);
  const longLivedUserToken = await exchangeForLongLivedToken(shortLived, correlationId);
  const { pageAccessToken, instagramPageId, instagramUsername } = await getPageTokenAndInstagramAccount(
    longLivedUserToken,
    correlationId
  );

  try {
    await saveDoctorInstagram(
      doctorId,
      {
        instagram_page_id: instagramPageId,
        instagram_access_token: pageAccessToken,
        instagram_username: instagramUsername ?? null,
      },
      correlationId
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      const redirectUri = env.INSTAGRAM_FRONTEND_REDIRECT_URI;
      if (redirectUri) {
        const errUrl = new URL(redirectUri);
        errUrl.searchParams.set('connected', '0');
        errUrl.searchParams.set('error', 'page_already_linked');
        res.redirect(302, errUrl.toString());
        return;
      }
    }
    throw err;
  }

  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'connect_instagram',
    resourceType: 'doctor_instagram',
    resourceId: doctorId,
    status: 'success',
  });

  const redirectUri = env.INSTAGRAM_FRONTEND_REDIRECT_URI;
  if (redirectUri) {
    const successUrl = new URL(redirectUri);
    successUrl.searchParams.set('connected', '1');
    res.redirect(302, successUrl.toString());
    return;
  }
  res.status(200).json(successResponse({ connected: true }, req));
});

/**
 * DELETE /api/v1/settings/instagram/disconnect
 * Requires auth. Removes the authenticated doctor's Instagram link (idempotent).
 */
export const disconnectHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  await disconnectInstagram(userId, correlationId);

  await logAuditEvent({
    correlationId,
    userId,
    action: 'instagram_disconnect',
    resourceType: 'doctor_instagram',
    resourceId: userId,
    status: 'success',
  });

  res.status(204).send();
});
