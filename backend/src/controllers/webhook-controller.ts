import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../config/logger';
import { successResponse } from '../utils/response';
import { verifyInstagramSignature } from '../utils/webhook-verification';
import { verifyRazorpaySignature } from '../utils/razorpay-verification';
import { extractInstagramEventId, generateFallbackEventId } from '../utils/webhook-event-id';
import {
  isWebhookProcessed,
  markWebhookProcessing,
} from '../services/webhook-idempotency-service';
import { webhookQueue } from '../config/queue';
import { WEBHOOK_JOB_NAME } from '../types/queue';
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';
import { storeDeadLetterWebhook } from '../services/dead-letter-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';

/**
 * Instagram Webhook Controller
 *
 * Handles Instagram webhook verification and event processing
 * Following Facebook's webhook verification protocol
 *
 * GET /webhooks/instagram - Webhook verification (Facebook sends GET request)
 * POST /webhooks/instagram - Webhook event processing (Facebook sends POST request)
 *
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */

/**
 * Verify Instagram webhook
 * GET /webhooks/instagram
 *
 * Facebook/Instagram sends a GET request to verify the webhook endpoint
 * Query parameters:
 * - hub.mode: Must be 'subscribe'
 * - hub.verify_token: Must match INSTAGRAM_WEBHOOK_VERIFY_TOKEN
 * - hub.challenge: Random string to echo back
 *
 * Response:
 * - 200 OK: Returns hub.challenge if verification succeeds
 * - 403 Forbidden: If verify_token doesn't match
 *
 * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export const verifyInstagramWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    // Debug logging to see what we're receiving
    logger.info(
      {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'ngrok-skip-browser-warning': req.headers['ngrok-skip-browser-warning'],
        },
        rawUrl: req.url,
      },
      'Instagram webhook verification request received'
    );

    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    logger.info(
      {
        mode,
        tokenLength: token?.length,
        challengeLength: challenge?.length,
        hasConfiguredToken: !!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      },
      'Webhook verification parameters'
    );

    // Check if mode is 'subscribe'
    if (mode !== 'subscribe') {
      logger.warn({ mode }, 'Invalid hub.mode received');
      throw new UnauthorizedError('Invalid hub.mode');
    }

    // Check if verify token matches
    if (!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      logger.error('Instagram webhook verify token not configured in environment');
      throw new UnauthorizedError('Instagram webhook verify token not configured');
    }

    if (token !== env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      logger.warn(
        {
          receivedTokenLength: token?.length,
          expectedTokenLength: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN.length,
          tokensMatch: false,
        },
        'Verify token mismatch'
      );
      throw new UnauthorizedError('Invalid verify token');
    }

    logger.info('Webhook verification successful, returning challenge');
    // Return challenge to complete verification
    res.status(200).send(challenge);
  }
);

/**
 * Handle Instagram webhook events
 * POST /webhooks/instagram
 *
 * Processes Instagram webhook events following RECIPES.md R-WEBHOOK-001 pattern:
 * 1. Verify signature FIRST (before any processing)
 * 2. Extract event ID (platform-specific or fallback hash)
 * 3. Check idempotency (prevent duplicates)
 * 4. Mark as processing (prevent race conditions)
 * 5. Queue for async processing (don't block)
 * 6. Return 200 OK immediately (< 20 seconds)
 *
 * IMPORTANT:
 * - NEVER log req.body (contains PII/PHI)
 * - Only log metadata (event_id, provider, correlation_id)
 * - Signature verification is MANDATORY (security requirement)
 * - Idempotency prevents duplicate processing (reliability)
 * - Fast response prevents platform retries (reliability)
 *
 * Response:
 * - 200 OK: Webhook queued for processing (idempotent if already processed)
 * - 401 Unauthorized: Invalid webhook signature
 *
 * @see RECIPES.md - R-WEBHOOK-001 pattern
 * @see WEBHOOKS.md - Webhook processing rules
 * @see COMPLIANCE.md - Webhook security requirements (section H)
 */
