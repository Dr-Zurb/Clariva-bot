/**
 * Rate Limiter Middleware
 *
 * Centralized rate limiter configurations for different route types.
 * Each limiter is configured with appropriate limits and error handling.
 *
 * IMPORTANT:
 * - All rate limiters MUST use canonical error format via handler
 * - Rate limit violations MUST be logged as security events
 * - See RECIPES.md R-RATE-LIMIT-001 for pattern
 */

import { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { TooManyRequestsError } from '../utils/errors';
import { errorResponse } from '../utils/response';
import { logSecurityEvent } from '../utils/audit-logger';

// Webhook-specific rate limiter (higher limit for Meta platform webhooks)
// MUST: Use canonical error format via handler (not message) per RECIPES.md R-RATE-LIMIT-001
// MUST: Audit log rate limit violations per COMPLIANCE.md
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for webhooks (Meta sends many webhooks)
  keyGenerator: (req: Request) => {
    // Use ipKeyGenerator helper to properly handle IPv6 addresses
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false);
  }, // IP-based (webhooks come from Meta IPs)
  handler: async (req: Request, res: Response) => {
    // Log rate limit violation
    await logSecurityEvent(
      req.correlationId || 'unknown',
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip
    );
    const error = new TooManyRequestsError('Too many webhook requests, please try again later.');
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});
