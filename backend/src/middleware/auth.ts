/**
 * Authentication Middleware
 *
 * This file provides authentication middleware for protecting routes.
 * Verifies JWT tokens using Supabase Auth and attaches user to request.
 *
 * Compliance Requirements (see COMPLIANCE.md):
 * - All authentication attempts MUST be audit logged (success and failure)
 * - Failed auth attempts MUST use logSecurityEvent with severity 'medium'
 * - Successful auth MUST use logDataAccess with action 'authenticate'
 *
 * MUST: Use asyncHandler (not try-catch) - see STANDARDS.md
 * MUST: Follow RECIPES.md R-AUTH-001 pattern
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';
import { UnauthorizedError } from '../utils/errors';
import { asyncHandler } from '../utils/async-handler';
import { logSecurityEvent, logAuditEvent } from '../utils/audit-logger';

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
      // Audit log failed authentication attempt
      await logSecurityEvent(
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

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Audit log failed authentication attempt
      await logSecurityEvent(
        correlationId,
        undefined, // No user ID (authentication failed)
        'failed_auth',
        'medium',
        ipAddress,
        error?.message || 'Invalid or expired token'
      );
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Attach user to request (properly typed via types/express.d.ts)
    req.user = user;

    // Audit log successful authentication
    // Use logAuditEvent directly to set action='authenticate' (logDataAccess uses 'read_*')
    await logAuditEvent({
      correlationId,
      userId: user.id,
      action: 'authenticate',
      resourceType: 'auth',
      status: 'success',
    });

    next();
  }
);
