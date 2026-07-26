/**
 * Admin shared-secret guard (doctor-verification-v1 · ver-04).
 *
 * v1 admin authz reuses `CRON_SECRET` as a shared-secret gate — the same
 * model the existing `GET /api/v1/admin/archival-preview` route uses. The
 * ops reviewer holds the secret server-side (curl / internal tool); it is
 * NOT a browser-facing per-admin auth. When a proper admin-role middleware
 * lands (separate plan), these routes swap to it.
 *
 * Accepts the secret via `Authorization: Bearer <secret>` or the
 * `x-cron-secret` header. Throws `UnauthorizedError` on any miss so the
 * global error middleware renders the standard error envelope.
 *
 * NEVER logs the secret. Fails closed when `CRON_SECRET` is unset.
 */

import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

/**
 * Pure predicate: does this request carry a valid `CRON_SECRET`?
 *
 * Accepts the secret via `Authorization: Bearer <secret>` or `x-cron-secret`.
 * Returns `false` (never throws) when `CRON_SECRET` is unset or the token is
 * absent/wrong — so callers that support a fallback path (admin-console-v1's
 * dual-auth guard) can branch on it. NEVER logs the secret.
 */
export function matchesAdminSecret(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = req.headers.authorization;
  const inlineHeader = req.headers['x-cron-secret'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : typeof inlineHeader === 'string'
      ? inlineHeader
      : undefined;

  return !!token && token === secret;
}

export function requireAdminSecret(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!env.CRON_SECRET) {
    throw new UnauthorizedError('Admin access is not configured');
  }

  if (!matchesAdminSecret(req)) {
    throw new UnauthorizedError('Invalid or missing admin secret');
  }

  next();
}
