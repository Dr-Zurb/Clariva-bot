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

/**
 * Replay-mint (Plan 07 · Task 29).
 *
 * `POST /api/v1/consultation/:sessionId/replay/audio/mint` is the
 * costly endpoint — it writes an audit row and (on grant) calls Twilio
 * for a signed URL. Legitimate playback re-mints at most ~4 times per
 * hour (15-min URL TTL); 10 gives headroom for reconnects + speed-
 * scrubbing. Beyond 10 → 429.
 *
 * Rationale: protect against a malicious loop trying to enumerate /
 * stress the audit log. Doesn't gate `getReplayAvailability` —
 * that's the read-only preflight and stays cheap.
 *
 * Keying: by IP (covers the unauthenticated-spam case) + sessionId
 * from the URL (covers the rare legit cross-IP doctor-on-mobile
 * pattern). One window per `(ip, sessionId)` pair so a single
 * mis-behaving session doesn't lock a doctor out of OTHER consults.
 */
export const replayMintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req: Request) => {
    const ip = ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false);
    const sessionId = (req.params as { sessionId?: string }).sessionId ?? 'unknown';
    return `${ip}:${sessionId}`;
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Replay mint rate limit exceeded'
    );
    const error = new TooManyRequestsError(
      'Too many replay requests for this consultation; please wait and try again.'
    );
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Public OPD session snapshot / early-join (e-task-opd-04).
 * Token auth; limit by IP per RATE_LIMITING.md (public unauthenticated API).
 */
/**
 * Public mode-schedule bulk resolver (pdm-07 / DL-16).
 * 30 req/min per IP — booking widget date picker.
 */
export const publicModeScheduleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) => {
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false);
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Public mode-schedule rate limit exceeded'
    );
    const error = new TooManyRequestsError('Too many mode-schedule requests, please try again later.');
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

export const publicSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req: Request) => {
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false);
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip
    );
    const error = new TooManyRequestsError('Too many session requests, please try again later.');
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Public signup email-status preflight (auth-password · AP-D17).
 * 20 req/min per IP — intentional existence check; keep enumeration slow.
 */
export const publicAuthEmailStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req: Request) => {
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false);
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Public auth email-status rate limit exceeded'
    );
    const error = new TooManyRequestsError(
      'Too many requests. Wait a moment and try again.'
    );
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Doctor-facing receptionist create (one seat). 5 / hour per doctor.
 */
export const clinicStaffProvisionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => {
    const userId = req.user?.id?.trim();
    if (userId) {
      return `clinic-staff:${userId}`;
    }
    return `clinic-staff:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false)}`;
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      req.user?.id,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Clinic staff provision rate limit exceeded'
    );
    const error = new TooManyRequestsError(
      'Too many receptionist invites. Wait a bit and try again.'
    );
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Visit-narrative extraction (vnt-02). Paid mini-tier call over a long
 * transcript — 8 / hour per doctor + session.
 */
export const visitNarrativeExtractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyGenerator: (req: Request) => {
    const userId = req.user?.id?.trim();
    const sessionId =
      typeof req.body?.consultationSessionId === 'string'
        ? req.body.consultationSessionId
        : 'unknown';
    if (userId) {
      return `vn-extract:${userId}:${sessionId}`;
    }
    return `vn-extract:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false)}:${sessionId}`;
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      req.user?.id,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Visit narrative extract rate limit exceeded'
    );
    const error = new TooManyRequestsError(
      'Too many transcript reviews for this consult. Wait a bit and try again.'
    );
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Lab report extraction (rpt-05.6) — 60 / hour per doctor + prescription.
 *
 * Covers both readers on `…/extract-lab`, because the route cannot know the
 * attachment's MIME without a DB read. Sized for the PDF path it also gates:
 * a Reports strip holds up to `REPORT_SCAN_MAX_FILES` (24) pages and
 * "Extract all" fires one request each, so the cap has to clear a full batch
 * plus retries. What it actually exists to stop is a runaway loop against the
 * paid vision reader.
 */
export const labExtractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req: Request) => {
    const userId = req.user?.id?.trim();
    const prescriptionId =
      typeof req.params?.id === 'string' && req.params.id ? req.params.id : 'unknown';
    if (userId) {
      return `lab-extract:${userId}:${prescriptionId}`;
    }
    return `lab-extract:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', false)}:${prescriptionId}`;
  },
  handler: async (req: Request, res: Response) => {
    await logSecurityEvent(
      req.correlationId || 'unknown',
      req.user?.id,
      'rate_limit_exceeded',
      'medium',
      req.ip,
      'Lab extract rate limit exceeded'
    );
    const error = new TooManyRequestsError(
      'Too many report extractions for this visit. Wait a bit and try again.'
    );
    return res.status(429).json(
      errorResponse(
        {
          code: 'TooManyRequestsError',
          message: error.message,
          statusCode: 429,
        },
        req
      )
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});
