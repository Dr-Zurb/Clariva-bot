/**
 * Authentication Middleware
 *
 * This file provides authentication middleware for protecting routes.
 * It verifies the Supabase access token and attaches the user to the request.
 *
 * Verification path (np-02):
 * - The token is verified **locally** (HS256 signature + standard claims)
 *   via `utils/supabase-token-verifier.ts`, removing the per-request
 *   `supabase.auth.getUser(token)` network round-trip on the hot path.
 * - Verification **fails closed**: any conclusive failure (bad signature,
 *   expired, wrong audience, malformed, unsigned) returns 401, exactly as
 *   the remote check did before.
 * - A narrow remote `getUser` fallback remains ONLY for genuinely
 *   inconclusive cases (JWT secret not configured, an asymmetric token we
 *   can't verify with the shared secret, or a validly-signed token whose
 *   issuer isn't this project's GoTrue). It is not the common path.
 *
 * Compliance Requirements (see COMPLIANCE.md):
 * - All authentication attempts MUST be audit logged (success and failure)
 * - Failed auth attempts MUST use logSecurityEvent with severity 'medium'
 * - Successful auth MUST use logDataAccess with action 'authenticate'
 *
 * Audit emit (np-03): security/audit events are enqueued with `void` — the
 * request proceeds without awaiting the audit write (lossless async queue +
 * shutdown drain in `utils/audit-logger.ts`).
 *
 * MUST: Use asyncHandler (not try-catch) - see STANDARDS.md
 * MUST: Follow RECIPES.md R-AUTH-001 pattern
 */

import { Request, Response, NextFunction } from 'express';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../config/database';
import { UnauthorizedError } from '../utils/errors';
import { asyncHandler } from '../utils/async-handler';
import { logSecurityEvent, logAuditEvent } from '../utils/audit-logger';
import { verifySupabaseAccessToken } from '../utils/supabase-token-verifier';

/**
 * Resolve a bearer token to an authenticated user.
 *
 * Tries local verification first; only on a genuinely inconclusive verdict
 * does it fall back to the authoritative remote `supabase.auth.getUser`
 * check. A conclusive local rejection (fail closed) returns `null` WITHOUT a
 * remote call — it must never be promoted to "authenticated".
 *
 * @returns the resolved `User`, or `null` when the token is not valid.
 */
async function resolveUserFromToken(token: string): Promise<User | null> {
  const result = verifySupabaseAccessToken(token);

  if (result.status === 'verified') {
    return result.user;
  }

  if (result.status === 'inconclusive') {
    // Narrow, explicit fallback — not the common path. Authoritative and
    // never weaker than the pre-np-02 behaviour.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    return error || !user ? null : user;
  }

  // status === 'rejected' → fail closed.
  return null;
}

/**
 * Authenticate user using Supabase Auth
 *
 * Extracts JWT from Authorization header and verifies with Supabase.
 * Attaches user to req.user (properly typed via types/express.d.ts).
 *
 * Compliance Requirements:
 * - All authentication attempts are audit logged (success and failure)
 * - Failed attempts use logSecurityEvent with severity 'medium' and eventType 'failed_auth'
 * - Successful authentication uses logDataAccess with action 'authenticate' and resourceType 'auth'
 *
 * MUST: Use asyncHandler wrapper (not try-catch) - see STANDARDS.md
 * MUST: Follow RECIPES.md R-AUTH-001 pattern
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 * @throws UnauthorizedError if authentication fails
 */
export const authenticateToken = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Enqueue failed-auth security event (np-03 — non-blocking)
      void logSecurityEvent(
        correlationId,
        undefined, // No user ID (authentication failed)
        'failed_auth',
        'medium',
        ipAddress,
        'Missing or invalid authorization header'
      );
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token locally (fail closed); narrow remote fallback only when inconclusive
    const user = await resolveUserFromToken(token);

    if (!user) {
      // Enqueue failed-auth security event (np-03 — non-blocking)
      void logSecurityEvent(
        correlationId,
        undefined, // No user ID (authentication failed)
        'failed_auth',
        'medium',
        ipAddress,
        'Invalid or expired token'
      );
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Attach user to request (properly typed via types/express.d.ts)
    req.user = user;

    // Enqueue successful authentication (np-03 — non-blocking)
    void logAuditEvent({
      correlationId,
      userId: user.id,
      action: 'authenticate',
      resourceType: 'auth',
      status: 'success',
    });

    next();
  }
);

/**
 * Optionally authenticate user. Does not throw when no token.
 * Use for routes that support both auth (doctor) and token-param (patient) paths.
 *
 * If Authorization header present: verifies and sets req.user.
 * If not present: continues with req.user undefined.
 */
export const optionalAuthenticateToken = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const user = await resolveUserFromToken(token);

    // Present-but-invalid token → continue unauthenticated (same as before np-02).
    if (!user) {
      return next();
    }

    req.user = user;
    void logAuditEvent({
      correlationId,
      userId: user.id,
      action: 'authenticate',
      resourceType: 'auth',
      status: 'success',
    });
    next();
  }
);
