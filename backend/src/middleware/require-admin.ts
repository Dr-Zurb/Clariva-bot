/**
 * Admin authorization guard (admin-console-v1 · acon-01).
 *
 * Two ways to prove "I am an admin" for the ops/review surface:
 *
 *   1. **Admin JWT (browser).** A normal Supabase login whose access token
 *      carries `app_metadata.role === 'admin'` — set server-side (never by the
 *      client). The role is reconstructed onto `req.user` by the local token
 *      verifier (`utils/supabase-token-verifier.ts`), so no extra network hop.
 *   2. **CRON_SECRET (ops fallback).** The pre-existing shared-secret path, for
 *      curl / internal tooling. See `middleware/require-admin-secret.ts`.
 *
 * ## Security doctrine
 * - The role is read ONLY from the cryptographically verified JWT — never from
 *   the request body/query. A client cannot self-elevate.
 * - `CRON_SECRET` and the service-role key stay server-side; neither is ever
 *   surfaced to the browser.
 * - Any non-admin authenticated user → 403 (ForbiddenError). Missing/invalid
 *   credentials on the JWT path → 401 (from `authenticateToken`).
 * - The resolved actor is stamped on `req.adminActor` (`user.id` for the JWT
 *   path, `'ops'` for the secret path) so review actions record who acted.
 *
 * MUST: Use asyncHandler (not try-catch) — see STANDARDS.md.
 */

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { asyncHandler } from '../utils/async-handler';
import { ForbiddenError } from '../utils/errors';
import { authenticateToken } from './auth';
import { matchesAdminSecret } from './require-admin-secret';

/** Extract the admin role claim reconstructed onto `req.user` by the verifier. */
function userRole(req: Request): string | undefined {
  const role = req.user?.app_metadata?.role;
  return typeof role === 'string' ? role : undefined;
}

/**
 * Assert the authenticated user is an admin and stamp `req.adminActor`.
 * Requires `authenticateToken` to have already populated `req.user`.
 */
function assertAdminUser(req: Request): void {
  if (userRole(req) !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  // `req.user` is guaranteed present when the role check passes.
  req.adminActor = req.user?.id;
}

/**
 * Guard for routes that already ran `authenticateToken`. Passes iff the user
 * carries the admin role claim; otherwise 403. Sets `req.adminActor`.
 */
export const requireAdmin: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  assertAdminUser(req);
  next();
};

/** Run an Express middleware as a promise (resolves on next(), rejects on err). */
function runMiddleware(
  middleware: RequestHandler,
  req: Request,
  res: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err?: unknown) =>
      err ? reject(err) : resolve(),
    );
  });
}

/**
 * Dual-auth admin guard: admin JWT (browser) OR `CRON_SECRET` (ops).
 *
 * Order matters: the secret is checked first so the ops path never triggers a
 * (failing) JWT verification. When no valid secret is present, the request is
 * treated as a browser admin — `authenticateToken` verifies the token (401 on
 * miss) and the admin role is then enforced (403 on non-admin).
 */
export const requireAdminJwtOrSecret: RequestHandler = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (matchesAdminSecret(req)) {
      req.adminActor = 'ops';
      return next();
    }

    await runMiddleware(authenticateToken, req, res);
    assertAdminUser(req);
    next();
  },
);