export const handleInstagramWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';

    // Log immediately so Render shows every POST to this endpoint (even if signature fails later)
    logger.info(
      { correlationId, path: req.path, method: req.method },
      'Instagram webhook POST received (verifying signature)'
    );

    // ⚠️ CRITICAL: NEVER log req.body for webhooks
    // Platform payloads may contain patient identifiers (PII/PHI)
    // Only log metadata: correlationId, eventId, provider, status

    // Step 1: Verify signature FIRST (MANDATORY - before any processing)
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    // Use raw body if available (from express.json verify callback), otherwise reconstruct
    // Note: Reconstructed body may have different formatting, but signature should still verify
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    if (!verifyInstagramSignature(signature, rawBody, correlationId)) {
      // Log security event (never log req.body or signature)
      await logSecurityEvent(
        correlationId,
        undefined, // No user context
        'webhook_signature_failed',
        'high',
        req.ip
      );
      throw new UnauthorizedError('Invalid webhook signature');
    }

    // Step 2: Extract event ID (platform-specific or fallback hash)
    let eventId = extractInstagramEventId(req.body);
    if (!eventId) {
      eventId = generateFallbackEventId(req.body);
    }

    // Step 3: Check idempotency (prevent duplicates)
    try {
      const existing = await isWebhookProcessed(eventId, 'instagram');

      if (existing && existing.status === 'processed') {
        // Already processed - return 200 OK immediately (idempotent response)
        logger.info(
          {
            eventId,
            correlationId,
            provider: 'instagram',
            status: 'idempotent',
          },
          'Webhook already processed (idempotent response)'
        );
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch (error) {
      // Fail-open: Log error but allow webhook through
      // Prevents blocking legitimate webhooks due to database issues
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Idempotency check failed (allowing webhook through)'
      );
      // Continue with processing (don't block webhook)
    }

    // Step 4: Mark as processing (prevent race conditions)
    try {
      await markWebhookProcessing(eventId, 'instagram', correlationId);
    } catch (error) {
      // Fail-open: Log error but allow webhook through
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Failed to mark webhook as processing (allowing webhook through)'
      );
      // Continue with processing (don't block webhook)
    }

    // Step 5: Queue for async processing (don't block)
    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'instagram',
        payload: req.body as any, // Type assertion - payload is validated by signature
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Fallback: Store in dead letter queue immediately if queue fails
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Queue error (storing in dead letter queue)'
      );

      try {
        await storeDeadLetterWebhook(
          eventId,
          'instagram',
          req.body,
          `Queue error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          0, // No retries (failed immediately)
          correlationId
        );
      } catch (dlqError) {
        // If dead letter queue also fails, log but still return 200 OK
        // Platform expects 200 OK - we'll handle the failure internally
        logger.error(
          {
            error: dlqError,
            eventId,
            correlationId,
            provider: 'instagram',
          },
          'Failed to store in dead letter queue (webhook lost)'
        );
      }

      // Still return 200 OK (webhook was received, even if queuing failed)
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Log so Render/runtime logs show webhook receipt (search for "Instagram webhook queued")
    logger.info(
      { correlationId, eventId, provider: 'instagram' },
      'Instagram webhook queued for processing'
    );
    // Audit log (metadata only - NEVER log req.body)
    // resourceId omitted: eventId is Instagram entry ID (numeric string), audit_logs.resource_id is UUID
    await logAuditEvent({
      correlationId,
      userId: undefined, // System operation
      action: 'webhook_received',
      resourceType: 'webhook',
      status: 'success',
      metadata: {
        event_id: eventId,
        provider: 'instagram',
        received_at: new Date().toISOString(),
      },
    });

    // Step 6: Return 200 OK immediately (< 20 seconds for Meta)
    res.status(200).json(successResponse({ message: 'OK' }, req));
    return;
  }
);

// ============================================================================
// Payment Webhooks (e-task-4)
// ============================================================================

/**
 * Handle Razorpay webhook
 * POST /webhooks/razorpay
 *
 * Same pattern as Instagram: verify signature -> idempotency -> queue -> 200 OK
 */
export const handleRazorpayWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    if (!verifyRazorpaySignature(signature, rawBody, correlationId)) {
      await logSecurityEvent(
        correlationId,
        undefined,
        'webhook_signature_failed',
        'high',
        req.ip
      );
      throw new UnauthorizedError('Invalid Razorpay webhook signature');
    }

    const eventId =
      (req.headers['x-razorpay-event-id'] as string) ||
      razorpayAdapter.extractEventId(req.body, req.headers as Record<string, string | undefined>);

    try {
      const existing = await isWebhookProcessed(eventId, 'razorpay');
      if (existing?.status === 'processed') {
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch {
      // Fail-open
    }

    try {
      await markWebhookProcessing(eventId, 'razorpay', correlationId);
    } catch {
      // Fail-open
    }

    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'razorpay',
        payload: req.body,
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await storeDeadLetterWebhook(
          eventId,
          'razorpay',
          req.body,
          error instanceof Error ? error.message : 'Unknown error',
          0,
          correlationId
        );
      } catch {
        // Ignore
      }
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    res.status(200).json(successResponse({ message: 'OK' }, req));
  }
);

/**
 * Handle PayPal webhook
 * POST /webhooks/paypal
 *
 * PayPal verification is async (API call). Same pattern otherwise.
 */
export const handlePayPalWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    const headers: Record<string, string | undefined> = {
      'paypal-auth-algo': req.headers['paypal-auth-algo'] as string,
      'paypal-cert-url': req.headers['paypal-cert-url'] as string,
      'paypal-transmission-id': req.headers['paypal-transmission-id'] as string,
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'] as string,
      'paypal-transmission-time': req.headers['paypal-transmission-time'] as string,
    };

    const isValid = await paypalAdapter.verifyWebhook(
      req.headers['paypal-transmission-sig'] as string,
      rawBody,
      headers
    );

    if (!isValid) {
      await logSecurityEvent(
        correlationId,
        undefined,
        'webhook_signature_failed',
        'high',
        req.ip
      );
      throw new UnauthorizedError('Invalid PayPal webhook signature');
    }

    const eventId =
      (req.headers['paypal-transmission-id'] as string) ||
      paypalAdapter.extractEventId(req.body, req.headers as Record<string, string | undefined>);

    try {
      const existing = await isWebhookProcessed(eventId, 'paypal');
      if (existing?.status === 'processed') {
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch {
      // Fail-open
    }

    try {
      await markWebhookProcessing(eventId, 'paypal', correlationId);
    } catch {
      // Fail-open
    }

    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'paypal',
        payload: req.body,
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await storeDeadLetterWebhook(
          eventId,
          'paypal',
          req.body,
          error instanceof Error ? error.message : 'Unknown error',
          0,
          correlationId
        );
      } catch {
        // Ignore
      }
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    res.status(200).json(successResponse({ message: 'OK' }, req));
  }
);
