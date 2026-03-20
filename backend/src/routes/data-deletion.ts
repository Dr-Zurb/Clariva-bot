/**
 * Meta Data Deletion Callback
 *
 * Meta POSTs to this URL when a user requests data deletion via
 * Settings & Privacy → Settings → Apps and Websites → Remove app.
 *
 * Required response: { url: string, confirmation_code: string }
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
 */

import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

const router = Router();

// Frontend base URL for status page (user can check deletion status)
// Set FRONTEND_URL or use INSTAGRAM_FRONTEND_REDIRECT_URI base (e.g. https://clariva-bot.vercel.app)
const getDataDeletionBaseUrl = (): string => {
  const u = process.env.FRONTEND_URL || process.env.INSTAGRAM_FRONTEND_REDIRECT_URI;
  if (u) {
    try {
      const parsed = new URL(u);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // fallback
    }
  }
  return 'https://clariva-bot.vercel.app';
};

function base64UrlDecode(input: string): Buffer {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function parseSignedRequest(signedRequest: string): { user_id?: string } | null {
  if (!signedRequest || !env.INSTAGRAM_APP_SECRET) return null;
  const parts = signedRequest.split('.', 2);
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;
  try {
    const sig = base64UrlDecode(encodedSig);
    const data = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    const expectedSig = createHmac('sha256', env.INSTAGRAM_APP_SECRET)
      .update(payload)
      .digest();
    if (!sig.equals(expectedSig)) {
      logger.warn('Data deletion callback: invalid signature');
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

router.post('/', (req: Request, res: Response) => {
  const correlationId = (req as { correlationId?: string }).correlationId || 'unknown';
  const signedRequest = req.body?.signed_request as string | undefined;

  if (!signedRequest) {
    logger.warn({ correlationId }, 'Data deletion callback: missing signed_request');
    res.status(400).json({ error: 'Missing signed_request' });
    return;
  }

  const data = parseSignedRequest(signedRequest);
  const userId = data?.user_id;

  if (userId) {
    logger.info(
      { correlationId, userId },
      'Data deletion request received from Meta (queue for processing)'
    );
    // TODO: Queue actual deletion job - match userId to our stored user/patient data
    // For now we acknowledge; implement deletion in worker when user mapping is clear
  }

  const confirmationCode = `del-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const statusUrl = `${getDataDeletionBaseUrl()}/data-deletion?code=${confirmationCode}`;

  res.status(200).json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
});

export default router;
