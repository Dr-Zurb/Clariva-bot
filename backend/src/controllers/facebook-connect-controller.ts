/**
 * Facebook Page connect controller (fbm-03).
 * Validate → service → respond. No DB in controller. No try/catch.
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
  ValidationError,
} from '../utils/errors';
import {
  buildFacebookOAuthUrl,
  createFacebookState,
  disconnectFacebook,
  exchangeFacebookCodeForUserToken,
  exchangeFacebookLongLivedUserToken,
  getFacebookConnectionStatus,
  getFacebookUserId,
  saveDoctorFacebook,
  selectFacebookPageForConnect,
  subscribeFacebookPageApps,
  verifyFacebookState,
} from '../services/facebook-connect-service';
import { isDoctorVerified } from '../services/doctor-verification-service';
import { rewriteOAuthFrontendPathToBridge } from '../utils/oauth-frontend-redirect';

const DOCTOR_VERIFY_FIRST_MESSAGE =
  'Verify your medical registration before connecting Facebook. Open Get verified in the dashboard.';

function buildFrontendFacebookRedirect(opts: {
  connected: '0' | '1';
  error?: string;
}): string | null {
  const configured = env.FACEBOOK_FRONTEND_REDIRECT_URI;
  if (!configured) return null;
  const url = new URL(configured);
  rewriteOAuthFrontendPathToBridge(url, '/auth/facebook-return');
  url.searchParams.set('fb_connected', opts.connected);
  if (opts.error) url.searchParams.set('error', opts.error);
  return url.toString();
}

export const facebookStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const status = await getFacebookConnectionStatus(userId, correlationId);
  res.status(200).json(successResponse(status, req));
});

export const facebookConnectHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const verified = await isDoctorVerified(userId, correlationId);
  if (!verified) {
    throw new DoctorNotVerifiedError(DOCTOR_VERIFY_FIRST_MESSAGE);
  }

  const state = createFacebookState(userId);
  const url = buildFacebookOAuthUrl(state);
  res.status(200).json({ redirectUrl: url });
});

export const facebookCallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const stateParam = typeof req.query.state === 'string' ? req.query.state : undefined;

  if (!code || !stateParam) {
    const errUrl = buildFrontendFacebookRedirect({
      connected: '0',
      error: 'missing_code_or_state',
    });
    if (errUrl) {
      res.redirect(302, errUrl);
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'ValidationError',
        message: 'Missing code or state parameter',
        statusCode: 400,
      },
      meta: { timestamp: new Date().toISOString(), requestId: correlationId },
    });
    return;
  }

  const doctorId = verifyFacebookState(stateParam);

  const verified = await isDoctorVerified(doctorId, correlationId);
  if (!verified) {
    const errUrl = buildFrontendFacebookRedirect({
      connected: '0',
      error: 'doctor_not_verified',
    });
    if (errUrl) {
      res.redirect(302, errUrl);
      return;
    }
    throw new DoctorNotVerifiedError(DOCTOR_VERIFY_FIRST_MESSAGE);
  }

  const { accessToken: shortLived } = await exchangeFacebookCodeForUserToken(
    code,
    correlationId
  );
  const { accessToken: longLived, expiresIn } = await exchangeFacebookLongLivedUserToken(
    shortLived,
    correlationId
  );
  const facebookUserId = await getFacebookUserId(longLived, correlationId);

  let page: Awaited<ReturnType<typeof selectFacebookPageForConnect>>;
  try {
    page = await selectFacebookPageForConnect(longLived, correlationId);
  } catch (err) {
    if (err instanceof ValidationError) {
      const errUrl = buildFrontendFacebookRedirect({
        connected: '0',
        error: 'no_pages',
      });
      if (errUrl) {
        res.redirect(302, errUrl);
        return;
      }
    }
    throw err;
  }

  const pageTokenExpiresAt =
    expiresIn != null ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  try {
    await saveDoctorFacebook(
      doctorId,
      {
        facebook_page_id: page.pageId,
        page_access_token: page.pageAccessToken,
        page_name: page.pageName,
        facebook_user_id: facebookUserId,
        page_token_expires_at: pageTokenExpiresAt,
      },
      correlationId
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      const errUrl = buildFrontendFacebookRedirect({
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

  await subscribeFacebookPageApps(page.pageId, page.pageAccessToken, correlationId);

  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'connect_facebook',
    resourceType: 'doctor_facebook',
    resourceId: doctorId,
    status: 'success',
  });

  const successUrl = buildFrontendFacebookRedirect({ connected: '1' });
  if (successUrl) {
    res.redirect(302, successUrl);
    return;
  }
  res.status(200).json(successResponse({ connected: true }, req));
});

export const facebookDisconnectHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  await disconnectFacebook(userId, correlationId);

  await logAuditEvent({
    correlationId,
    userId,
    action: 'disconnect_facebook',
    resourceType: 'doctor_facebook',
    resourceId: userId,
    status: 'success',
  });

  res.status(204).send();
});
