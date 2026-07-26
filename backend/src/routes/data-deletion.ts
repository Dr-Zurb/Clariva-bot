/**
 * Meta Data Deletion Callback (instagram-launch-readiness · ilr-02).
 *
 * Meta POSTs to this URL when a person who authorized the app via Facebook
 * Login removes it (Settings & Privacy → Apps and Websites → Remove app).
 * In Clariva that person is the DOCTOR, so honoring the request means
 * disconnecting their Instagram connection. See meta-data-deletion-service.ts
 * for the identity mapping and deletion-scope rationale.
 *
 * Required response: { url: string, confirmation_code: string }.
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
 */

import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { asyncHandler } from '../utils/async-handler';
import {
  recordAndProcessMetaDeletion,
  getMetaDeletionStatus,
} from '../services/meta-data-deletion-service';

const router = Router();

/**
 * Public frontend origin for the deletion status page. Prefers FRONTEND_URL,
 * falls back to the connect redirect's origin, then a safe default.
 */
function getDataDeletionBaseUrl(): string {
  const configured = env.FRONTEND_URL || env.INSTAGRAM_FRONTEND_REDIRECT_URI;
  if (configured) {
    try {
      const parsed = new URL(configured);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // fall through to default
    }
  }
  return 'https://clariva-bot.vercel.app';
}

function base64UrlDecode(input: string): Buffer {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function parseSignedRequest(signedRequest: string): { user_id?: string } | null {
  const appSecret = env.INSTAGRAM_APP_SECRET || env.META_APP_SECRET;
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.split('.', 2);
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;
  try {
    const sig = base64UrlDecode(encodedSig);
    const data = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    const expectedSig = createHmac('sha256', appSecret).update(payload).digest();
    if (!sig.equals(expectedSig)) {
      logger.warn('Data deletion callback: invalid signature');
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * POST /data-deletion-callback — Meta data-deletion request.
 * Always answers with the Meta-required shape; the service never throws.
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const signedRequest = req.body?.signed_request as string | undefined;

    if (!signedRequest) {
      logger.warn({ correlationId }, 'Data deletion callback: missing signed_request');
      res.status(400).json({ error: 'Missing signed_request' });
      return;
    }

    const data = parseSignedRequest(signedRequest);
    const userId = data?.user_id;

    if (!userId) {
      // Bad/unverifiable payload. Still return a valid shape so Meta does not
      // retry indefinitely, but there is nothing to erase.
      logger.warn({ correlationId }, 'Data deletion callback: unverified or missing user_id');
      const fallbackCode = `del-${Date.now()}-invalid`;
      res.status(200).json({
        url: `${getDataDeletionBaseUrl()}/data-deletion?code=${fallbackCode}`,
        confirmation_code: fallbackCode,
      });
      return;
    }

    const { confirmationCode } = await recordAndProcessMetaDeletion(userId, correlationId);

    res.status(200).json({
      url: `${getDataDeletionBaseUrl()}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  })
);

/**
 * GET /data-deletion-callback/status?code=... — real progress for the status
 * page. Returns 'unknown' for unrecognized codes (no existence leak).
 */
router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const code = typeof req.query.code === 'string' ? req.query.code : '';

    if (!code) {
      res.status(400).json({ error: 'Missing code' });
      return;
    }

    const status = await getMetaDeletionStatus(code, correlationId);
    res.status(200).json({ code, status });
  })
);

export default router;
