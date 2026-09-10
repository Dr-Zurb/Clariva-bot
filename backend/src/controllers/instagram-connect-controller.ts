/**
 * Instagram Connect Controller
 *
 * Handles OAuth connect start (redirect to Meta), callback (exchange code, save doctor_instagram),
 * and disconnect (remove doctor's Instagram link). Auth: connect and disconnect require doctor JWT;
 * callback is unauthenticated (Meta redirects with code + state).
 *
 * MUST: Use asyncHandler, successResponse/redirect; no token/code in logs (COMPLIANCE.md).
 *
 * @see docs/Work/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
 * @see docs/Work/Daily-plans/2026-02-06/e-task-4-instagram-disconnect-endpoint.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { logAuditEvent } from '../utils/audit-logger';
import { env } from '../config/env';
import {
  ConflictError,
  DoctorNotVerifiedError,
  UnauthorizedError,
} from '../utils/errors';
import {
  createState,
  verifyState,
  buildMetaOAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getInstagramUserInfo,
  saveDoctorInstagram,
  subscribeInstagramAccountApps,
  disconnectInstagram,
  getInstagramDashboardStatus,
} from '../services/instagram-connect-service';

import { isDoctorVerified } from '../services/doctor-verification-service';
import { rewriteOAuthFrontendPathToBridge } from '../utils/oauth-frontend-redirect';

const DOCTOR_VERIFY_FIRST_MESSAGE =
  'Verify your medical registration before connecting Instagram. Open Get verified in the dashboard.';

/**
 * Build the browser redirect after Meta OAuth. Prefer INSTAGRAM_FRONTEND_REDIRECT_URI
 * (usually `/auth/instagram-return`). Legacy `/dashboard/*` targets are rewritten to
 * the public bridge so SameSite=Lax cookies survive the Meta return.
 */
function buildFrontendConnectRedirect(opts: {
  connected: '0' | '1';
  error?: string;
}): string | null {
  const configured = env.INSTAGRAM_FRONTEND_REDIRECT_URI;
  if (!configured) return null;
  const url = new URL(configured);
  rewriteOAuthFrontendPathToBridge(url, '/auth/instagram-return');
  url.searchParams.set('connected', opts.connected);
  if (opts.error) {
    url.searchParams.set('error', opts.error);
  }
  return url.toString();
}

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

  const status = await getInstagramDashboardStatus(userId, correlationId);
  res.status(200).json(successResponse(status, req));
});

/**
 * GET /api/v1/settings/instagram/connect
 * Requires auth. Redirects 302 to Meta OAuth dialog.
 */
export const connectHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  // ver-05: unverified doctors cannot start OAuth (patient-facing activation).
  const verified = await isDoctorVerified(userId, correlationId);
  if (!verified) {
    throw new DoctorNotVerifiedError(DOCTOR_VERIFY_FIRST_MESSAGE);
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
    const errUrl = buildFrontendConnectRedirect({
      connected: '0',
      error: 'missing_code_or_state',
    });
    if (errUrl) {
      res.redirect(302, errUrl);
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

  // ver-05 defense-in-depth: block token exchange/save if not verified
  // (e.g. stale OAuth state minted before the gate).
  const verified = await isDoctorVerified(doctorId, correlationId);
  if (!verified) {
    const errUrl = buildFrontendConnectRedirect({
      connected: '0',
      error: 'doctor_not_verified',
    });
    if (errUrl) {
      res.redirect(302, errUrl);
      return;
    }
    throw new DoctorNotVerifiedError(DOCTOR_VERIFY_FIRST_MESSAGE);
  }

  // Instagram Login (ilr-18): code → short-lived → long-lived IG user token → /me.
  // No Facebook Page list. facebook_user_id is unavailable on this path (null).
  const { accessToken: shortLived, userId: exchangeUserId } = await exchangeCodeForShortLivedToken(
    code,
    correlationId
  );
  const { accessToken: longLivedToken, expiresIn } = await exchangeForLongLivedToken(
    shortLived,
    correlationId
  );
  const { userId: meUserId, username } = await getInstagramUserInfo(longLivedToken, correlationId);
  const instagramAccountId = meUserId || exchangeUserId;
  const tokenExpiresAt =
    expiresIn != null ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  try {
    await saveDoctorInstagram(
      doctorId,
      {
        instagram_page_id: instagramAccountId,
        facebook_page_id: null,
        instagram_access_token: longLivedToken,
        instagram_username: username ?? null,
        facebook_user_id: null,
        instagram_token_expires_at: tokenExpiresAt,
      },
      correlationId
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      const errUrl = buildFrontendConnectRedirect({
        connected: '0',
        error: 'page_already_linked',
      });
      if (errUrl) {
        res.redirect(302, errUrl);
        return;
      }
    }
    throw err;
  }

  await subscribeInstagramAccountApps(instagramAccountId, longLivedToken, correlationId);

  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'connect_instagram',
    resourceType: 'doctor_instagram',
    resourceId: doctorId,
    status: 'success',
  });

  const successUrl = buildFrontendConnectRedirect({ connected: '1' });
  if (successUrl) {
    res.redirect(302, successUrl);
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
